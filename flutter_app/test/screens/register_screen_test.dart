import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/register_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrapSimple() {
  final router = GoRouter(
    initialLocation: '/register',
    routes: [
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(path: '/', builder: (_, __) => const SizedBox()),
      GoRoute(path: '/dashboard', builder: (_, __) => const SizedBox()),
    ],
  );
  return MaterialApp.router(theme: VionaTheme.dark, routerConfig: router);
}

const _countries = [
  {'id': 1, 'name': 'Ukraine', 'currencySymbol': '₴'},
  {'id': 2, 'name': 'Poland', 'currencySymbol': 'zł'},
];

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  // ── Initial render ─────────────────────────────────────────────────────────

  testWidgets('shows loading indicator while countries load', (tester) async {
    adapter.onGet('/countries', (s) async {
      await Future.delayed(const Duration(seconds: 5));
      return s.reply(200, _countries);
    });
    await tester.pumpWidget(_wrapSimple());
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
  });

  testWidgets('shows country dropdown after countries load', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();
    expect(find.byType(DropdownButtonFormField<int>), findsOneWidget);
    expect(find.text('Ukraine (₴)'), findsNothing); // not selected yet
  });

  testWidgets('shows error when countries fail to load', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(500, {}));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not load country list'), findsOneWidget);
  });

  testWidgets('shows Create account button and 3 TextFields', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();
    expect(find.text('Create account'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(3));
  });

  // ── Form validation ────────────────────────────────────────────────────────

  testWidgets('shows error when submitting with empty fields', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Create account'));
    await tester.pump();
    expect(find.text('Fill all fields'), findsOneWidget);
  });

  testWidgets('shows error when passwords do not match', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();

    // Select country via dropdown
    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ukraine (₴)').last);
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'user@test.com');
    await tester.enterText(fields.at(1), 'password123');
    await tester.enterText(fields.at(2), 'different456');

    await tester.tap(find.widgetWithText(ElevatedButton, 'Create account'));
    await tester.pump();
    expect(find.text('Passwords do not match'), findsOneWidget);
  });

  testWidgets('shows error when agreements not checked', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ukraine (₴)').last);
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'user@test.com');
    await tester.enterText(fields.at(1), 'pass1234');
    await tester.enterText(fields.at(2), 'pass1234');

    await tester.tap(find.widgetWithText(ElevatedButton, 'Create account'));
    await tester.pump();
    expect(find.text('You must accept all required agreements'), findsOneWidget);
  });

  // ── Password visibility toggle ─────────────────────────────────────────────

  testWidgets('password fields are obscured by default', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();
    final fields = tester.widgetList<TextField>(find.byType(TextField)).toList();
    // password and confirm password fields should be obscured
    expect(fields[1].obscureText, isTrue);
    expect(fields[2].obscureText, isTrue);
  });

  testWidgets('visibility toggle reveals password text', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();

    TextField field() => tester.widgetList<TextField>(find.byType(TextField)).toList()[1];
    expect(field().obscureText, isTrue);
    await tester.tap(find.byIcon(Icons.visibility_outlined));
    await tester.pump();
    expect(field().obscureText, isFalse);
    await tester.tap(find.byIcon(Icons.visibility_off_outlined));
    await tester.pump();
    expect(field().obscureText, isTrue);
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  testWidgets('shows loading spinner during register call', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    adapter.onPost('/auth/register', (s) async {
      await Future.delayed(const Duration(seconds: 5));
      return s.reply(200, {'token': 't', 'user': {}});
    });
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ukraine (₴)').last);
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'new@test.com');
    await tester.enterText(fields.at(1), 'pass1234');
    await tester.enterText(fields.at(2), 'pass1234');

    // Check the two required consent checkboxes
    final checkboxes = find.byType(Checkbox);
    await tester.tap(checkboxes.at(0)); // agree18
    await tester.pump();
    await tester.tap(checkboxes.at(1)); // agreeTerms
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Create account'));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('button is disabled during register call', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    adapter.onPost('/auth/register', (s) async {
      await Future.delayed(const Duration(seconds: 5));
      return s.reply(200, {'token': 't', 'user': {}});
    });
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ukraine (₴)').last);
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'new@test.com');
    await tester.enterText(fields.at(1), 'pass1234');
    await tester.enterText(fields.at(2), 'pass1234');

    final checkboxes = find.byType(Checkbox);
    await tester.tap(checkboxes.at(0));
    await tester.pump();
    await tester.tap(checkboxes.at(1));
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Create account'));
    await tester.pump();

    final btn = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(btn.onPressed, isNull);
  });

  // ── API error ──────────────────────────────────────────────────────────────

  testWidgets('shows API error message on failed register', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    adapter.onPost('/auth/register', (s) => s.reply(409, {'message': 'Email already in use'}));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ukraine (₴)').last);
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'taken@test.com');
    await tester.enterText(fields.at(1), 'pass1234');
    await tester.enterText(fields.at(2), 'pass1234');

    final checkboxes = find.byType(Checkbox);
    await tester.tap(checkboxes.at(0));
    await tester.pump();
    await tester.tap(checkboxes.at(1));
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Create account'));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
  });

  // ── Consent checkboxes ─────────────────────────────────────────────────────

  testWidgets('consent checkboxes start unchecked', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();
    final checkboxes = tester.widgetList<Checkbox>(find.byType(Checkbox)).toList();
    for (final cb in checkboxes) {
      expect(cb.value, isFalse);
    }
  });

  testWidgets('tapping a consent row toggles its checkbox', (tester) async {
    adapter.onGet('/countries', (s) => s.reply(200, _countries));
    await tester.pumpWidget(_wrapSimple());
    await tester.pumpAndSettle();
    final firstCheckbox = find.byType(Checkbox).first;
    await tester.tap(firstCheckbox);
    await tester.pump();
    final cb = tester.widget<Checkbox>(firstCheckbox);
    expect(cb.value, isTrue);
  });
}
