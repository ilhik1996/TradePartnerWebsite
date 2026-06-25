import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/dashboard_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/services/websocket_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrapWithRouter() {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => const DashboardScreen()),
    GoRoute(path: '/wallet',       builder: (_, __) => const SizedBox()),
    GoRoute(path: '/profile',      builder: (_, __) => const SizedBox()),
    GoRoute(path: '/history',      builder: (_, __) => const SizedBox()),
    GoRoute(path: '/referrals',    builder: (_, __) => const SizedBox()),
    GoRoute(path: '/subscription', builder: (_, __) => const SizedBox()),
    GoRoute(path: '/partners',     builder: (_, __) => const SizedBox()),
    GoRoute(path: '/notifications',builder: (_, __) => const SizedBox()),
  ]);
  return ProviderScope(
    child: MaterialApp.router(theme: VionaTheme.dark, routerConfig: router),
  );
}

const _meResponse = {
  'id': 1, 'email': 'u@t.com', 'countryId': 1,
  'autoParticipate': true, 'referralCode': 'CODE42',
};
const _countryResponse = {
  'id': 1, 'name': 'Ukraine', 'currencySymbol': '₴',
  'prizePercentage': '50', 'entryAmountDaily': '5',
  'drawHourUtc': 21,
};
const _walletResponse = {'balance': '100.00', 'currency': 'UAH'};
const _drawResponse = {
  'id': 7, 'status': 'open', 'totalPool': '1000.00', 'totalEntries': 42,
};
const _profileResponse = {'firstName': 'Alice', 'lastName': 'Smith'};

