import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/subscription_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: child);

const _countryUah = {
  'id': 1, 'name': 'Ukraine', 'currencySymbol': '₴',
  'entryAmountDaily': '5', 'entryAmountWeekly': '30', 'entryAmountMonthly': '100',
};
const _meResponse = {'id': 1, 'email': 'u@t.com', 'countryId': 1};
const _noSubscription = null;
const _activeWeekly = {
  'id': 1, 'type': 'weekly', 'status': 'active',
  'nextBillingDate': '2025-07-01T00:00:00Z', 'amount': '30.00',
};

void _stubLoad(
  DioAdapter adapter, {
  dynamic subscription = _noSubscription,
  Map<String, dynamic> me = _meResponse,
  Map<String, dynamic> country = _countryUah,
  List<dynamic> history = const [],
}) {
  // Server returns 200 with null body when no subscription exists
  adapter.onGet('/subscription',         (s) => s.reply(200, subscription));
  adapter.onGet('/auth/me',              (s) => s.reply(200, me));
  adapter.onGet('/subscription/history', (s) => s.reply(200, history));
  adapter.onGet('/countries/1',          (s) => s.reply(200, country));
}

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  // ── Loading & error ────────────────────────────────────────────────────────

  testWidgets('shows loading indicator on initial render', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error state with Retry on API failure', (tester) async {
    adapter.onGet('/subscription', (s) => s.reply(500, {}));
    adapter.onGet('/auth/me', (s) => s.reply(500, {}));
    adapter.onGet('/subscription/history', (s) => s.reply(200, []));
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load subscription data'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('Retry reloads after error', (tester) async {
    adapter.onGet('/subscription', (s) => s.reply(500, {}));
    adapter.onGet('/auth/me', (s) => s.reply(500, {}));
    adapter.onGet('/subscription/history', (s) => s.reply(200, []));
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();

    _stubLoad(adapter);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Weekly'), findsOneWidget);
  });

  // ── Plan cards ─────────────────────────────────────────────────────────────

  testWidgets('shows Weekly and Monthly plan cards', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Weekly'), findsOneWidget);
    expect(find.text('Monthly'), findsOneWidget);
  });

  testWidgets('shows prices from country config', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.text('₴30.00'), findsOneWidget);  // weekly
    expect(find.text('₴100.00'), findsOneWidget); // monthly
  });

  testWidgets('shows Popular badge on Monthly plan', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Popular'), findsOneWidget);
  });

  testWidgets('Subscribe Weekly button is present when no active subscription', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ElevatedButton, 'Subscribe Weekly'), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Subscribe Monthly'), findsOneWidget);
  });

  // ── Active subscription ────────────────────────────────────────────────────

  testWidgets('shows active subscription banner when subscribed', (tester) async {
    _stubLoad(adapter, subscription: _activeWeekly);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Weekly subscription active'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Cancel subscription'), findsOneWidget);
  });

  testWidgets('shows renewal date in active subscription banner', (tester) async {
    _stubLoad(adapter, subscription: _activeWeekly);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Renews: 2025-07-01'), findsOneWidget);
  });

  testWidgets('Subscribe buttons are absent when subscription is active', (tester) async {
    _stubLoad(adapter, subscription: _activeWeekly);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ElevatedButton, 'Subscribe Weekly'), findsNothing);
    expect(find.widgetWithText(ElevatedButton, 'Subscribe Monthly'), findsNothing);
    // Active plan shows 'Current plan' instead
    expect(find.text('Current plan'), findsOneWidget);
  });

  // ── Subscribe action ───────────────────────────────────────────────────────

  testWidgets('subscribing weekly creates subscription and reloads', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();

    adapter.onPost('/subscription', (s) => s.reply(200, _activeWeekly));
    _stubLoad(adapter, subscription: _activeWeekly);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Subscribe Weekly'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Weekly subscription active'), findsOneWidget);
  });

  testWidgets('subscribe error shows snackbar', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();

    adapter.onPost('/subscription', (s) => s.reply(402, {'message': 'Insufficient balance'}));

    await tester.tap(find.widgetWithText(ElevatedButton, 'Subscribe Weekly'));
    await tester.pumpAndSettle();

    expect(find.byType(SnackBar), findsOneWidget);
  });

  // ── Cancel subscription ────────────────────────────────────────────────────

  testWidgets('cancel shows confirmation dialog', (tester) async {
    _stubLoad(adapter, subscription: _activeWeekly);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel subscription'));
    await tester.pumpAndSettle();

    expect(find.text('Cancel subscription?'), findsOneWidget);
    expect(find.text('Keep it'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
  });

  testWidgets('keeping subscription closes dialog without cancelling', (tester) async {
    _stubLoad(adapter, subscription: _activeWeekly);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel subscription'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep it'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Weekly subscription active'), findsOneWidget);
  });

  testWidgets('confirming cancel removes active subscription', (tester) async {
    _stubLoad(adapter, subscription: _activeWeekly);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel subscription'));
    await tester.pumpAndSettle();

    adapter.onDelete('/subscription/1', (s) => s.reply(200, {}));
    _stubLoad(adapter); // reload shows no active subscription

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Weekly subscription active'), findsNothing);
    expect(find.widgetWithText(ElevatedButton, 'Subscribe Weekly'), findsOneWidget);
  });

  // ── Subscription history ───────────────────────────────────────────────────

  testWidgets('shows subscription history when present', (tester) async {
    _stubLoad(adapter, history: [
      {
        'id': 1, 'type': 'weekly', 'status': 'cancelled', 'amount': '30.00',
        'startDate': '2025-05-01T00:00:00Z',
      },
    ]);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.text('History'), findsOneWidget);
    expect(find.textContaining('Weekly subscription'), findsOneWidget);
    expect(find.text('cancelled'), findsOneWidget);
  });

  testWidgets('no History section shown when history is empty', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const SubscriptionScreen()));
    await tester.pumpAndSettle();
    expect(find.text('History'), findsNothing);
  });
}
