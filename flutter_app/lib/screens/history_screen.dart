import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final _api = ApiService();
  List<dynamic> _draws = [];
  bool _loading = true;
  int _totalEntries = 0;
  int _totalWins = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final user = await _api.me();
      final countryId = user['countryId'] ?? 1;
      _draws = await _api.getDrawHistory(countryId);
      _totalEntries = _draws.where((d) => d['myEntry'] != null).length;
      _totalWins = _draws.where((d) => d['isWinner'] == true).length;
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: VionaColors.purple)));
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: VionaColors.background,
        title: const Text('Draw history'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: VionaColors.purple,
        child: CustomScrollView(
          slivers: [
            // Stats
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    _StatTile(label: 'Total draws', value: _draws.length.toString()),
                    const SizedBox(width: 8),
                    _StatTile(label: 'My entries', value: _totalEntries.toString()),
                    const SizedBox(width: 8),
                    _StatTile(label: 'Wins', value: _totalWins.toString(), highlight: _totalWins > 0),
                  ],
                ),
              ),
            ),

            _draws.isEmpty
              ? const SliverFillRemaining(
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.history_toggle_off, size: 48, color: VionaColors.textSecondary),
                        SizedBox(height: 12),
                        Text('No draws yet', style: TextStyle(color: VionaColors.textSecondary)),
                      ],
                    ),
                  ),
                )
              : SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (ctx, i) => _DrawCard(draw: _draws[i]),
                      childCount: _draws.length,
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _StatTile({required this.label, required this.value, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: VionaColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: highlight ? VionaColors.gold : VionaColors.border),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: highlight ? VionaColors.gold : VionaColors.textPrimary,
              ),
            ),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 11, color: VionaColors.textSecondary)),
          ],
        ),
      ),
    );
  }
}

class _DrawCard extends StatefulWidget {
  final Map<String, dynamic> draw;
  const _DrawCard({required this.draw});

  @override
  State<_DrawCard> createState() => _DrawCardState();
}

class _DrawCardState extends State<_DrawCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final draw = widget.draw;
    final isWinner = draw['isWinner'] == true;
    final myEntry = draw['myEntry'];
    final participated = myEntry != null;
    final pool = double.tryParse(draw['totalPool']?.toString() ?? '0') ?? 0;
    final prize = double.tryParse(draw['prizeAmount']?.toString() ?? '0') ?? 0;
    final totalEntries = (draw['totalEntries'] as int?) ?? 0;
    final myTicket = myEntry?['ticketNumber'] as int? ?? 0;
    final winnerTicket = (draw['winnerTicketNumber'] as int?) ?? 0;
    final distance = (myTicket - winnerTicket).abs();
    final proximity = participated && totalEntries > 0
      ? ((1 - (distance / totalEntries).clamp(0.0, 1.0)) * 100).toInt()
      : 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: VionaColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isWinner ? VionaColors.gold : participated ? VionaColors.purple.withOpacity(0.3) : VionaColors.border,
        ),
      ),
      child: Column(
        children: [
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: isWinner ? VionaColors.gold.withOpacity(0.12) : VionaColors.surface2,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      isWinner ? Icons.emoji_events : participated ? Icons.confirmation_number_outlined : Icons.remove_circle_outline,
                      color: isWinner ? VionaColors.gold : participated ? VionaColors.purple : VionaColors.textSecondary,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (draw['drawDate']?.toString() ?? '').split('T').first,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                        ),
                        Text(
                          isWinner ? 'You won! 🎉' : participated ? 'Participated' : 'Not entered',
                          style: TextStyle(
                            fontSize: 12,
                            color: isWinner ? VionaColors.gold : participated ? VionaColors.teal : VionaColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        prize > 0 ? '${prize.toStringAsFixed(2)}' : '${pool.toStringAsFixed(2)}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        '$totalEntries entries',
                        style: const TextStyle(fontSize: 11, color: VionaColors.textSecondary),
                      ),
                    ],
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    _expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                    color: VionaColors.textSecondary, size: 20,
                  ),
                ],
              ),
            ),
          ),

          if (_expanded && participated) ...[
            const Divider(color: VionaColors.border, height: 1),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('My ticket', style: TextStyle(fontSize: 12, color: VionaColors.textSecondary)),
                      Text('#$myTicket', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                  if (winnerTicket > 0) ...[
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Winner ticket', style: TextStyle(fontSize: 12, color: VionaColors.textSecondary)),
                        Text('#$winnerTicket', style: const TextStyle(fontWeight: FontWeight.w700)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const Text('How close you were', style: TextStyle(fontSize: 12, color: VionaColors.textSecondary)),
                    const SizedBox(height: 6),
                    _ProximityBar(proximity: proximity),
                    const SizedBox(height: 4),
                    Text(
                      '$proximity% close to winning',
                      style: TextStyle(
                        fontSize: 11,
                        color: proximity > 80 ? VionaColors.gold : VionaColors.textSecondary,
                      ),
                    ),
                  ],
                  if (draw['status'] == 'completed' && draw['rngProof'] != null) ...[
                    const SizedBox(height: 12),
                    GestureDetector(
                      onTap: () async {
                        final drawId = draw['id'];
                        final uri = Uri.parse('https://viona.app/api/draws/$drawId/verify');
                        if (await canLaunchUrl(uri)) launchUrl(uri, mode: LaunchMode.externalApplication);
                      },
                      child: const Row(
                        children: [
                          Icon(Icons.verified_outlined, size: 14, color: VionaColors.teal),
                          SizedBox(width: 4),
                          Text('Verify fairness', style: TextStyle(fontSize: 12, color: VionaColors.teal, decoration: TextDecoration.underline, decorationColor: VionaColors.teal)),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProximityBar extends StatelessWidget {
  final int proximity;
  const _ProximityBar({required this.proximity});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: Stack(
        children: [
          Container(height: 8, color: VionaColors.surface2),
          FractionallySizedBox(
            widthFactor: proximity / 100,
            child: Container(
              height: 8,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    VionaColors.purple,
                    proximity > 80 ? VionaColors.gold : VionaColors.teal,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