void _stubLoad(
  DioAdapter adapter, {
  Map<String, dynamic> me = _meResponse,
  Map<String, dynamic> country = _countryResponse,
  Map<String, dynamic> wallet = _walletResponse,
  Map<String, dynamic>? draw = _drawResponse,
  Map<String, dynamic> profile = _profileResponse,
  dynamic myEntry,
}) {
  adapter.onGet('/auth/me',          (s) => s.reply(200, me));
  adapter.onGet('/countries/1',      (s) => s.reply(200, country));
  adapter.onGet('/wallet',           (s) => s.reply(200, wallet));
  adapter.onGet('/profile',          (s) => s.reply(200, profile));
  if (draw != null) {
    adapter.onGet('/draws/today/1',  (s) => s.reply(200, draw));
    adapter.onGet('/draws/7/my-entry', (s) => s.reply(200, myEntry));
  } else {
    adapter.onGet('/draws/today/1',  (s) => s.reply(404, {}));
  }
}

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() {
    adapter.close();
    // Prevent WebSocket reconnect timer from leaking between tests
    WebSocketService().disconnect();
  });

  // ── Loading & error states ─────────────────────────────────────────────────

  testWidgets('shows loading indicator on initial render', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrapWithRouter());
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error state with Retry on API failure', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(500, {}));
    adapter.onGet('/draws/today/1', (s) => s.reply(200, _drawResponse));
    adapter.onGet('/wallet',        (s) => s.reply(200, _walletResponse));
    adapter.onGet('/profile',       (s) => s.reply(200, _profileResponse));
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.text('Could not load dashboard'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  // ── Successful load ────────────────────────────────────────────────────────

  testWidgets('shows VIONA branding after load', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.text('VIONA'), findsOneWidget);
  });

  testWidgets('shows greeting with first name from profile', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.text('Hi, Alice'), findsOneWidget);
  });

  testWidgets('shows wallet balance', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.text('₴100.00'), findsOneWidget);
  });

  testWidgets('shows Enter draw button with entry amount when not entered', (tester) async {
    _stubLoad(adapter, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.textContaining('Enter draw — ₴5.00'), findsOneWidget);
  });

  testWidgets('shows "Top up to enter" when balance is insufficient', (tester) async {
    _stubLoad(adapter, wallet: {'balance': '2.00', 'currency': 'UAH'}, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.textContaining('Top up to enter'), findsOneWidget);
  });

  testWidgets('shows entry status card when already entered', (tester) async {
    _stubLoad(adapter, myEntry: {'ticketNumber': 17, 'type': 'paid'});
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.textContaining("You're in today's draw!"), findsOneWidget);
    expect(find.textContaining('Ticket #17'), findsOneWidget);
  });

  testWidgets('shows Free entry button when not yet entered', (tester) async {
    _stubLoad(adapter, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.textContaining('Free entry'), findsOneWidget);
  });

  // ── No draw today ──────────────────────────────────────────────────────────

  testWidgets('shows Top up balance button even when no draw today', (tester) async {
    _stubLoad(adapter, draw: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.text('Top up balance'), findsOneWidget);
  });

  // ── Auto-participate toggle ────────────────────────────────────────────────

  testWidgets('auto-participate toggle is shown', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.text('Auto-participate'), findsOneWidget);
    expect(find.byType(Switch), findsOneWidget);
  });

  testWidgets('auto-participate toggle reflects user setting', (tester) async {
    _stubLoad(adapter, me: {..._meResponse, 'autoParticipate': false});
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    final sw = tester.widget<Switch>(find.byType(Switch));
    expect(sw.value, isFalse);
  });

  // ── Quick nav grid ────────────────────────────────────────────────────────

  testWidgets('shows all quick navigation links', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    expect(find.text('Account'), findsOneWidget);
    expect(find.text('History'), findsOneWidget);
    expect(find.text('Wallet'), findsOneWidget);
    expect(find.text('Refer'), findsOneWidget);
    expect(find.text('Subscribe'), findsOneWidget);
    expect(find.text('Partners'), findsOneWidget);
  });

  // ── Free entry bottom sheet ────────────────────────────────────────────────

  testWidgets('tapping Free entry opens the free entry sheet', (tester) async {
    _stubLoad(adapter, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Free entry'));
    await tester.pumpAndSettle();
    expect(find.text('Get free ticket'), findsOneWidget);
  });

  // ── Free entry form submission ─────────────────────────────────────────────

  testWidgets('free entry form has name and email fields', (tester) async {
    _stubLoad(adapter, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Free entry'));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsWidgets);
    expect(
      find.byWidgetPredicate((w) => w is TextField && (w.decoration?.hintText?.contains('Full name') == true)),
      findsOneWidget,
    );
    expect(
      find.byWidgetPredicate((w) => w is TextField && (w.decoration?.hintText?.contains('email') == true || w.decoration?.hintText?.contains('Email') == true)),
      findsOneWidget,
    );
  });

  testWidgets('Get free ticket button is disabled when fields are empty', (tester) async {
    _stubLoad(adapter, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Free entry'));
    await tester.pumpAndSettle();
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Get free ticket'),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('submitting free entry form calls enterFree and shows ticket snackbar', (tester) async {
    _stubLoad(adapter, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Free entry'));
    await tester.pumpAndSettle();

    adapter.onPost('/draws/7/enter-free', (s) => s.reply(200, {'ticketNumber': 55}));
    // After success, _loadData() is called again
    _stubLoad(adapter, myEntry: {'ticketNumber': 55, 'type': 'free'});

    final nameField = find.byWidgetPredicate(
      (w) => w is TextField && (w.decoration?.hintText?.contains('Full name') == true),
    );
    final emailField = find.byWidgetPredicate(
      (w) => w is TextField && (w.decoration?.hintText?.contains('mail') == true || w.decoration?.hintText?.contains('Mail') == true),
    );
    await tester.enterText(nameField, 'Alice Smith');
    await tester.enterText(emailField, 'alice@example.com');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Get free ticket'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Ticket #55'), findsOneWidget);
  });

  // ── Paid entry flow ─────────────────────────────────────────────────────────

  testWidgets('tapping Enter draw button calls enterDraw API', (tester) async {
    _stubLoad(adapter, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();

    adapter.onPost('/draws/7/enter', (s) => s.reply(200, {'ticketNumber': 12}));
    _stubLoad(adapter, myEntry: {'ticketNumber': 12, 'type': 'paid'});

    await tester.tap(find.textContaining('Enter draw'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Ticket #12'), findsOneWidget);
  });

  testWidgets('shows error snackbar when enterDraw fails', (tester) async {
    _stubLoad(adapter, myEntry: null);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();

    adapter.onPost('/draws/7/enter', (s) => s.reply(402, {'message': 'Insufficient balance'}));

    await tester.tap(find.textContaining('Enter draw'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Could not enter'), findsOneWidget);
  });
}
