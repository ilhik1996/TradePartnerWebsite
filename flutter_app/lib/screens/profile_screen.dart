import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with SingleTickerProviderStateMixin {
  final _api = ApiService();
  late final TabController _tabs = TabController(length: 3, vsync: this);

  Map<String, dynamic>? _user;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _level;
  Map<String, dynamic>? _rg;
  bool _loading = true;

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _api.me(),
        _api.getUserLevel(),
        _api.getResponsibleGaming(),
        _api.getProfile(),
      ]);
      if (mounted) {
        _user = results[0] as Map<String, dynamic>?;
        _level = results[1] as Map<String, dynamic>?;
        _rg = results[2] as Map<String, dynamic>?;
        _profile = results[3] as Map<String, dynamic>?;
        _firstNameCtrl.text = _profile?['firstName'] ?? '';
        _lastNameCtrl.text = _profile?['lastName'] ?? '';
      }
    } catch (e) {
      if (mounted) _showSnack('Failed to load profile: $e', error: true);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    try {
      await _api.updateProfile(
        firstName: _firstNameCtrl.text.trim(),
        lastName: _lastNameCtrl.text.trim(),
      );
      _showSnack('Profile updated');
    } catch (e) {
      _showSnack('$e', error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: VionaColors.surface,
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out', style: TextStyle(color: VionaColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _api.logout();
      if (mounted) context.go('/login');
    }
  }

  void _showSnack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? VionaColors.danger : VionaColors.surface2,
    ));
  }

  // ── KYC ───────────────────────────────────────────────────────────────────

  void _startKycAge() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: VionaColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _KycAgeSheet(onDone: () {
        Navigator.pop(context);
        _showSnack('Age verification submitted — we\'ll notify you within 24 h');
      }),
    );
  }

  void _startKycFull() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: VionaColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _KycFullSheet(onDone: () {
        Navigator.pop(context);
        _showSnack('Full KYC submitted — review takes 1-3 business days');
      }),
    );
  }

  // ── Spending limits ────────────────────────────────────────────────────────

  void _showLimitDialog(String kind, String label) {
    final ctrl = TextEditingController(
      text: switch (kind) {
        'daily'   => _rg?['dailyLimitAmount']?.toString() ?? '',
        'weekly'  => _rg?['weeklyLimitAmount']?.toString() ?? '',
        'monthly' => _rg?['monthlyLimitAmount']?.toString() ?? '',
        _         => '',
      },
    );
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: VionaColors.surface,
        title: Text('Set $label limit'),
        content: TextField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(hintText: 'Amount (leave blank to remove)'),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () { ctrl.dispose(); Navigator.pop(ctx); },
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final val = double.tryParse(ctrl.text.trim());
              ctrl.dispose();
              Navigator.pop(ctx);
              try {
                await _api.updateResponsibleGaming(
                  dailyLimit:   kind == 'daily'   ? val : double.tryParse(_rg?['dailyLimitAmount']?.toString() ?? ''),
                  weeklyLimit:  kind == 'weekly'  ? val : double.tryParse(_rg?['weeklyLimitAmount']?.toString() ?? ''),
                  monthlyLimit: kind == 'monthly' ? val : double.tryParse(_rg?['monthlyLimitAmount']?.toString() ?? ''),
                );
                final updated = await _api.getResponsibleGaming();
                if (mounted) setState(() => _rg = updated);
                _showSnack('$label limit ${val == null ? 'removed' : 'set to ${val.toStringAsFixed(2)}'}');
              } catch (e) {
                _showSnack('$e', error: true);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  // ── Self-exclusion ────────────────────────────────────────────────────────

  void _showSelfExcludeDialog() {
    int? selectedDays;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          backgroundColor: VionaColors.surface,
          title: const Text('Self-exclusion', style: TextStyle(color: VionaColors.danger)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Your account will be locked from entering draws for the selected period. This cannot be reversed.',
                style: TextStyle(fontSize: 13, color: VionaColors.textSecondary),
              ),
              const SizedBox(height: 16),
              ...for (final d in [30, 90, 180, 365])
                RadioListTile<int>(
                  value: d,
                  groupValue: selectedDays,
                  onChanged: (v) => setSt(() => selectedDays = v),
                  title: Text('$d days'),
                  activeColor: VionaColors.danger,
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: VionaColors.danger),
              onPressed: selectedDays == null
                ? null
                : () async {
                    Navigator.pop(ctx);
                    try {
                      await _api.selfExclude(selectedDays!);
                      _showSnack('Self-exclusion activated for $selectedDays days');
                      await _load();
                    } catch (e) {
                      _showSnack('$e', error: true);
                    }
                  },
              child: const Text('Confirm exclusion'),
            ),
          ],
        ),
      ),
    );
  }

  // ── Change password ───────────────────────────────────────────────────────

  void _showChangePasswordDialog() {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    bool saving = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          backgroundColor: VionaColors.surface,
          title: const Text('Change Password'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: currentCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Current password'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: newCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password (min 8 chars)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: confirmCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Confirm new password'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                currentCtrl.dispose(); newCtrl.dispose(); confirmCtrl.dispose();
                Navigator.pop(ctx);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: saving
                ? null
                : () async {
                    if (newCtrl.text != confirmCtrl.text) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(content: Text("Passwords don't match")),
                      );
                      return;
                    }
                    if (newCtrl.text.length < 8) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(content: Text("New password must be at least 8 characters")),
                      );
                      return;
                    }
                    setSt(() => saving = true);
                    try {
                      await _api.changePassword(currentCtrl.text, newCtrl.text);
                      currentCtrl.dispose(); newCtrl.dispose(); confirmCtrl.dispose();
                      if (ctx.mounted) Navigator.pop(ctx);
                      _showSnack('Password changed successfully');
                    } catch (e) {
                      setSt(() => saving = false);
                      _showSnack('$e', error: true);
                    }
                  },
              child: saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Update'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: VionaColors.purple)));
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: VionaColors.background,
        title: const Text('Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: VionaColors.danger),
            onPressed: _logout,
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: VionaColors.purple,
          labelColor: VionaColors.purple,
          unselectedLabelColor: VionaColors.textSecondary,
          tabs: const [Tab(text: 'Account'), Tab(text: 'Level'), Tab(text: 'Safety')],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _buildAccount(),
          _buildLevel(),
          _buildSafety(),
        ],
      ),
    );
  }

  Widget _buildAccount() {
    final kycLevel = _user?['kycLevel'] as String? ?? 'none';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar
          Center(
            child: Column(
              children: [
                Container(
                  width: 80, height: 80,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [VionaColors.purple, VionaColors.teal]),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Center(
                    child: Text(
                      ((_profile?['firstName'] as String?)?.isNotEmpty == true
                        ? (_profile!['firstName'] as String)[0]
                        : 'U').toUpperCase(),
                      style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: Colors.white),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${_profile?['firstName'] ?? ''} ${_profile?['lastName'] ?? ''}'.trim(),
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                Text(_user?['email'] ?? '', style: const TextStyle(color: VionaColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Edit form
          TextField(
            controller: _firstNameCtrl,
            decoration: const InputDecoration(hintText: 'First name', prefixIcon: Icon(Icons.person_outline)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _lastNameCtrl,
            decoration: const InputDecoration(hintText: 'Last name', prefixIcon: Icon(Icons.person_outline)),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _saving ? null : _saveProfile,
            style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
            child: _saving
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Save changes'),
          ),
          const SizedBox(height: 16),

          // Change password
          OutlinedButton.icon(
            onPressed: _showChangePasswordDialog,
            icon: const Icon(Icons.lock_outline, size: 18),
            label: const Text('Change Password'),
            style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
          ),
          const SizedBox(height: 24),

          // KYC
          Text('Identity verification', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 10),
          _KycRow(
            title: 'Age verification',
            subtitle: 'Required before first deposit',
            done: kycLevel != 'none',
            onTap: kycLevel == 'none' ? _startKycAge : null,
          ),
          const SizedBox(height: 8),
          _KycRow(
            title: 'Full KYC (ID + photo)',
            subtitle: 'Required before withdrawal',
            done: kycLevel == 'full',
            onTap: kycLevel == 'age_verified' ? _startKycFull : null,
          ),

          // Referral code
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: VionaColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: VionaColors.border),
            ),
            child: Row(
              children: [
                const Icon(Icons.people_outline, color: VionaColors.purple),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Your referral code', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      Text(
                        _user?['referralCode'] ?? '—',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: VionaColors.purple),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.copy, color: VionaColors.textSecondary, size: 18),
                  onPressed: () {
                    final code = _user?['referralCode'];
                    if (code != null) {
                      Clipboard.setData(ClipboardData(text: code));
                      _showSnack('Copied to clipboard');
                    }
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLevel() {
    final xp = (_level?['xp'] as int?) ?? 0;
    final lvl = (_level?['level'] as int?) ?? 1;
    final curXp = (_level?['currentLevelXp'] as int?) ?? 0;
    final rawNextXp = _level?['nextLevelXp'] as int?;
    final isMaxLevel = rawNextXp == null;
    final nextXp = rawNextXp ?? curXp + 1;
    final badges = (_level?['badges'] as List<dynamic>?) ?? [];
    final range = nextXp - curXp;
    final progress = isMaxLevel ? 1.0 : (range > 0 ? ((xp - curXp) / range).clamp(0.0, 1.0) : 0.0);
    final title = (_level?['title'] as String?) ?? 'Newcomer';

    final levelColors = [
      Colors.grey, Colors.green, Colors.teal, Colors.blue,
      Colors.indigo, VionaColors.purple, Colors.orange, VionaColors.gold,
      Colors.red, const Color(0xFFFF6B6B),
    ];
    final color = levelColors[((lvl - 1).clamp(0, levelColors.length - 1))];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: VionaColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: color.withOpacity(0.4)),
            ),
            child: Column(
              children: [
                Container(
                  width: 80, height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: color, width: 3),
                    color: color.withOpacity(0.12),
                  ),
                  child: Center(
                    child: Text('$lvl', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: color)),
                  ),
                ),
                const SizedBox(height: 12),
                Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  isMaxLevel ? 'Max level — $xp XP total' : '${xp - curXp} / $range XP this level',
                  style: const TextStyle(color: VionaColors.textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: VionaColors.surface2,
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          Align(
            alignment: Alignment.centerLeft,
            child: Text('How to earn XP', style: Theme.of(context).textTheme.bodyMedium),
          ),
          const SizedBox(height: 10),
          ...[
            ('Daily entry', '+10 XP', Icons.bolt),
            ('Win a draw', '+50 XP', Icons.emoji_events),
            ('Refer a friend', '+25 XP', Icons.people_outline),
            ('Subscribe weekly', '+15 XP', Icons.calendar_today_outlined),
            ('Deposit funds', '+5 XP', Icons.account_balance_wallet_outlined),
          ].map((item) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: VionaColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: VionaColors.border),
            ),
            child: Row(
              children: [
                Icon(item.$3, color: VionaColors.purple, size: 18),
                const SizedBox(width: 10),
                Expanded(child: Text(item.$1, style: const TextStyle(fontSize: 13))),
                Text(item.$2, style: const TextStyle(fontWeight: FontWeight.w700, color: VionaColors.purple, fontSize: 13)),
              ],
            ),
          )),

          if (badges.isNotEmpty) ...[
            const SizedBox(height: 24),
            Align(
              alignment: Alignment.centerLeft,
              child: Text('Badges (${badges.length})', style: Theme.of(context).textTheme.bodyMedium),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: badges.map((b) {
                const badgeLabels = {
                  'first_entry': '🎟️ First Entry',
                  'first_win': '🏆 First Win',
                  'streak_7': '🔥 7-Day Streak',
                  'referrer': '🤝 Referrer',
                };
                final badgeId = b as String;
                final label = badgeLabels[badgeId] ?? '🏅 $badgeId';
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: VionaColors.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: VionaColors.gold.withOpacity(0.4)),
                  ),
                  child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                );
              }).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSafety() {
    final excluded = _rg?['selfExcludedUntil'];
    final isExcluded = excluded != null && DateTime.tryParse(excluded)?.isAfter(DateTime.now()) == true;

    double? _getDouble(String key) {
      final v = _rg?[key];
      if (v == null) return null;
      return v is num ? v.toDouble() : double.tryParse(v.toString());
    }

    Widget _limitCard({
      required IconData icon,
      required String title,
      required String limitKey,
      required String spentKey,
      required String dialogKind,
    }) {
      final limit = _getDouble(limitKey);
      final spent = _getDouble(spentKey) ?? 0.0;
      final pct = (limit != null && limit > 0) ? (spent / limit).clamp(0.0, 1.0) : 0.0;
      final color = pct >= 0.9 ? VionaColors.danger : pct >= 0.7 ? VionaColors.gold : VionaColors.purple;

      return InkWell(
        onTap: () => _showLimitDialog(dialogKind, dialogKind),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: VionaColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: VionaColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(icon, size: 16, color: VionaColors.textSecondary),
                  const SizedBox(width: 8),
                  Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                  Text(limit != null ? limit.toStringAsFixed(2) : 'No limit', style: const TextStyle(fontSize: 12, color: VionaColors.textSecondary)),
                ],
              ),
              if (limit != null) ...[
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: pct,
                    backgroundColor: VionaColors.background,
                    color: color,
                    minHeight: 6,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${spent.toStringAsFixed(2)} / ${limit.toStringAsFixed(2)} (${(pct * 100).toStringAsFixed(0)}%)',
                  style: TextStyle(fontSize: 11, color: color),
                ),
              ],
            ],
          ),
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Spending limits', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 10),

          _limitCard(icon: Icons.today, title: 'Daily spending limit',
            limitKey: 'dailyLimitAmount', spentKey: 'spentToday', dialogKind: 'daily'),
          const SizedBox(height: 8),
          _limitCard(icon: Icons.calendar_view_week, title: 'Weekly spending limit',
            limitKey: 'weeklyLimitAmount', spentKey: 'spentThisWeek', dialogKind: 'weekly'),
          const SizedBox(height: 8),
          _limitCard(icon: Icons.calendar_month, title: 'Monthly spending limit',
            limitKey: 'monthlyLimitAmount', spentKey: 'spentThisMonth', dialogKind: 'monthly'),
          const SizedBox(height: 24),

          if (isExcluded)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: VionaColors.danger.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: VionaColors.danger.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.block, color: VionaColors.danger),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Self-exclusion active', style: TextStyle(fontWeight: FontWeight.w700, color: VionaColors.danger)),
                        Text(
                          'Until ${DateTime.parse(excluded).toLocal().toString().substring(0, 10)}',
                          style: const TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            )
          else
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: VionaColors.danger.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: VionaColors.danger.withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.block, color: VionaColors.danger, size: 18),
                      SizedBox(width: 8),
                      Text('Self-exclusion', style: TextStyle(fontWeight: FontWeight.w700, color: VionaColors.danger)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Lock your account from entering draws for a period of your choice. This cannot be reversed during the exclusion period.',
                    style: TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: _showSelfExcludeDialog,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: VionaColors.danger),
                      foregroundColor: VionaColors.danger,
                    ),
                    child: const Text('Self-exclude'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── KYC row widget ─────────────────────────────────────────────────────────

class _KycRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool done;
  final VoidCallback? onTap;

  const _KycRow({required this.title, required this.subtitle, required this.done, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: VionaColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: done ? VionaColors.teal.withOpacity(0.4) : VionaColors.border),
      ),
      child: Row(
        children: [
          Icon(
            done ? Icons.check_circle : Icons.radio_button_unchecked,
            color: done ? VionaColors.teal : VionaColors.textSecondary,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                Text(subtitle, style: const TextStyle(fontSize: 11, color: VionaColors.textSecondary)),
              ],
            ),
          ),
          if (!done && onTap != null)
            TextButton(
              onPressed: onTap,
              child: const Text('Verify →', style: TextStyle(color: VionaColors.purple, fontSize: 12)),
            ),
          if (!done && onTap == null)
            const Text('Complete step 1 first', style: TextStyle(fontSize: 10, color: VionaColors.textSecondary)),
        ],
      ),
    );
  }
}

