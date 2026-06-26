import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/login_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

// Test router that puts LoginScreen at '/' with a stub dashboard at '/dashboard'
Widget _wrapWithRouter({Widget dashboard = const SizedBox()}) {
  final router = GoRouter(routes: [
    GoRoute(path: '/',          builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/dashboard', builder: (_, __) => dashboard),
    GoRoute(path: '/register',  builder: (_, __) => const SizedBox()),
  ]);
  return MaterialApp.router(theme: VionaTheme.dark, routerConfig: router);
}

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  testWidgets('renders sign-in button and input fields', (tester) async {
    await tester.pumpWidget(_wrapWithRouter());
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(2));
  });

  testWidgets('shows VIONA logo', (tester) async {
    await tester.pumpWidget(_wrapWithRouter());
    expect(find.text('VIONA'), findsOneWidget);
  });

  testWidgets('shows validation error when submitting with empty fields', (tester) async {
    await tester.pumpWidget(_wrapWithRouter());
    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(
      find.text('Please enter your email/phone and password'),
      findsOneWidget,
    );
  });

  testWidgets('shows validation error when only identifier is filled', (tester) async {
    await tester.pumpWidget(_wrapWithRouter());
    await tester.enterText(find.byType(TextField).first, 'user@test.com');
    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(
      find.text('Please enter your email/phone and password'),
      findsOneWidget,
    );
  });

  testWidgets('no validation error when both fields are filled before submit', (tester) async {
    adapter.onPost('/auth/login', (s) => s.reply(200, {'token': 't', 'user': {}}));
    await tester.pumpWidget(_wrapWithRouter());
    await tester.enterText(find.byType(TextField).first, 'user@test.com');
    await tester.enterText(find.byType(TextField).last, 'password123');
    await tester.pump();
    // Validation error should not yet be shown
    expect(
      find.text('Please enter your email/phone and password'),
      findsNothing,
    );
  });

  testWidgets('shows loading indicator while API call is in progress', (tester) async {
    // Adapter with no immediate reply simulates slow network
    adapter.onPost('/auth/login', (s) async {
      await Future.delayed(const Duration(seconds: 5));
      return s.reply(200, {'token': 't', 'user': {}});
    });
    await tester.pumpWidget(_wrapWithRouter());
    await tester.enterText(find.byType(TextField).first, 'user@test.com');
    await tester.enterText(find.byType(TextField).last, 'password123');
    await tester.tap(find.text('Sign in'));
    await tester.pump(); // let setState run
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows error message on failed login (wrong credentials)', (tester) async {
    adapter.onPost(
      '/auth/login',
      (s) => s.reply(401, {'message': 'Invalid credentials'}),
    );
    await tester.pumpWidget(_wrapWithRouter());
    await tester.enterText(find.byType(TextField).first, 'user@test.com');
    await tester.enterText(find.byType(TextField).last, 'wrongpass');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    // Error container should be visible after failed login
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
  });

  testWidgets('sign-in button is disabled while loading', (tester) async {
    adapter.onPost('/auth/login', (s) async {
      await Future.delayed(const Duration(seconds: 5));
      return s.reply(200, {'token': 't', 'user': {}});
    });
    await tester.pumpWidget(_wrapWithRouter());
    await tester.enterText(find.byType(TextField).first, 'user@test.com');
    await tester.enterText(find.byType(TextField).last, 'password123');
    await tester.tap(find.text('Sign in'));
    await tester.pump();

    final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(button.onPressed, isNull);
  });

  testWidgets('navigates to dashboard after successful login', (tester) async {
    adapter.onPost('/auth/login', (s) => s.reply(200, {
      'token': 'valid_jwt',
      'user': {'id': 1, 'email': 'user@test.com'},
    }));
    const dashboardKey = Key('dashboard_stub');
    await tester.pumpWidget(_wrapWithRouter(
      dashboard: const SizedBox(key: dashboardKey),
    ));
    await tester.enterText(find.byType(TextField).first, 'user@test.com');
    await tester.enterText(find.byType(TextField).last, 'password123');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.byKey(dashboardKey), findsOneWidget);
  });

  testWidgets('password visibility toggle shows/hides password text', (tester) async {
    await tester.pumpWidget(_wrapWithRouter());
    final passwordField = find.byType(TextField).last;

    // Initially obscured
    TextField textField = tester.widget(passwordField);
    expect(textField.obscureText, isTrue);

    // Tap the visibility icon to show
    await tester.tap(find.byIcon(Icons.visibility_outlined));
    await tester.pump();
    textField = tester.widget(passwordField);
    expect(textField.obscureText, isFalse);

    // Tap again to hide
    await tester.tap(find.byIcon(Icons.visibility_off_outlined));
    await tester.pump();
    textField = tester.widget(passwordField);
    expect(textField.obscureText, isTrue);
  });
}
