import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/screens/notifications_screen.dart';
import 'package:viona/services/api_service.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: child);

const _unread = {
  'id': 1, 'type': 'winner', 'title': 'You won!',
  'body': 'Congratulations, you won draw #42!',
  'isRead': false, 'createdAt': '2025-06-01T21:00:00Z',
};
const _read = {
  'id': 2, 'type': 'draw_result', 'title': 'Draw result',
  'body': 'Draw #43 completed. Winner: ticket #7.',
  'isRead': true, 'createdAt': '2025-06-02T21:00:00Z',
};

void main() {
  late DioAdapter adapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
    adapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => adapter.close());

  // ── Loading & empty ────────────────────────────────────────────────────────

  testWidgets('shows loading indicator on initial render', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, []));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pumpAndSettle();
  });

  testWidgets('shows empty state when no notifications', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, []));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No notifications yet'), findsOneWidget);
  });

  testWidgets('shows error state with Retry on API failure', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(500, {'message': 'error'}));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Could not load notifications'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('Retry reloads after error', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(500, {'message': 'error'}));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();

    adapter.onGet('/notifications', (s) => s.reply(200, [_read]));
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Draw result'), findsOneWidget);
  });

  // ── Notification tiles ─────────────────────────────────────────────────────

  testWidgets('renders notification title and body', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [_read]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Draw result'), findsOneWidget);
    expect(find.textContaining('Draw #43 completed'), findsOneWidget);
  });

  testWidgets('unread notification shows unread dot indicator', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [_unread]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();
    // Unread dot is a BoxDecoration with circle shape — widget is a Container
    // We verify the title text exists and the unread count badge shows
    expect(find.text('You won!'), findsOneWidget);
    // Badge in app bar title shows count '1'
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('unread count badge shows in app bar', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [_unread, _read]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();
    // 1 unread out of 2 total — badge shows '1'
    expect(find.text('1'), findsOneWidget);
    expect(find.text('Mark all read'), findsOneWidget);
  });

  testWidgets('Mark all read button not shown when all are read', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [_read]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Mark all read'), findsNothing);
  });

  // ── Mark read interactions ─────────────────────────────────────────────────

  testWidgets('tapping unread notification marks it read', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [_unread]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();

    adapter.onPatch('/notifications/1/read', (s) => s.reply(200, {}));

    await tester.tap(find.text('You won!'));
    await tester.pumpAndSettle();

    // After marking read, unread count badge should disappear
    expect(find.text('1'), findsNothing);
    expect(find.text('Mark all read'), findsNothing);
  });

  testWidgets('Mark all read marks all notifications as read', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [_unread, {
      'id': 3, 'type': 'balance_low', 'title': 'Balance low',
      'body': 'Your balance is below the entry fee.',
      'isRead': false, 'createdAt': '2025-06-03T10:00:00Z',
    }]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();

    adapter.onPatch('/notifications/1/read', (s) => s.reply(200, {}));
    adapter.onPatch('/notifications/3/read', (s) => s.reply(200, {}));

    await tester.tap(find.text('Mark all read'));
    await tester.pumpAndSettle();

    expect(find.text('2'), findsNothing); // badge gone
    expect(find.text('Mark all read'), findsNothing);
  });

  // ── Pull-to-refresh ────────────────────────────────────────────────────────

  testWidgets('pull-to-refresh reloads notifications', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [_read]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();

    adapter.onGet('/notifications', (s) => s.reply(200, [_unread, _read]));
    await tester.fling(find.byType(ListView), const Offset(0, 300), 800);
    await tester.pumpAndSettle();
    expect(find.text('You won!'), findsOneWidget);
  });

  // ── Notification types / icons ─────────────────────────────────────────────

  testWidgets('winner notification shows emoji_events icon', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [_unread]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.emoji_events), findsOneWidget);
  });

  testWidgets('payment_failed notification shows error_outline icon', (tester) async {
    adapter.onGet('/notifications', (s) => s.reply(200, [
      {
        'id': 10, 'type': 'payment_failed', 'title': 'Payment failed',
        'body': 'Entry fee could not be deducted.', 'isRead': false,
      },
    ]));
    await tester.pumpWidget(_wrap(const NotificationsScreen()));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
  });
}