// ── KYC bottom sheets ──────────────────────────────────────────────────────

class _KycAgeSheet extends StatefulWidget {
  final VoidCallback onDone;
  const _KycAgeSheet({required this.onDone});

  @override
  State<_KycAgeSheet> createState() => _KycAgeSheetState();
}

class _KycAgeSheetState extends State<_KycAgeSheet> {
  final _dobCtrl = TextEditingController();
  bool _submitting = false;
  final _api = ApiService();

  @override
  void dispose() {
    _dobCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_dobCtrl.text.isEmpty) return;
    setState(() => _submitting = true);
    try {
      final result = await _api.startKyc(level: 'age', dateOfBirth: _dobCtrl.text.trim());
      if (mounted) {
        final sdkToken = result?['sdkToken'] as String?;
        if (sdkToken != null) {
          // Sumsub configured: open WebSDK in browser
          final uri = Uri.parse('https://api.sumsub.com/idensic/l/#/$sdkToken');
          await launchUrl(uri, mode: LaunchMode.externalApplication);
          if (mounted) Navigator.pop(context);
        } else {
          widget.onDone();
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: VionaColors.danger),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Age verification', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
            ],
          ),
          const Text('Confirm your date of birth to verify you are 18 or older.', style: TextStyle(color: VionaColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 16),
          TextField(
            controller: _dobCtrl,
            keyboardType: TextInputType.datetime,
            decoration: const InputDecoration(
              hintText: 'Date of birth (YYYY-MM-DD)',
              prefixIcon: Icon(Icons.cake_outlined),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Your information is encrypted and only used for age verification.',
            style: TextStyle(fontSize: 11, color: VionaColors.textSecondary),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _submitting ? null : _submit,
            style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
            child: _submitting
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Submit'),
          ),
        ],
      ),
    );
  }
}

