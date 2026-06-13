import 'package:flutter/material.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> with SingleTickerProviderStateMixin {
  final _api = ApiService();
  late final TabController _tabs = TabController(length: 2, vsync: this);

  Map<String, dynamic>? _wallet;
  Map<String, dynamic>? _country;
  List<dynamic> _txs = [];
  bool _loading = true;
  bool _processing = false;

  final _amountCtrl = TextEditingController();
  final _cardCtrl = TextEditingController();
  final _expCtrl = TextEditingController();
  final _cvvCtrl = TextEditingController();
  final _withdrawCtrl = TextEditingController();

  final _quickAmounts = [10, 25, 50, 100, 200];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _amountCtrl.dispose();
    _cardCtrl.dispose();
    _expCtrl.dispose();
    _cvvCtrl.dispose();
    _withdrawCtrl.dispose();
    super.dispose();
  }

  Map<String, dynamic>? _user;

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _api.getWallet(),
        _api.getTransactions(),
        _api.me(),
      ]);
      _wallet = results[0] as Map<String, dynamic>?;
      _txs = results[1] as List<dynamic>;
      _user = results[2] as Map<String, dynamic>?;
      final countryId = _user?['countryId'] ?? 1;
      _country = await _api.getCountry(countryId);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _deposit() async {
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) return;
    if (_wallet == null) { _showSnack('Wallet not loaded', error: true); return; }
    setState(() => _processing = true);
    try {
      await _api.deposit(amount, _wallet?['currency'] ?? 'USD');
      _showSnack('Deposit successful!');
      _amountCtrl.clear();
      await _load();
    } catch (e) {
      _showSnack('$e', error: true);
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  Future<void> _withdraw() async {
    final amount = double.tryParse(_withdrawCtrl.text);
    if (amount == null || amount <= 0) return;
    setState(() => _processing = true);
    try {
      await _api.withdraw(amount);
      _showSnack('Withdrawal submitted!');
      _withdrawCtrl.clear();
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
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: VionaColors.purple)),
      );
    }

    final balance = double.tryParse(_wallet?['balance']?.toString() ?? '0') ?? 0;
    final symbol = _country?['currencySymbol'] ?? '$';
    final currency = _wallet?['currency'] ?? 'USD';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: VionaColors.background,
        title: const Text('Wallet'),
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: VionaColors.purple,
          labelColor: VionaColors.purple,
          unselectedLabelColor: VionaColors.textSecondary,
          tabs: const [Tab(text: 'Top Up'), Tab(text: 'Withdraw')],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: VionaColors.purple,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.all(16),
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
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Available balance', style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 8),
                    ShaderMask(
                      shaderCallback: (b) => const LinearGradient(
                        colors: [VionaColors.purple, VionaColors.teal],
                      ).createShader(b),
                      child: Text(
                        '$symbol${balance.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: -1),
                      ),
                    ),
                    Text(currency, style: Theme.of(context).textTheme.bodyMedium),
                  ],
                ),
              ),
            ),

            SliverFillRemaining(
              child: TabBarView(
                controller: _tabs,
                children: [
                  _buildTopUp(symbol),
                  _buildWithdraw(symbol, balance),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopUp(String symbol) {
    final kycLevel = _user?['kycLevel'] as String? ?? 'none';
    final needsKyc = kycLevel == 'none';
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (needsKyc) ...[
            Container(
              padding: const EdgeInsets.all(14),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: VionaColors.gold.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: VionaColors.gold.withOpacity(0.3)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.warning_amber_outlined, color: VionaColors.gold, size: 18),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Age verification required to deposit. Go to Profile → Account to verify.',
                      style: TextStyle(fontSize: 12, color: VionaColors.gold),
                    ),
                  ),
                ],
              ),
            ),
          ],
          Text('Quick amounts', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: _quickAmounts.map((a) => GestureDetector(
              onTap: () => setState(() => _amountCtrl.text = a.toString()),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: _amountCtrl.text == a.toString() ? VionaColors.purple : VionaColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: _amountCtrl.text == a.toString() ? VionaColors.purple : VionaColors.border,
                  ),
                ),
                child: Text(
                  '$symbol$a',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: _amountCtrl.text == a.toString() ? Colors.white : VionaColors.textPrimary,
                  ),
                ),
              ),
            )).toList(),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              hintText: 'Or enter amount',
              prefixText: symbol,
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 16),
          Text('Card details', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 10),
          TextField(
            controller: _cardCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              hintText: 'Card number',
              prefixIcon: Icon(Icons.credit_card),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _expCtrl,
                  decoration: const InputDecoration(hintText: 'MM/YY'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _cvvCtrl,
                  keyboardType: TextInputType.number,
                  obscureText: true,
                  decoration: const InputDecoration(hintText: 'CVV'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: (_processing || needsKyc) ? null : _deposit,
            icon: _processing
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.add),
            label: Text(needsKyc ? 'Verify age to deposit' : 'Add $symbol${_amountCtrl.text.isEmpty ? "0.00" : _amountCtrl.text}'),
            style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 56)),
          ),
          const SizedBox(height: 24),

          // Transaction history
          Text('Recent transactions', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 8),
          ..._txs.take(10).map((tx) => _TxTile(tx: tx)),
        ],
      ),
    );
  }

  Widget _buildWithdraw(String symbol, double balance) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: VionaColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: VionaColors.border),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, color: VionaColors.textSecondary, size: 18),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Withdrawals require KYC verification (ID document). Processing: 1-3 business days.',
                    style: TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _withdrawCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(hintText: 'Amount to withdraw', prefixText: symbol),
          ),
          const SizedBox(height: 8),
          Text(
            'Available: $symbol${balance.toStringAsFixed(2)}',
            style: const TextStyle(fontSize: 12, color: VionaColors.textSecondary),
          ),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: _processing ? null : _withdraw,
            icon: const Icon(Icons.account_balance_outlined),
            label: const Text('Request withdrawal'),
            style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 56)),
          ),
        ],
      ),
    );
  }
}

class _TxTile extends StatelessWidget {
  final Map<String, dynamic> tx;
  const _TxTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final type = tx['type'] as String? ?? '';
    final amount = double.tryParse(tx['amount']?.toString() ?? '0') ?? 0;
    final isCredit = type == 'prize_payout' || type == 'deposit' || type == 'referral_bonus' || type == 'ad_reward' || type == 'refund';

    IconData icon;
    Color color;
    switch (type) {
      case 'prize_payout':   icon = Icons.emoji_events; color = VionaColors.gold; break;
      case 'deposit':        icon = Icons.add_circle_outline; color = VionaColors.teal; break;
      case 'lottery_entry':  icon = Icons.confirmation_number_outlined; color = VionaColors.purple; break;
      case 'withdrawal':     icon = Icons.arrow_circle_up_outlined; color = VionaColors.danger; break;
      case 'referral_bonus': icon = Icons.people_outline; color = VionaColors.teal; break;
      default:               icon = Icons.swap_horiz; color = VionaColors.textSecondary;
    }

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
            decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  type.replaceAll('_', ' ').split(' ').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' '),
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                Text(
                  tx['description']?.toString() ?? '',
                  style: const TextStyle(fontSize: 11, color: VionaColors.textSecondary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Text(
            '${isCredit ? '+' : '-'}${amount.toStringAsFixed(2)}',
            style: TextStyle(fontWeight: FontWeight.w700, color: isCredit ? VionaColors.teal : VionaColors.danger),
          ),
        ],
      ),
    );
  }
}
