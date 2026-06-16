import 'package:flutter/material.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';

class PartnersScreen extends StatefulWidget {
  const PartnersScreen({super.key});

  @override
  State<PartnersScreen> createState() => _PartnersScreenState();
}

class _PartnersScreenState extends State<PartnersScreen> {
  final _api = ApiService();
  List<dynamic> _partners = [];
  bool _loading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _partners = await _api.getPartners();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          backgroundColor: const Color(0xFFDC2626),
        ));
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: VionaColors.purple)));
    }

    final filtered = _search.isEmpty
      ? _partners
      : _partners.where((p) =>
          (p['name'] as String? ?? '').toLowerCase().contains(_search.toLowerCase()) ||
          (p['category'] as String? ?? '').toLowerCase().contains(_search.toLowerCase())
        ).toList();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: VionaColors.background,
        title: const Text('Partners'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: VionaColors.purple,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Info banner
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: VionaColors.purple.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: VionaColors.purple.withOpacity(0.25)),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.account_balance_wallet_outlined, color: VionaColors.purple, size: 20),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Pay at partner locations using your VIONA balance. Earn cashback on every purchase.',
                              style: TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Search
                    TextField(
                      onChanged: (v) => setState(() => _search = v),
                      decoration: const InputDecoration(
                        hintText: 'Search partners...',
                        prefixIcon: Icon(Icons.search),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),

            filtered.isEmpty
              ? const SliverFillRemaining(
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.store_outlined, size: 48, color: VionaColors.textSecondary),
                        SizedBox(height: 12),
                        Text('No partners found', style: TextStyle(color: VionaColors.textSecondary)),
                      ],
                    ),
                  ),
                )
              : SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (ctx, i) => _PartnerCard(partner: filtered[i]),
                      childCount: filtered.length,
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _PartnerCard extends StatelessWidget {
  final Map<String, dynamic> partner;
  const _PartnerCard({required this.partner});

  static const _categoryEmoji = {
    'food': '🍔', 'retail': '🛍️', 'pharmacy': '💊', 'telecom': '📱',
    'fuel': '⛽', 'entertainment': '🎬', 'electronics': '🖥️', 'delivery': '📦',
    'beauty': '💄', 'fitness': '💪', 'travel': '✈️', 'finance': '💳',
  };

  @override
  Widget build(BuildContext context) {
    final cashback = double.tryParse(partner['cashbackPercent']?.toString() ?? '0') ?? 0;
    final category = partner['category'] as String? ?? '';
    final logoUrl = partner['logoUrl'] as String?;
    final emoji = _categoryEmoji[category] ?? '🏪';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: VionaColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: VionaColors.border),
      ),
      child: Row(
        children: [
          // Logo / placeholder
          Container(
            width: 52, height: 52,
            decoration: BoxDecoration(
              color: VionaColors.surface2,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: VionaColors.border),
            ),
            child: logoUrl != null
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(11),
                  child: Image.network(logoUrl, fit: BoxFit.cover, errorBuilder: (_, __, ___) =>
                    Center(child: Text(emoji, style: const TextStyle(fontSize: 24)))),
                )
              : Center(child: Text(emoji, style: const TextStyle(fontSize: 24))),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  partner['name'] as String? ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: VionaColors.surface2,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(category, style: const TextStyle(fontSize: 11, color: VionaColors.textSecondary)),
                    ),
                  ],
                ),
                if (partner['description'] != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    partner['description'] as String,
                    style: const TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          if (cashback > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: VionaColors.teal.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                children: [
                  Text(
                    '${cashback.toStringAsFixed(0)}%',
                    style: const TextStyle(fontWeight: FontWeight.w900, color: VionaColors.teal, fontSize: 16),
                  ),
                  const Text('back', style: TextStyle(fontSize: 10, color: VionaColors.teal)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
