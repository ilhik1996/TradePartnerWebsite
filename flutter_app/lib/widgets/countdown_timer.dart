import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/viona_theme.dart';

class CountdownTimer extends StatefulWidget {
  final int targetHourUtc;
  final DateTime Function()? nowProvider;

  const CountdownTimer({super.key, required this.targetHourUtc, this.nowProvider});

  @override
  State<CountdownTimer> createState() => _CountdownTimerState();
}

class _CountdownTimerState extends State<CountdownTimer> {
  late Timer _timer;
  late Duration _remaining;

  @override
  void initState() {
    super.initState();
    _remaining = _calcRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _remaining = _calcRemaining());
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  Duration _calcRemaining() {
    final now = (widget.nowProvider?.call() ?? DateTime.now()).toUtc();
    var target = DateTime.utc(now.year, now.month, now.day, widget.targetHourUtc);
    if (target.isBefore(now) || target.isAtSameMomentAs(now)) {
      target = target.add(const Duration(days: 1));
    }
    return target.difference(now);
  }

  String _pad(int v) => v.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final h = _pad(_remaining.inHours);
    final m = _pad(_remaining.inMinutes.remainder(60));
    final s = _pad(_remaining.inSeconds.remainder(60));

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.schedule, size: 14, color: VionaColors.textSecondary),
        const SizedBox(width: 6),
        Text('Draw in ', style: Theme.of(context).textTheme.bodyMedium),
        _digitBox(h, 'h'),
        const SizedBox(width: 4),
        _digitBox(m, 'm'),
        const SizedBox(width: 4),
        _digitBox(s, 's'),
      ],
    );
  }

  Widget _digitBox(String val, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: VionaColors.surface2,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: VionaColors.border),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: val,
              style: const TextStyle(
                fontSize: 18, fontWeight: FontWeight.w900,
                color: VionaColors.textPrimary, fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
            TextSpan(
              text: label,
              style: const TextStyle(fontSize: 10, color: VionaColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
