import 'package:flutter/material.dart';
import '../theme/viona_theme.dart';

class VionaCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final Color? borderColor;
  final VoidCallback? onTap;
  final Gradient? gradient;

  const VionaCard({
    super.key,
    required this.child,
    this.padding,
    this.borderColor,
    this.onTap,
    this.gradient,
  });

  @override
  Widget build(BuildContext context) {
    Widget card = Container(
      padding: padding ?? const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: gradient == null ? VionaColors.surface : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor ?? VionaColors.border),
      ),
      child: child,
    );

    if (onTap != null) {
      card = GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          child: card,
        ),
      );
    }
    return card;
  }
}

class VionaPrizeCard extends StatelessWidget {
  final String amount;
  final String currency;
  final Widget? subtitle;

  const VionaPrizeCard({
    super.key,
    required this.amount,
    required this.currency,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return VionaCard(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF1E1040), Color(0xFF0D1117)],
      ),
      borderColor: const Color(0xFF6D3FC8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Today\'s prize pool',
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          ShaderMask(
            shaderCallback: (bounds) => const LinearGradient(
              colors: [VionaColors.purple, VionaColors.teal],
            ).createShader(bounds),
            child: Text(
              '$currency$amount',
              style: const TextStyle(
                fontSize: 52, fontWeight: FontWeight.w900,
                color: Colors.white, letterSpacing: -2,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            subtitle!,
          ],
        ],
      ),
    );
  }
}
