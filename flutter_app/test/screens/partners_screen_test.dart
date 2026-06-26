import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/partners_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: child);

const _twoPartners = [
  {'id': 1, 'name': 'Rozetka', 'category': 'retail', 'cashbackPercent': '10'},
  {'id': 2, 'name': 'McDonald\'s', 'category': 'food', 'cashbackPercent': '3'},
];

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  testWidgets('shows loading indicator before API responds', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, []));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    // pump() without settle — widget is still in loading state
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('renders partner cards after successful load', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, _twoPartners));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Rozetka'), findsOneWidget);
    expect(find.text("McDonald's"), findsOneWidget);
  });

  testWidgets('shows empty-state when API returns empty list', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, []));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No partners found'), findsOneWidget);
  });

  testWidgets('shows error state on API failure', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(500, {'message': 'Internal error'}));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load partners'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('Retry button reloads partners after error', (tester) async {
    // First call fails, second succeeds
    adapter.onGet('/partners', (s) => s.reply(500, {'message': 'error'}));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load partners'), findsOneWidget);

    adapter.onGet('/partners', (s) => s.reply(200, _twoPartners));
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Rozetka'), findsOneWidget);
  });

  testWidgets('search filters partners by name', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, _twoPartners));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Roz');
    await tester.pump();
    expect(find.text('Rozetka'), findsOneWidget);
    expect(find.text("McDonald's"), findsNothing);
  });

  testWidgets('search filters partners by category', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, _twoPartners));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'food');
    await tester.pump();
    expect(find.text("McDonald's"), findsOneWidget);
    expect(find.text('Rozetka'), findsNothing);
  });

  testWidgets('clearing search shows all partners again', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, _twoPartners));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Roz');
    await tester.pump();
    await tester.enterText(find.byType(TextField), '');
    await tester.pump();
    expect(find.text('Rozetka'), findsOneWidget);
    expect(find.text("McDonald's"), findsOneWidget);
  });

  testWidgets('shows cashback percentage badge for partners with cashback > 0', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, [
      {'id': 1, 'name': 'CashbackShop', 'category': 'retail', 'cashbackPercent': '15'},
    ]));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();
    expect(find.text('15%'), findsOneWidget);
    expect(find.text('back'), findsOneWidget);
  });

  testWidgets('does not show cashback badge when cashback is 0', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, [
      {'id': 1, 'name': 'NoCashback', 'category': 'retail', 'cashbackPercent': '0'},
    ]));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();
    expect(find.text('0%'), findsNothing);
    expect(find.text('back'), findsNothing);
  });

  testWidgets('pull-to-refresh reloads partners', (tester) async {
    adapter.onGet('/partners', (s) => s.reply(200, _twoPartners));
    await tester.pumpWidget(_wrap(const PartnersScreen()));
    await tester.pumpAndSettle();

    adapter.onGet('/partners', (s) => s.reply(200, [
      {'id': 3, 'name': 'NewShop', 'category': 'electronics', 'cashbackPercent': '5'},
    ]));

    await tester.fling(find.byType(CustomScrollView), const Offset(0, 300), 800);
    await tester.pumpAndSettle();
    expect(find.text('NewShop'), findsOneWidget);
  });
}
