import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';

class ReferralsScreen extends StatefulWidget {
  const ReferralsScreen({super.key});

  @override
  State<ReferralsScreen> createState() => _ReferralsScreenState();
}

class _ReferralsScreenState extends State<ReferralsScreen> {
  final _api = ApiService();
  final _codeCtrl = TextEditingController();
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _applying = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      _data = await _api.getReferrals();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _applyCode() async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() => _applying = true);
    try {
      await _api.applyReferralCode(code);
      _codeCtrl.clear();
      _showSnack('Referral code applied! 🎉');
      await _load();
    } catch (e) {
      _showSnack('$e', error: true);
    } finally {
      if (mounted) setState(() => _applying = false);
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

    final myCode = _data?['referralCode'] as String? ?? '';
    final referrals = (_data?['referrals'] as List<dynamic>?) ?? [];
    final totalBonus = double.tryParse(_data?['totalBonus']?.toString() ?? '0') ?? 0;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: VionaColors.background,
        title: const Text('Referrals'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: VionaColors.purple,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // My code
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF1E1040), Color(0xFF0D1117)],
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF6D3FC8)),
                ),
                child: Column(
                  children: [
                    const Text('Your referral code', style: TextStyle(color: VionaColors.textSecondary, fontSize: 13)),
                    const SizedBox(height: 8),
                    Text(
                      myCode,
                      style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: VionaColors.purple, letterSpacing: 4),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: myCode));
                            _showSnack('Copied to clipboard');
                          },
                          icon: const Icon(Icons.copy, size: 16),
                          label: const Text('Copy code'),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: VionaColors.purple),
                            foregroundColor: VionaColors.purple,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: VionaColors.purple.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'Earn 5% of each referred friend\'s entry fees as bonus balance',
                        style: TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Stats
              Row(
                children: [
                  Expanded(
                    child: _statBox('${referrals.length}', 'Referrals'),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _statBox(totalBonus.toStringAsFixed(2), 'Total bonus'),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Apply code
              Text("Have a friend's code?", style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _codeCtrl,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(hintText: 'Enter referral code'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _applying ? null : _applyCode,
                    style: ElevatedButton.styleFrom(minimumSize: const Size(80, 56)),
                    child: _applying
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Apply'),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Referral list
              if (referrals.isNotEmpty) ...[
                Text('Your referrals (${referrals.length})', style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 10),
                ...referrals.map((r) {
                  final bonus = double.tryParse(r['bonusAmount']?.toString() ?? '0') ?? 0;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: VionaColors.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: VionaColors.border),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 36, height: 36,
                          decoration: BoxDecoration(
                            color: VionaColors.purple.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Center(
                            child: Text(
                              (r['email'] as String? ?? 'U').substring(0, 1).toUpperCase(),
                              style: const TextStyle(fontWeight: FontWeight.w900, color: VionaColors.purple),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(r['email'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                              Text(r['joinedAt']?.toString().substring(0, 10) ?? '', style: const TextStyle(fontSize: 11, color: VionaColors.textSecondary)),
                            ],
                          ),
                        ),
                        if (bonus > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: VionaColors.teal.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '+${bonus.toStringAsFixed(2)}',
                              style: const TextStyle(fontWeight: FontWeight.w700, color: VionaColors.teal, fontSize: 12),
                            ),
                          ),
                      ],
                    ),
                  );
                }),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _statBox(String value, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        color: VionaColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: VionaColors.border),
      ),
      child: Column(
        children: [
          Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: VionaColors.purple)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, color: VionaColors.textSecondary)),
        ],
      ),
    );
  }
}
