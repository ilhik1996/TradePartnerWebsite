import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../widgets/viona_card.dart';
import '../widgets/countdown_timer.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  final _api = ApiService();
  final _ws = WebSocketService();

  Map<String, dynamic>? _user;
  Map<String, dynamic>? _country;
  Map<String, dynamic>? _draw;
  Map<String, dynamic>? _wallet;
  dynamic _myEntry;
  bool _loading = true;
  bool _entering = false;
  bool _autoParticipate = true;

  // Free entry modal
  bool _showFreeEntry = false;
  final _freeNameCtrl = TextEditingController();
  final _freeEmailCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadData();
    _ws.connect();
    _ws.addHandler(_onWsMessage);
  }

  @override
  void dispose() {
    _ws.removeHandler(_onWsMessage);
    _freeNameCtrl.dispose();
    _freeEmailCtrl.dispose();
    super.dispose();
  }

  void _onWsMessage(Map<String, dynamic> msg) {
    if (!mounted) return;
    if (msg['type'] == 'draw_pool_update' && _draw != null && msg['drawId'] == _draw!['id']) {
      setState(() {
        _draw!['totalPool'] = msg['totalPool'];
        _draw!['totalEntries'] = msg['totalEntries'];
      });
    }
    if (msg['type'] == 'draw_completed') {
      _loadData();
    }
  }

  Future<void> _loadData() async {
    try {
      _user = await _api.me();
      final countryId = _user?['countryId'] ?? 1;
      final results = await Future.wait([
        _api.getCountry(countryId),
        _api.getWallet(),
        _api.getTodayDraw(countryId),
      ]);
      _country = results[0] as Map<String, dynamic>?;
      _wallet = results[1] as Map<String, dynamic>?;
      _draw = results[2] as Map<String, dynamic>?;
      if (_draw != null) {
        _myEntry = await _api.getMyEntry(_draw!['id']);
      }
      _autoParticipate = _user?['autoParticipate'] ?? true;
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _enterPaid() async {
    if (_draw == null) return;
    setState(() => _entering = true);
    try {
      final result = await _api.enterDraw(_draw!['id']);
      _showSnack('You\'re in! 🎉 Ticket #${result['ticketNumber']}');
      await _loadData();
    } catch (e) {
      _showSnack('Could not enter: $e', error: true);
    } finally {
      if (mounted) setState(() => _entering = false);
    }
  }

  Future<void> _enterFree() async {
    if (_draw == null) return;
    final name = _freeNameCtrl.text.trim().split(' ');
    final email = _freeEmailCtrl.text.trim();
    if (name.isEmpty || email.isEmpty) return;
    try {
      final result = await _api.enterFree(
        _draw!['id'],
        firstName: name.first,
        lastName: name.length > 1 ? name.last : '',
        email: email,
        countryId: _user?['countryId'] ?? 1,
      );
      if (mounted) setState(() => _showFreeEntry = false);
      _showSnack('Free entry submitted! 🎉 Ticket #${result['ticketNumber']}');
      await _loadData();
    } catch (e) {
      _showSnack('$e', error: true);
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
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: VionaColors.purple)),
      );
    }

    final balance = double.tryParse(_wallet?['balance']?.toString() ?? '0') ?? 0;
    final pool = double.tryParse(_draw?['totalPool']?.toString() ?? '0') ?? 0;
    final prizePercent = double.tryParse(_country?['prizePercentage']?.toString() ?? '50') ?? 50;
    final prize = pool * prizePercent / 100;
    final entryAmt = double.tryParse(_country?['entryAmountDaily']?.toString() ?? '5') ?? 5;
    final symbol = _country?['currencySymbol'] ?? '₴';
    final drawHour = _country?['drawHourUtc'] ?? 21;
    final canAfford = balance >= entryAmt;
    final isOpen = _draw?['status'] == 'open';

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _loadData,
          color: VionaColors.purple,
          child: CustomScrollView(
            slivers: [
              // App bar
              SliverAppBar(
                floating: true,
                backgroundColor: VionaColors.background,
                title: Row(
                  children: [
                    Container(
                      width: 32, height: 32,
                      decoration: BoxDecoration(
                        color: VionaColors.purple,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.emoji_events, color: Colors.white, size: 18),
                    ),
                    const SizedBox(width: 8),
                    const Text('VIONA', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                  ],
                ),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.notifications_outlined),
                    onPressed: () => context.push('/notifications'),
                  ),
                  IconButton(
                    icon: const Icon(Icons.person_outline),
                    onPressed: () => context.push('/profile'),
                  ),
                ],
              ),

              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // Prize pool
                    VionaPrizeCard(
                      amount: prize.toStringAsFixed(2),
                      currency: symbol,
                      subtitle: Column(
                        children: [
                          Text(
                            '50% of $symbol${pool.toStringAsFixed(2)} · ${_draw?['totalEntries'] ?? 0} entries',
                            style: Theme.of(context).textTheme.bodyMedium,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 12),
                          CountdownTimer(targetHourUtc: drawHour),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Entry status / buttons
                    if (_myEntry != null)
                      VionaCard(
                        borderColor: VionaColors.teal.withOpacity(0.3),
                        child: Row(
                          children: [
                            Container(
                              width: 44, height: 44,
                              decoration: BoxDecoration(
                                color: VionaColors.teal.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.star, color: VionaColors.teal),
                            ),
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text("You're in today's draw!", style: TextStyle(fontWeight: FontWeight.w700)),
                                Text(
                                  'Ticket #${_myEntry['ticketNumber']} · ${_myEntry['type'] == 'paid' ? 'Paid' : 'Free'} entry',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                              ],
                            ),
                          ],
                        ),
                      )
                    else ...[
                      // Paid entry
                      ElevatedButton.icon(
                        onPressed: (_entering || !canAfford || !isOpen) ? null : _enterPaid,
                        icon: _entering
                          ? const SizedBox(width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.bolt),
                        label: Text(
                          !canAfford
                            ? 'Top up to enter ($symbol${entryAmt.toStringAsFixed(2)})'
                            : 'Enter draw — $symbol${entryAmt.toStringAsFixed(2)}',
                        ),
                        style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 56)),
                      ),
                      const SizedBox(height: 8),
                      // Free entry
                      OutlinedButton.icon(
                        onPressed: () => setState(() => _showFreeEntry = true),
                        icon: const Icon(Icons.card_giftcard),
                        label: const Text('Free entry (no payment needed)'),
                      ),
                    ],
                    const SizedBox(height: 12),

                    // Balance
                    VionaCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('My Balance', style: Theme.of(context).textTheme.bodyMedium),
                              TextButton(
                                onPressed: () => context.push('/wallet'),
                                child: const Text('Manage →', style: TextStyle(color: VionaColors.purple)),
                              ),
                            ],
                          ),
                          ShaderMask(
                            shaderCallback: (b) => const LinearGradient(
                              colors: [VionaColors.purple, VionaColors.teal],
                            ).createShader(b),
                            child: Text(
                              '$symbol${balance.toStringAsFixed(2)}',
                              style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: Colors.white),
                            ),
                          ),
                          const SizedBox(height: 12),
                          ElevatedButton(
                            onPressed: () => context.push('/wallet'),
                            child: const Text('Top up balance'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Auto-participate toggle
                    VionaCard(
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Auto-participate', style: TextStyle(fontWeight: FontWeight.w700)),
                                const SizedBox(height: 2),
                                Text(
                                  'Enter each draw automatically when your balance has funds.',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                              ],
                            ),
                          ),
                          Switch(
                            value: _autoParticipate,
                            activeColor: VionaColors.purple,
                            onChanged: (v) async {
                              setState(() => _autoParticipate = v);
                              await _api.setAutoParticipate(v);
                            },
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Quick navigation grid
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 2,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: 2.8,
                      children: [
                        _quickLink(Icons.account_circle_outlined, 'Account', () => context.push('/profile')),
                        _quickLink(Icons.history, 'History', () => context.push('/history')),
                        _quickLink(Icons.account_balance_wallet_outlined, 'Wallet', () => context.push('/wallet')),
                        _quickLink(Icons.people_outline, 'Refer', () => context.push('/referrals')),
                        _quickLink(Icons.calendar_today_outlined, 'Subscribe', () => context.push('/subscription')),
                        _quickLink(Icons.store_outlined, 'Partners', () => context.push('/partners')),
                      ],
                    ),
                    const SizedBox(height: 32),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ),

      // Free entry bottom sheet
      bottomSheet: _showFreeEntry ? _buildFreeEntrySheet() : null,
    );
  }

  Widget _quickLink(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: VionaColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: VionaColors.border),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
          children: [
            Icon(icon, color: VionaColors.purple, size: 20),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ],
        ),
      ),
    );
  }

  Widget _buildFreeEntrySheet() {
    return Container(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      decoration: const BoxDecoration(
        color: VionaColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: VionaColors.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Free entry', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              IconButton(onPressed: () => setState(() => _showFreeEntry = false), icon: const Icon(Icons.close)),
            ],
          ),
          const Text('No payment required. One entry per person per draw.'),
          const SizedBox(height: 16),
          TextField(controller: _freeNameCtrl, decoration: const InputDecoration(hintText: 'Full name')),
          const SizedBox(height: 8),
          TextField(
            controller: _freeEmailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(hintText: 'Email address'),
          ),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: _enterFree, child: const Text('Get free ticket')),
        ],
      ),
    );
  }
}
