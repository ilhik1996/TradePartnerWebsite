import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:viona/widgets/viona_card.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: Scaffold(body: child));

void main() {
  // ── VionaCard ──────────────────────────────────────────────────────────────

  group('VionaCard', () {
    testWidgets('renders child content', (tester) async {
      await tester.pumpWidget(_wrap(const VionaCard(child: Text('Hello'))));
      expect(find.text('Hello'), findsOneWidget);
    });

    testWidgets('calls onTap when tapped', (tester) async {
      var tapped = false;
      await tester.pumpWidget(_wrap(
        VionaCard(onTap: () => tapped = true, child: const Text('Tap me')),
      ));
      await tester.tap(find.text('Tap me'));
      expect(tapped, isTrue);
    });

    testWidgets('does not wrap in GestureDetector when onTap is null', (tester) async {
      await tester.pumpWidget(_wrap(const VionaCard(child: Text('Static'))));
      expect(find.byType(GestureDetector), findsNothing);
    });

    testWidgets('applies custom padding', (tester) async {
      await tester.pumpWidget(_wrap(
        const VionaCard(
          padding: EdgeInsets.all(8),
          child: Text('padded'),
        ),
      ));
      final container = tester.widget<Container>(find.byType(Container).first);
      expect((container.padding as EdgeInsets).top, 8.0);
    });

    testWidgets('applies gradient when provided', (tester) async {
      await tester.pumpWidget(_wrap(
        const VionaCard(
          gradient: LinearGradient(colors: [Colors.red, Colors.blue]),
          child: Text('gradient'),
        ),
      ));
      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.gradient, isNotNull);
      expect(decoration.color, isNull);
    });

    testWidgets('uses surface color when no gradient provided', (tester) async {
      await tester.pumpWidget(_wrap(const VionaCard(child: Text('plain'))));
      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, isNotNull);
      expect(decoration.gradient, isNull);
    });

    testWidgets('uses custom border color when provided', (tester) async {
      await tester.pumpWidget(_wrap(
        const VionaCard(borderColor: Colors.red, child: Text('bordered')),
      ));
      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration as BoxDecoration;
      final border = decoration.border as Border;
      expect(border.top.color, Colors.red);
    });
  });

  // ── VionaPrizeCard ─────────────────────────────────────────────────────────

  group('VionaPrizeCard', () {
    testWidgets("shows today's prize pool label", (tester) async {
      await tester.pumpWidget(_wrap(
        const VionaPrizeCard(amount: '500.00', currency: '₴'),
      ));
      expect(find.textContaining("Today's prize pool"), findsOneWidget);
    });

    testWidgets('shows formatted amount with currency symbol', (tester) async {
      await tester.pumpWidget(_wrap(
        const VionaPrizeCard(amount: '1234.56', currency: '₴'),
      ));
      expect(find.text('₴1234.56'), findsOneWidget);
    });

    testWidgets('renders optional subtitle widget', (tester) async {
      await tester.pumpWidget(_wrap(
        const VionaPrizeCard(
          amount: '100.00',
          currency: '\$',
          subtitle: Text('42 entries'),
        ),
      ));
      expect(find.text('42 entries'), findsOneWidget);
    });

    testWidgets('does not crash when subtitle is omitted', (tester) async {
      await tester.pumpWidget(_wrap(
        const VionaPrizeCard(amount: '0.00', currency: '₴'),
      ));
      expect(find.textContaining("Today's prize pool"), findsOneWidget);
    });
  });
}
