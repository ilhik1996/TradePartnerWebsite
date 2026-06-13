import 'package:flutter/material.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  final _api = ApiService();
  dynamic _subscription;
  Map<String, dynamic>? _country;
  bool _loading = true;
  bool _processing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([_api.getSubscription(), _api.me()]);
      _subscription = results[0];
      final user = results[1] as Map<String, dynamic>;
      _country = await _api.getCountry(user['countryId'] ?? 1);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _subscribe(String type) async {
    setState(() => _processing = true);
    try {
      await _api.createSubscription(type);
      _showSnack('Subscribed! 🎉');
      await _load();
    } catch (e) {
      _showSnack('$e', error: true);
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  Future<void> _cancel() async {
    final sub = _subscription;
    if (sub == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: VionaColors.surface,
        title: const Text('Cancel subscription?'),
        content: Text(
          'Your subscription will remain active until ${sub['nextBillingDate']?.toString().substring(0, 10) ?? 'end of period'}.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel', style: TextStyle(color: VionaColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _processing = true);
    try {
      await _api.cancelSubscription(sub['id'] as int);
      _showSnack('Subscription cancelled');
      await _load();
    } catch (e) {
      _showSnack('$e', error: true);
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  void _showSnack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? VionaColors.danger : VionaColors.surface2,
    ));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: VionaColors.purple)));
    }

    final symbol = _country?['currencySymbol'] ?? '$';
    final weeklyAmt = double.tryParse(_country?['entryAmountWeekly']?.toString() ?? '35') ?? 35;
    final monthlyAmt = double.tryParse(_country?['entryAmountMonthly']?.toString() ?? '125') ?? 125;
    final dailyAmt = double.tryParse(_country?['entryAmountDaily']?.toString() ?? '5') ?? 5;

    final weeklySaving = ((dailyAmt * 7 - weeklyAmt) / (dailyAmt * 7) * 100).toInt();
    final monthlySaving = ((dailyAmt * 30 - monthlyAmt) / (dailyAmt * 30) * 100).toInt();

    final activeSub = _subscription != null && _subscription['status'] == 'active';
    final subType = _subscription?['type'] as String? ?? '';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: VionaColors.background,
        title: const Text('Subscribe'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: VionaColors.purple,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (activeSub) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: VionaColors.teal.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: VionaColors.teal.withOpacity(0.4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.check_circle, color: VionaColors.teal, size: 18),
                          const SizedBox(width: 8),
                          Text(
                            '${subType.isNotEmpty ? '${subType[0].toUpperCase()}${subType.substring(1)}' : 'Unknown'} subscription active',
                            style: const TextStyle(fontWeight: FontWeight.w700, color: VionaColors.teal),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Renews: ${_subscription!['nextBillingDate']?.toString().substring(0, 10) ?? '—'}',
                        style: const TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _processing ? null : _cancel,
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: VionaColors.danger),
                          foregroundColor: VionaColors.danger,
                        ),
                        child: const Text('Cancel subscription'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
              ],

              Text('Choose a plan', style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 12),

              _PlanCard(
                type: 'weekly',
                title: 'Weekly',
                price: '$symbol${weeklyAmt.toStringAsFixed(2)}',
                perDay: '$symbol${(weeklyAmt / 7).toStringAsFixed(2)}/day',
                saving: weeklySaving > 0 ? 'Save $weeklySaving%' : null,
                features: const [
                  '7 automatic daily entries',
                  'Auto-renewal every week',
                  'Cancel any time',
                ],
                isActive: activeSub && subType == 'weekly',
                onTap: activeSub ? null : () => _subscribe('weekly'),
                processing: _processing,
              ),
              const SizedBox(height: 12),

              _PlanCard(
                type: 'monthly',
                title: 'Monthly',
                price: '$symbol${monthlyAmt.toStringAsFixed(2)}',
                perDay: '$symbol${(monthlyAmt / 30).toStringAsFixed(2)}/day',
                saving: monthlySaving > 0 ? 'Save $monthlySaving%' : null,
                features: const [
                  '30 automatic daily entries',
                  'Auto-renewal every month',
                  'Priority support',
                  'Cancel any time',
                ],
                isActive: activeSub && subType == 'monthly',
                highlighted: true,
                onTap: activeSub ? null : () => _subscribe('monthly'),
                processing: _processing,
              ),

              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: VionaColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: VionaColors.border),
                ),
                child: const Text(
                  'Subscriptions auto-charge your wallet on renewal. If your balance is insufficient, the subscription pauses — no external charge will occur. Cancel any time from this screen.',
                  style: TextStyle(fontSize: 11, color: VionaColors.textSecondary),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  final String type;
  final String title;
  final String price;
  final String perDay;
  final String? saving;
  final List<String> features;
  final bool isActive;
  final bool highlighted;
  final VoidCallback? onTap;
  final bool processing;

  const _PlanCard({
    required this.type,
    required this.title,
    required this.price,
    required this.perDay,
    this.saving,
    required this.features,
    this.isActive = false,
    this.highlighted = false,
    this.onTap,
    this.processing = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isActive ? VionaColors.teal.withOpacity(0.06) : VionaColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isActive ? VionaColors.teal : highlighted ? VionaColors.purple : VionaColors.border,
          width: isActive || highlighted ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              if (saving != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: VionaColors.gold.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(saving!, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: VionaColors.gold)),
                ),
              ],
              if (highlighted) ...[
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: VionaColors.purple.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text('Popular', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: VionaColors.purple)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(price, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900)),
              const SizedBox(width: 6),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(perDay, style: const TextStyle(fontSize: 12, color: VionaColors.textSecondary)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ...features.map((f) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                const Icon(Icons.check_circle_outline, size: 16, color: VionaColors.teal),
                const SizedBox(width: 8),
                Text(f, style: const TextStyle(fontSize: 13)),
              ],
            ),
          )),
          const SizedBox(height: 14),
          if (isActive)
            const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.check_circle, color: VionaColors.teal, size: 18),
                SizedBox(width: 6),
                Text('Current plan', style: TextStyle(color: VionaColors.teal, fontWeight: FontWeight.w700)),
              ],
            )
          else
            ElevatedButton(
              onPressed: processing ? null : onTap,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 48),
                backgroundColor: highlighted ? VionaColors.purple : null,
              ),
              child: processing
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text('Subscribe $title'),
            ),
        ],
      ),
    );
  }
}
