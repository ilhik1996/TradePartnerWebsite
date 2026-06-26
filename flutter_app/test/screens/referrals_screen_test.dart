import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/referrals_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: child);

const _referralsResponse = {
  'referralCode': 'VIONA42',
  'totalBonusEarned': '15.50',
  'referrals': [
    {
      'email': 'alice@example.com',
      'bonusAmount': '7.50',
      'joinedAt': '2025-05-01T12:00:00.000Z',
    },
    {
      'email': 'bob@example.com',
      'bonusAmount': '8.00',
      'joinedAt': '2025-05-15T08:00:00.000Z',
    },
  ],
};

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  // ── Basic rendering ────────────────────────────────────────────────────────

  testWidgets('shows loading indicator on initial render', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows referral code after loading', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('VIONA42'), findsOneWidget);
  });

  testWidgets('shows referral stats (count and bonus)', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);     // 2 referrals
    expect(find.text('15.50'), findsOneWidget); // total bonus
  });

  testWidgets('masks referral email addresses', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();
    // Full email should NOT appear; masked version (a***@example.com) should
    expect(find.text('alice@example.com'), findsNothing);
    expect(find.textContaining('a***@example.com'), findsOneWidget);
  });

  testWidgets('shows individual bonus amounts for each referral', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('+7.50'), findsOneWidget);
    expect(find.text('+8.00'), findsOneWidget);
  });

  testWidgets('shows error state and retry button on API failure', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(500, {'message': 'error'}));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load referrals'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('Retry reloads data after error', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(500, {'message': 'error'}));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();

    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('VIONA42'), findsOneWidget);
  });

  // ── Apply referral code ────────────────────────────────────────────────────

  testWidgets('Apply button submits referral code and reloads', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();

    adapter.onPost('/referrals/apply', (s) => s.reply(200, {'message': 'Applied'}), data: {'code': 'FRIEND10'});
    adapter.onGet('/referrals/my', (s) => s.reply(200, {
      ..._referralsResponse,
      'totalBonusEarned': '25.50',
    }));

    await tester.enterText(find.byType(TextField), 'FRIEND10');
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();

    // After applying code, field should be cleared and data reloaded
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.controller?.text ?? '', isEmpty);
    expect(find.text('25.50'), findsOneWidget);
  });

  testWidgets('Apply button shows error snackbar on failed code', (tester) async {
    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();

    adapter.onPost('/referrals/apply', (s) => s.reply(400, {'message': 'Invalid code'}), data: {'code': 'BADCODE'});
    await tester.enterText(find.byType(TextField), 'BADCODE');
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();

    // Code field should NOT be cleared on error
    expect(find.byType(SnackBar), findsOneWidget);
  });

  // ── Mounted guard regression ───────────────────────────────────────────────

  testWidgets('clearing code field after unmount does not throw (regression)', (tester) async {
    // This test guards against the use-after-dispose bug fixed in _applyCode():
    // if the widget is unmounted while the API call is in-flight, _codeCtrl.clear()
    // must not execute (was crashing with FlutterError: controller used after dispose).
    adapter.onGet('/referrals/my', (s) => s.reply(200, _referralsResponse));
    await tester.pumpWidget(_wrap(const ReferralsScreen()));
    await tester.pumpAndSettle();

    // Slow apply — gives us a window to unmount during the in-flight request
    adapter.onPost(
      '/referrals/apply',
      (s) async {
        await Future.delayed(const Duration(milliseconds: 100));
        return s.reply(200, {'message': 'ok'});
      },
      data: {'code': 'CODE123'},
    );
    // We won't re-load after the apply because we'll be unmounted
    // (no GET mock registered intentionally)

    await tester.enterText(find.byType(TextField), 'CODE123');
    await tester.tap(find.text('Apply'));
    await tester.pump(); // start the in-flight request

    // Replace widget tree — this disposes ReferralsScreen (and _codeCtrl)
    await tester.pumpWidget(_wrap(const Scaffold(body: Text('other page'))));

    // Let the deferred callback complete — must not throw
    await tester.pumpAndSettle(const Duration(milliseconds: 200));
    // Test passes if no FlutterError is reported
  });
}
