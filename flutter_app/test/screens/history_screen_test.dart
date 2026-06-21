import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/history_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: child);

const _meResponse = {'id': 1, 'email': 'u@test.com', 'countryId': 1};

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  testWidgets('shows loading indicator on initial render', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(200, _meResponse));
    adapter.onGet('/draws/history/1', (s) => s.reply(200, []));
    await tester.pumpWidget(_wrap(const HistoryScreen()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows empty state when no draws', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(200, _meResponse));
    adapter.onGet('/draws/history/1', (s) => s.reply(200, []));
    await tester.pumpWidget(_wrap(const HistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No draws yet'), findsOneWidget);
  });

  testWidgets('shows error state on API failure', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(500, {'message': 'error'}));
    await tester.pumpWidget(_wrap(const HistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load history'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows draw cards after successful load', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(200, _meResponse));
    adapter.onGet('/draws/history/1', (s) => s.reply(200, [
      {
        'id': 1,
        'drawDate': '2025-06-01T21:00:00.000Z',
        'status': 'completed',
        'totalPool': '1000.00',
        'prizeAmount': '500.00',
        'totalEntries': 200,
        'myEntry': null,
        'isWinner': false,
        'winnerTicketNumber': 142,
      },
    ]));
    await tester.pumpWidget(_wrap(const HistoryScreen()));
    await tester.pumpAndSettle();
    // Draw date should be visible
    expect(find.text('2025-06-01'), findsOneWidget);
  });

  testWidgets('stat tiles show correct counts', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(200, _meResponse));
    adapter.onGet('/draws/history/1', (s) => s.reply(200, [
      {
        'id': 1, 'drawDate': '2025-06-01T00:00:00Z', 'status': 'completed',
        'totalPool': '100', 'prizeAmount': '50', 'totalEntries': 10,
        'myEntry': {'ticketNumber': 5}, 'isWinner': false, 'winnerTicketNumber': 8,
      },
      {
        'id': 2, 'drawDate': '2025-06-02T00:00:00Z', 'status': 'completed',
        'totalPool': '200', 'prizeAmount': '100', 'totalEntries': 20,
        'myEntry': {'ticketNumber': 14}, 'isWinner': true, 'winnerTicketNumber': 14,
      },
      {
        'id': 3, 'drawDate': '2025-06-03T00:00:00Z', 'status': 'completed',
        'totalPool': '150', 'prizeAmount': '75', 'totalEntries': 15,
        'myEntry': null, 'isWinner': false, 'winnerTicketNumber': 0,
      },
    ]));
    await tester.pumpWidget(_wrap(const HistoryScreen()));
    await tester.pumpAndSettle();

    // 3 total draws, 2 entries (draws 1 & 2 have myEntry), 1 win
    expect(find.text('3'), findsOneWidget); // Total draws
    expect(find.text('2'), findsOneWidget); // My entries
    expect(find.text('1'), findsOneWidget); // Wins
  });

  testWidgets('shows winner badge on won draw', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(200, _meResponse));
    adapter.onGet('/draws/history/1', (s) => s.reply(200, [
      {
        'id': 1, 'drawDate': '2025-06-01T00:00:00Z', 'status': 'completed',
        'totalPool': '100', 'prizeAmount': '50', 'totalEntries': 10,
        'myEntry': {'ticketNumber': 7}, 'isWinner': true, 'winnerTicketNumber': 7,
      },
    ]));
    await tester.pumpWidget(_wrap(const HistoryScreen()));
    await tester.pumpAndSettle();
    expect(find.text('You won! 🎉'), findsOneWidget);
  });

  testWidgets('expands draw card to show ticket details', (tester) async {
    adapter.onGet('/auth/me', (s) => s.reply(200, _meResponse));
    adapter.onGet('/draws/history/1', (s) => s.reply(200, [
      {
        'id': 1, 'drawDate': '2025-06-01T00:00:00Z', 'status': 'completed',
        'totalPool': '100', 'prizeAmount': '50', 'totalEntries': 10,
        'myEntry': {'ticketNumber': 3}, 'isWinner': false, 'winnerTicketNumber': 8,
      },
    ]));
    await tester.pumpWidget(_wrap(const HistoryScreen()));
    await tester.pumpAndSettle();

    // Ticket details should not be visible before expanding
    expect(find.text('My ticket'), findsNothing);

    // Tap the card to expand
    await tester.tap(find.text('2025-06-01'));
    await tester.pumpAndSettle();
    expect(find.text('My ticket'), findsOneWidget);
    expect(find.text('#3'), findsOneWidget);
    expect(find.text('Winner ticket'), findsOneWidget);
    expect(find.text('#8'), findsOneWidget);
  });
}
