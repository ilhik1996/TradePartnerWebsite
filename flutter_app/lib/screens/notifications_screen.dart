import 'package:flutter/material.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _api = ApiService();
  List<dynamic> _notifications = [];
  bool _loading = true;
  bool _loadError = false;
  bool _marking = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() { _loading = true; _loadError = false; });
    try {
      _notifications = await _api.getNotifications();
    } catch (_) {
      if (mounted) setState(() => _loadError = true);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _markRead(int id) async {
    try {
      await _api.markNotificationRead(id);
      if (!mounted) return;
      setState(() {
        final idx = _notifications.indexWhere((n) => n['id'] == id);
        if (idx != -1) _notifications[idx] = <String, dynamic>{..._notifications[idx] as Map<String, dynamic>, 'isRead': true};
      });
    } catch (_) {}
  }

  Future<void> _markAllRead() async {
    if (_marking) return;
    if (mounted) setState(() => _marking = true);
    try {
      final unread = _notifications.where((n) => !(n['isRead'] as bool? ?? false)).toList();
      await Future.wait(unread.map((n) => _api.markNotificationRead((n['id'] as num).toInt())));
      if (mounted) setState(() => _notifications = _notifications.map((n) => <String, dynamic>{...n as Map<String, dynamic>, 'isRead': true}).toList());
    } catch (_) {}
    if (mounted) setState(() => _marking = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: VionaColors.purple)));
    }

    if (_loadError && _notifications.isEmpty) {
      return Scaffold(
        appBar: AppBar(backgroundColor: VionaColors.background, title: const Text('Notifications')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 48, color: VionaColors.textSecondary),
              const SizedBox(height: 12),
              const Text('Could not load notifications', style: TextStyle(color: VionaColors.textSecondary)),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final unreadCount = _notifications.where((n) => !(n['isRead'] as bool? ?? false)).length;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: VionaColors.background,
        title: Row(
          children: [
            const Text('Notifications'),
            if (unreadCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: VionaColors.purple,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text('$unreadCount', style: const TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w700)),
              ),
            ],
          ],
        ),
        actions: [
          if (unreadCount > 0)
            TextButton(
              onPressed: _marking ? null : _markAllRead,
              child: const Text('Mark all read', style: TextStyle(color: VionaColors.purple, fontSize: 13)),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: VionaColors.purple,
        child: _notifications.isEmpty
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.notifications_none, size: 48, color: VionaColors.textSecondary),
                  SizedBox(height: 12),
                  Text('No notifications yet', style: TextStyle(color: VionaColors.textSecondary)),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _notifications.length,
              itemBuilder: (ctx, i) => _NotifTile(
                notif: _notifications[i],
                onTap: () {
                  final n = _notifications[i];
                  if (!(n['isRead'] as bool? ?? false)) _markRead((n['id'] as num).toInt());
                },
              ),
            ),
      ),
    );
  }
}

class _NotifTile extends StatelessWidget {
  final Map<String, dynamic> notif;
  final VoidCallback onTap;

  const _NotifTile({required this.notif, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final type = notif['type'] as String? ?? '';
    final read = notif['isRead'] as bool? ?? false;

    IconData icon;
    Color color;
    switch (type) {
      case 'winner':                      icon = Icons.emoji_events;           color = VionaColors.gold; break;
      case 'draw_result':                 icon = Icons.casino_outlined;        color = VionaColors.purple; break;
      case 'kyc_approved':                icon = Icons.verified_user_outlined; color = VionaColors.teal; break;
      case 'kyc_rejected':                icon = Icons.gpp_bad_outlined;       color = VionaColors.danger; break;
      case 'payment_failed':              icon = Icons.error_outline;          color = VionaColors.danger; break;
      case 'subscription_created':        icon = Icons.card_membership;        color = VionaColors.teal; break;
      case 'subscription_renewal_failed': icon = Icons.warning_amber_outlined; color = VionaColors.danger; break;
      case 'balance_low':                 icon = Icons.account_balance_wallet_outlined; color = VionaColors.gold; break;
      case 'withdrawal_processed':        icon = Icons.check_circle_outline;   color = VionaColors.teal; break;
      case 'withdrawal_rejected':         icon = Icons.cancel_outlined;        color = VionaColors.danger; break;
      default:                            icon = Icons.info_outline;           color = VionaColors.textSecondary;
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: read ? VionaColors.surface : VionaColors.surface.withOpacity(0.7),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: read ? VionaColors.border : VionaColors.purple.withOpacity(0.3),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    notif['title']?.toString() ?? type,
                    style: TextStyle(
                      fontWeight: read ? FontWeight.w600 : FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    notif['body']?.toString() ?? '',
                    style: const TextStyle(fontSize: 12, color: VionaColors.textSecondary),
                  ),
                ],
              ),
            ),
            if (!read)
              Container(
                width: 8, height: 8,
                margin: const EdgeInsets.only(top: 4),
                decoration: const BoxDecoration(
                  color: VionaColors.purple,
                  shape: BoxShape.circle,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
