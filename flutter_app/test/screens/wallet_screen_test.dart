import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/wallet_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: child);

const _walletData = {'balance': '250.00', 'currency': 'UAH'};
const _countryData = {
  'id': 1, 'name': 'Ukraine', 'currencySymbol': '₴',
  'currency': 'UAH', 'drawHourUtc': 21,
};
const _userData = {'id': 1, 'email': 'u@t.com', 'countryId': 1, 'kycLevel': 'age_verified'};
const _noTxs = <dynamic>[];

void _stubLoad(DioAdapter adapter, {
  Map<String, dynamic> wallet = _walletData,
  Map<String, dynamic> country = _countryData,
  Map<String, dynamic> user = _userData,
  List<dynamic> txs = _noTxs,
}) {
  adapter.onGet('/wallet',      (s) => s.reply(200, wallet));
  adapter.onGet('/wallet/transactions?limit=20&offset=0',
                               (s) => s.reply(200, txs));
  adapter.onGet('/auth/me',    (s) => s.reply(200, user));
  adapter.onGet('/countries/1', (s) => s.reply(200, country));
}

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  // ── Loading & error states ─────────────────────────────────────────────────

  testWidgets('shows loading indicator on initial render', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows balance after data loads', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    expect(find.text('₴250.00'), findsOneWidget);
  });

  testWidgets('shows currency symbol from country', (tester) async {
    _stubLoad(adapter, country: {..._countryData, 'currencySymbol': '\$'});
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    expect(find.text('\$250.00'), findsOneWidget);
  });

  testWidgets('shows error state with retry on API failure', (tester) async {
    adapter.onGet('/wallet', (s) => s.reply(500, {'message': 'error'}));
    adapter.onGet('/wallet/transactions?limit=20&offset=0', (s) => s.reply(200, []));
    adapter.onGet('/auth/me', (s) => s.reply(500, {'message': 'error'}));
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load wallet'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  // ── Tab navigation ─────────────────────────────────────────────────────────

  testWidgets('shows Top Up tab by default', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Top Up'), findsOneWidget);
    expect(find.text('Withdraw'), findsOneWidget);
  });

  testWidgets('switching to Withdraw tab shows withdrawal UI', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Withdraw'));
    await tester.pumpAndSettle();
    expect(find.text('Request withdrawal'), findsOneWidget);
  });

  // ── KYC gate ──────────────────────────────────────────────────────────────

  testWidgets('shows KYC warning when user has no verification', (tester) async {
    _stubLoad(adapter, user: {..._userData, 'kycLevel': 'none'});
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Age verification required'), findsOneWidget);
  });

  testWidgets('deposit button is disabled for unverified users', (tester) async {
    _stubLoad(adapter, user: {..._userData, 'kycLevel': 'none'});
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Verify age to deposit'),
    );
    expect(button.onPressed, isNull);
  });

  // ── Deposit ───────────────────────────────────────────────────────────────

  testWidgets('quick-amount chip selects amount in input field', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('₴10'));
    await tester.pump();
    expect(find.text('Add ₴10'), findsOneWidget);
  });

  testWidgets('successful deposit clears amount field', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();

    adapter.onPost(
      '/wallet/deposit',
      (s) => s.reply(200, {'newBalance': 350.0}),
      data: {'amount': 10.0, 'currency': 'UAH'},
    );
    // _load() is called again after deposit
    _stubLoad(adapter, wallet: {'balance': '350.00', 'currency': 'UAH'});

    await tester.tap(find.text('₴10'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Add ₴10'));
    await tester.pumpAndSettle();

    // After deposit the amount should be cleared (the fix we tested)
    // Field value is empty, so button shows "Add ₴0.00"
    expect(find.text('Add ₴0.00'), findsOneWidget);
  });

  // ── Transaction history ───────────────────────────────────────────────────

  testWidgets('shows transaction tiles in Top Up tab', (tester) async {
    final txs = [
      {
        'id': 1, 'type': 'deposit', 'amount': '100.00',
        'description': 'Credit card top up', 'createdAt': '2025-06-01T10:00:00Z',
      },
    ];
    _stubLoad(adapter, txs: txs);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Deposit'), findsOneWidget);
    expect(find.text('Credit card top up'), findsOneWidget);
  });

  testWidgets('prize payout transaction shows positive amount', (tester) async {
    final txs = [
      {
        'id': 2, 'type': 'prize_payout', 'amount': '500.00',
        'description': 'Draw #42 prize', 'createdAt': '2025-06-02T21:00:00Z',
      },
    ];
    _stubLoad(adapter, txs: txs);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();
    expect(find.text('+500.00'), findsOneWidget);
  });

  // ── Mounted guard regression ───────────────────────────────────────────────

  testWidgets('clearing deposit field after unmount does not throw (regression)', (tester) async {
    // Guards against the use-after-dispose bug fixed in _deposit():
    // _amountCtrl.clear() must not run if the widget was unmounted
    // while the deposit API call was in-flight.
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();

    // Slow deposit response gives us time to unmount before the callback
    adapter.onPost(
      '/wallet/deposit',
      (s) async {
        await Future.delayed(const Duration(milliseconds: 100));
        return s.reply(200, {'newBalance': 360.0});
      },
      data: {'amount': 10.0, 'currency': 'UAH'},
    );

    await tester.tap(find.text('₴10'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Add ₴10'));
    await tester.pump(); // start in-flight request

    // Unmount WalletScreen by replacing the widget tree
    await tester.pumpWidget(_wrap(const Scaffold(body: Text('navigated away'))));

    // Let the deferred callback complete — must not throw
    await tester.pumpAndSettle(const Duration(milliseconds: 200));
  });

  testWidgets('clearing withdraw field after unmount does not throw (regression)', (tester) async {
    // Guards against the use-after-dispose bug fixed in _withdraw():
    // _withdrawCtrl.clear() must not run if the widget was unmounted while
    // the withdrawal API call was in-flight.
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const WalletScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Withdraw'));
    await tester.pumpAndSettle();

    adapter.onPost(
      '/wallet/withdraw',
      (s) async {
        await Future.delayed(const Duration(milliseconds: 100));
        return s.reply(200, {'newBalance': 150.0});
      },
      data: {'amount': 100.0},
    );

    // Find the withdraw amount TextField by its hint decoration
    final withdrawField = find.byWidgetPredicate((w) {
      if (w is! TextField) return false;
      final hint = w.decoration?.hintText ?? '';
      return hint.contains('Amount to withdraw');
    });
    await tester.enterText(withdrawField, '100');
    await tester.tap(find.widgetWithText(OutlinedButton, 'Request withdrawal'));
    await tester.pump(); // start in-flight request

    // Unmount WalletScreen — _withdrawCtrl is now disposed
    await tester.pumpWidget(_wrap(const Scaffold(body: Text('other page'))));

    // Let the deferred callback complete — must not throw
    await tester.pumpAndSettle(const Duration(milliseconds: 200));
  });
}
