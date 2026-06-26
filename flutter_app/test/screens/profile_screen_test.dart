import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/profile_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrapWithRouter({Widget login = const SizedBox()}) {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => const ProfileScreen()),
    GoRoute(path: '/login', builder: (_, __) => login),
  ]);
  return MaterialApp.router(theme: VionaTheme.dark, routerConfig: router);
}

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: child);

const _meResponse = {
  'id': 1,
  'email': 'alice@example.com',
  'kycLevel': 'age_verified',
  'referralCode': 'ALICE10',
};
const _profileResponse = {
  'firstName': 'Alice',
  'lastName': 'Smith',
};
const _levelResponse = {
  'level': 3,
  'xp': 150,
  'title': 'Explorer',
  'currentLevelXp': 100,
  'nextLevelXp': 200,
  'badges': <dynamic>[],
};
const _rgResponse = {
  'dailyLimitAmount': '50.00',
  'weeklyLimitAmount': null,
  'monthlyLimitAmount': '500.00',
  'spentToday': '10.00',
  'spentThisWeek': '30.00',
  'spentThisMonth': '80.00',
  'selfExcludedUntil': null,
};

void _stubLoad(
  DioAdapter adapter, {
  Map<String, dynamic> me = _meResponse,
  Map<String, dynamic> profile = _profileResponse,
  Map<String, dynamic> level = _levelResponse,
  Map<String, dynamic>? rg = _rgResponse,
}) {
  adapter.onGet('/auth/me',                     (s) => s.reply(200, me));
  adapter.onGet('/gamification/me',             (s) => s.reply(200, level));
  adapter.onGet('/settings/responsible-gaming', (s) => s.reply(rg == null ? 404 : 200, rg ?? {}));
  adapter.onGet('/profile',                     (s) => s.reply(200, profile));
}

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  // ── Loading & basic rendering ──────────────────────────────────────────────

  testWidgets('shows loading indicator on initial render', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows user email after load', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    expect(find.text('alice@example.com'), findsOneWidget);
  });

  testWidgets('shows display name from profile after load', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Alice Smith'), findsOneWidget);
  });

  testWidgets('first name and last name fields are pre-filled', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    // Both controllers should be populated from profile response
    final fields = tester.widgetList<TextField>(find.byType(TextField)).toList();
    final firstNameField = fields.firstWhere(
      (f) => f.decoration?.hintText?.contains('First name') == true,
    );
    final lastNameField = fields.firstWhere(
      (f) => f.decoration?.hintText?.contains('Last name') == true,
    );
    expect(firstNameField.controller?.text, 'Alice');
    expect(lastNameField.controller?.text, 'Smith');
  });

  testWidgets('shows referral code in account tab', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    expect(find.text('ALICE10'), findsOneWidget);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  testWidgets('shows snackbar on load failure', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(500, {'message': 'error'}));
    adapter.onGet('/gamification/me', (s) => s.reply(200, _levelResponse));
    adapter.onGet('/settings/responsible-gaming', (s) => s.reply(200, _rgResponse));
    adapter.onGet('/profile', (s) => s.reply(200, _profileResponse));
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.textContaining('Failed to load profile'), findsOneWidget);
  });

  // ── Tab navigation ─────────────────────────────────────────────────────────

  testWidgets('has three tabs: Account, Level, Safety', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Account'), findsOneWidget);
    expect(find.text('Level'), findsOneWidget);
    expect(find.text('Safety'), findsOneWidget);
  });

  testWidgets('switching to Level tab shows gamification data', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Level'));
    await tester.pumpAndSettle();
    expect(find.text('Explorer'), findsOneWidget);
    // Level number badge
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('switching to Safety tab shows spending limits', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Safety'));
    await tester.pumpAndSettle();
    expect(find.text('Spending limits'), findsOneWidget);
    expect(find.textContaining('Daily spending limit'), findsOneWidget);
    expect(find.textContaining('Weekly spending limit'), findsOneWidget);
    expect(find.textContaining('Monthly spending limit'), findsOneWidget);
  });

  // ── KYC status ────────────────────────────────────────────────────────────

  testWidgets('shows age verification complete for age_verified user', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Age verification'), findsOneWidget);
    // Check icon shows verified state (check_circle vs radio_button_unchecked)
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
  });

  testWidgets('full KYC shows Verify button for age_verified user', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Verify →'), findsOneWidget);
  });

  testWidgets('shows both KYC steps as not done for unverified user', (tester) async {
    _stubLoad(adapter, me: {..._meResponse, 'kycLevel': 'none'});
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.radio_button_unchecked), findsNWidgets(2));
  });

  // ── Save profile ───────────────────────────────────────────────────────────

  testWidgets('save changes button is enabled after load', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Save changes'),
    );
    expect(button.onPressed, isNotNull);
  });

  testWidgets('successful save shows success snackbar', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();

    adapter.onPatch('/profile', (s) => s.reply(200, {}), data: {'firstName': 'Alice', 'lastName': 'Smith'});

    await tester.tap(find.widgetWithText(ElevatedButton, 'Save changes'));
    await tester.pumpAndSettle();
    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.text('Profile updated'), findsOneWidget);
  });

  // ── Self-exclusion state ───────────────────────────────────────────────────

  testWidgets('shows self-exclude button when not excluded', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Safety'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(OutlinedButton, 'Self-exclude'), findsOneWidget);
  });

  testWidgets('shows exclusion active banner when self-excluded', (tester) async {
    final futureDate = DateTime.now().add(const Duration(days: 30)).toIso8601String();
    _stubLoad(adapter, rg: {..._rgResponse, 'selfExcludedUntil': futureDate});
    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Safety'));
    await tester.pumpAndSettle();
    expect(find.text('Self-exclusion active'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Self-exclude'), findsNothing);
  });

  // ── Mounted guard regression ───────────────────────────────────────────────

  testWidgets('accessing text controllers after unmount does not throw (regression)', (tester) async {
    // Guards the fix in _load(): _firstNameCtrl.text and _lastNameCtrl.text must
    // not be set if the widget was unmounted while Future.wait([...]) was in-flight.
    // Simulate this by making all 4 endpoints slow, then unmounting mid-flight.
    adapter.onGet('/auth/me', (s) async {
      await Future.delayed(const Duration(milliseconds: 100));
      return s.reply(200, _meResponse);
    });
    adapter.onGet('/gamification/me', (s) async {
      await Future.delayed(const Duration(milliseconds: 100));
      return s.reply(200, _levelResponse);
    });
    adapter.onGet('/settings/responsible-gaming', (s) async {
      await Future.delayed(const Duration(milliseconds: 100));
      return s.reply(200, _rgResponse);
    });
    adapter.onGet('/profile', (s) async {
      await Future.delayed(const Duration(milliseconds: 100));
      return s.reply(200, _profileResponse);
    });

    await tester.pumpWidget(_wrap(const ProfileScreen()));
    await tester.pump(); // let initState run but not settle

    // Unmount while Future.wait([...]) is still in-flight
    await tester.pumpWidget(_wrap(const Scaffold(body: Text('navigated away'))));

    // Let deferred callbacks fire — must not throw
    await tester.pumpAndSettle(const Duration(milliseconds: 200));
    // Test passes if no FlutterError: controller used after dispose
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  testWidgets('logout dialog appears on logout icon tap', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.logout));
    await tester.pumpAndSettle();
    expect(find.text('Sign out?'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.text('Sign out'), findsOneWidget);
  });

  testWidgets('cancelling logout dialog stays on profile', (tester) async {
    _stubLoad(adapter);
    await tester.pumpWidget(_wrapWithRouter());
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.logout));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsOneWidget);
  });

  testWidgets('confirming logout navigates to login', (tester) async {
    _stubLoad(adapter);
    const loginKey = Key('login_stub');
    await tester.pumpWidget(_wrapWithRouter(
      login: const SizedBox(key: loginKey),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.logout));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(find.byKey(loginKey), findsOneWidget);
  });
}
