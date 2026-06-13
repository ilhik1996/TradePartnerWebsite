import 'package:flutter/material.dart';
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
  Map<String, dynamic>? _level;
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
      _user = await _api.me();
      _level = await _api.getUserLevel();
      _firstNameCtrl.text = _user?['firstName'] ?? '';
      _lastNameCtrl.text = _user?['lastName'] ?? '';
    } catch (_) {}
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
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out', style: TextStyle(color: VionaColors.danger))),
        ],
      ),
    );
    if (confirmed == true) {
      await _api.logout();
      if (mounted) Navigator.of(context).pushNamedAndRemoveUntil('/', (r) => false);
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
    final kycSteps = [
      ('Age verification', kycLevel != 'none', 'Required before first deposit'),
      ('Full KYC (ID + photo)', kycLevel == 'full', 'Required before withdrawal'),
    ];

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
                      (_user?['firstName'] as String? ?? 'U').substring(0, 1).toUpperCase(),
                      style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: Colors.white),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${_user?['firstName'] ?? ''} ${_user?['lastName'] ?? ''}'.trim(),
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
          const SizedBox(height: 24),

          // KYC
          Text('Identity verification', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 10),
          ...kycSteps.map((step) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: VionaColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: step.$2 ? VionaColors.teal.withOpacity(0.4) : VionaColors.border),
            ),
            child: Row(
              children: [
                Icon(
                  step.$2 ? Icons.check_circle : Icons.radio_button_unchecked,
                  color: step.$2 ? VionaColors.teal : VionaColors.textSecondary,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(step.$1, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      Text(step.$3, style: const TextStyle(fontSize: 11, color: VionaColors.textSecondary)),
                    ],
                  ),
                ),
                if (!step.$2)
                  TextButton(
                    onPressed: () {},
                    child: const Text('Verify →', style: TextStyle(color: VionaColors.purple, fontSize: 12)),
                  ),
              ],
            ),
          )),

          // Referral code
          const SizedBox(height: 16),
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
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Your referral code', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    Text(
                      _user?['referralCode'] ?? '—',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: VionaColors.purple),
                    ),
                  ],
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
    final nextXp = (_level?['nextLevelXp'] as int?) ?? 100;
    final badges = (_level?['badges'] as List<dynamic>?) ?? [];
    final progress = nextXp > 0 ? (xp / nextXp).clamp(0.0, 1.0) : 0.0;
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
          // Level badge
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
                Text('$xp / $nextXp XP', style: const TextStyle(color: VionaColors.textSecondary, fontSize: 13)),
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

          // How to earn XP
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
              children: badges.map((b) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: VionaColors.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: VionaColors.gold.withOpacity(0.4)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('🏅', style: TextStyle(fontSize: 14)),
                    const SizedBox(width: 6),
                    Text(b['name'] as String? ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                  ],
                ),
              )).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSafety() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Responsible gaming', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 10),

          _SafetyCard(
            icon: Icons.attach_money,
            title: 'Daily spending limit',
            subtitle: 'Cap how much you can spend per day',
            onTap: () {},
          ),
          const SizedBox(height: 8),
          _SafetyCard(
            icon: Icons.calendar_today_outlined,
            title: 'Weekly spending limit',
            subtitle: 'Cap your weekly entry spending',
            onTap: () {},
          ),
          const SizedBox(height: 8),
          _SafetyCard(
            icon: Icons.date_range_outlined,
            title: 'Monthly spending limit',
            subtitle: 'Hard ceiling for the month',
            onTap: () {},
          ),
          const SizedBox(height: 24),

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
                  onPressed: () {},
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

class _SafetyCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _SafetyCard({required this.icon, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: VionaColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: VionaColors.border),
        ),
        child: Row(
          children: [
            Icon(icon, color: VionaColors.purple, size: 20),
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
            const Icon(Icons.chevron_right, color: VionaColors.textSecondary),
          ],
        ),
      ),
    );
  }
}
