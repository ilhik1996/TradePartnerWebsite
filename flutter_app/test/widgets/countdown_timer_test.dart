import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:viona/widgets/countdown_timer.dart';
import 'package:viona/theme/viona_theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: VionaTheme.dark, home: Scaffold(body: child));

void main() {
  // The CountdownTimer uses Timer.periodic which Flutter's test framework
  // controls via fake time — tester.pump(Duration) advances the clock.

  testWidgets('renders "Draw in" label', (tester) async {
    await tester.pumpWidget(_wrap(const CountdownTimer(targetHourUtc: 21)));
    expect(find.textContaining('Draw in'), findsOneWidget);
  });

  testWidgets('shows hours, minutes, seconds labels', (tester) async {
    await tester.pumpWidget(_wrap(const CountdownTimer(targetHourUtc: 21)));
    expect(find.textContaining('h'), findsOneWidget);
    expect(find.textContaining('m'), findsOneWidget);
    expect(find.textContaining('s'), findsOneWidget);
  });

  testWidgets('shows schedule icon', (tester) async {
    await tester.pumpWidget(_wrap(const CountdownTimer(targetHourUtc: 21)));
    expect(find.byIcon(Icons.schedule), findsOneWidget);
  });

  testWidgets('displays two-digit zero-padded values', (tester) async {
    // Regardless of the actual time, values should always be 2-digit strings
    await tester.pumpWidget(_wrap(const CountdownTimer(targetHourUtc: 21)));
    // Find digit-box RichText widgets (those with children) — excludes plain Text widgets
    final richTexts = tester.widgetList<RichText>(find.byType(RichText))
        .where((rt) => (rt.text as TextSpan).children != null)
        .toList();
    // Each digit box has 2 spans: the value (2 chars) and the label (1 char)
    for (final rt in richTexts) {
      final spans = (rt.text as TextSpan).children!;
      expect(spans.first.toPlainText().length, 2);
    }
  });

  testWidgets('updates display when a second elapses', (tester) async {
    await tester.pumpWidget(_wrap(const CountdownTimer(targetHourUtc: 21)));
    // Capture digit text before tick — filter out plain Text widgets (no children)
    final before = tester
        .widgetList<RichText>(find.byType(RichText))
        .where((rt) => (rt.text as TextSpan).children != null)
        .map((rt) => (rt.text as TextSpan).children!.first.toPlainText())
        .join();

    // Advance fake clock by 1 second — triggers Timer.periodic callback
    await tester.pump(const Duration(seconds: 1));

    final after = tester
        .widgetList<RichText>(find.byType(RichText))
        .where((rt) => (rt.text as TextSpan).children != null)
        .map((rt) => (rt.text as TextSpan).children!.first.toPlainText())
        .join();

    // The seconds digit must have changed (total string differs)
    expect(before, isNot(equals(after)));
  });

  testWidgets('timer is cancelled on dispose (no timer leak)', (tester) async {
    await tester.pumpWidget(_wrap(const CountdownTimer(targetHourUtc: 21)));
    // Replace tree — disposes CountdownTimer and cancels _timer
    await tester.pumpWidget(_wrap(const SizedBox()));
    // Pump 2 seconds — if timer were still running this would throw
    await tester.pump(const Duration(seconds: 2));
    // If we get here without exception, the dispose guard works
  });
}