class _KycFullSheet extends StatefulWidget {
  final VoidCallback onDone;
  const _KycFullSheet({required this.onDone});

  @override
  State<_KycFullSheet> createState() => _KycFullSheetState();
}

class _KycFullSheetState extends State<_KycFullSheet> {
  bool _submitting = false;
  final _api = ApiService();

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      final result = await _api.startKyc(level: 'full');
      if (mounted) {
        final sdkToken = result?['sdkToken'] as String?;
        if (sdkToken != null) {
          final uri = Uri.parse('https://api.sumsub.com/idensic/l/#/$sdkToken');
          await launchUrl(uri, mode: LaunchMode.externalApplication);
          if (mounted) Navigator.pop(context);
        } else {
          widget.onDone();
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: VionaColors.danger),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Full KYC', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
            ],
          ),
          const Text('Complete identity verification to unlock withdrawals.', style: TextStyle(color: VionaColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: VionaColors.purple.withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: VionaColors.purple.withOpacity(0.2)),
            ),
            child: Row(
              children: [
                const Icon(Icons.security_outlined, color: VionaColors.purple, size: 20),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'You\'ll be taken to our secure verification partner (Sumsub) to upload your ID and complete a liveness check.',
                    style: TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _submitting ? null : _submit,
            style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
            child: _submitting
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Start verification'),
          ),
        ],
      ),
    );
  }
}

