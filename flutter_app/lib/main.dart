import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'theme/viona_theme.dart';
import 'services/api_service.dart';
import 'providers/auth_provider.dart';
import 'screens/dashboard_screen.dart';
import 'screens/wallet_screen.dart';
import 'screens/history_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/referrals_screen.dart';
import 'screens/subscription_screen.dart';
import 'screens/partners_screen.dart';

void main() {
  runApp(const ProviderScope(child: VionaApp()));
}

// ─── Router ───────────────────────────────────────────────────────────────────

final _router = GoRouter(
  initialLocation: '/dashboard',
  redirect: (context, state) async {
    final hasToken = await ApiService().hasToken();
    final onAuth = state.matchedLocation == '/login' ||
        state.matchedLocation == '/register';
    if (!hasToken && !onAuth) return '/login';
    if (hasToken && onAuth) return '/dashboard';
    return null;
  },
  routes: [
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),

    // Shell wraps the main tab screens with a persistent bottom nav
    ShellRoute(
      builder: (context, state, child) => _NavShell(child: child),
      routes: [
        GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
        GoRoute(path: '/wallet', builder: (_, __) => const WalletScreen()),
        GoRoute(path: '/history', builder: (_, __) => const HistoryScreen()),
        GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
        GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      ],
    ),

    // Standalone screens (no bottom nav)
    GoRoute(path: '/referrals', builder: (_, __) => const ReferralsScreen()),
    GoRoute(path: '/subscription', builder: (_, __) => const SubscriptionScreen()),
    GoRoute(path: '/partners', builder: (_, __) => const PartnersScreen()),
  ],
);

// ─── App root ─────────────────────────────────────────────────────────────────

class VionaApp extends StatelessWidget {
  const VionaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'VIONA',
      theme: VionaTheme.dark,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}

// ─── Nav shell ────────────────────────────────────────────────────────────────

class _NavShell extends ConsumerStatefulWidget {
  final Widget child;
  const _NavShell({required this.child});

  @override
  ConsumerState<_NavShell> createState() => _NavShellState();
}

class _NavShellState extends ConsumerState<_NavShell> {
  int _unreadNotifs = 0;

  @override
  void initState() {
    super.initState();
    _loadUnreadCount();
  }

  Future<void> _loadUnreadCount() async {
    try {
      final hasToken = await ApiService().hasToken();
      if (!hasToken) return;
      final notifs = await ApiService().getNotifications();
      final count = notifs.where((n) => !(n['isRead'] as bool? ?? false)).length;
      if (mounted) setState(() => _unreadNotifs = count);
    } catch (_) {}
  }

  static const _tabs = [
    '/dashboard',
    '/wallet',
    '/history',
    '/notifications',
    '/profile',
  ];

  int _tabIndex(String location) {
    for (int i = 0; i < _tabs.length; i++) {
      if (location.startsWith(_tabs[i])) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = _tabIndex(location);

    return Scaffold(
      body: widget.child,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: VionaColors.surface,
          border: Border(top: BorderSide(color: VionaColors.border)),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _NavItem(
                  icon: Icons.home_outlined,
                  activeIcon: Icons.home,
                  label: 'Home',
                  isActive: currentIndex == 0,
                  onTap: () => context.go('/dashboard'),
                ),
                _NavItem(
                  icon: Icons.account_balance_wallet_outlined,
                  activeIcon: Icons.account_balance_wallet,
                  label: 'Wallet',
                  isActive: currentIndex == 1,
                  onTap: () => context.go('/wallet'),
                ),
                _NavItem(
                  icon: Icons.history_outlined,
                  activeIcon: Icons.history,
                  label: 'History',
                  isActive: currentIndex == 2,
                  onTap: () => context.go('/history'),
                ),
                _NavItem(
                  icon: Icons.notifications_outlined,
                  activeIcon: Icons.notifications,
                  label: 'Alerts',
                  isActive: currentIndex == 3,
                  badge: _unreadNotifs,
                  onTap: () {
                    setState(() => _unreadNotifs = 0);
                    context.go('/notifications');
                  },
                ),
                _NavItem(
                  icon: Icons.person_outline,
                  activeIcon: Icons.person,
                  label: 'Profile',
                  isActive: currentIndex == 4,
                  onTap: () => context.go('/profile'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool isActive;
  final int badge;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.isActive,
    this.badge = 0,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 60,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  isActive ? activeIcon : icon,
                  color: isActive ? VionaColors.purple : VionaColors.textSecondary,
                  size: 24,
                ),
                if (badge > 0)
                  Positioned(
                    right: -6, top: -4,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(
                        color: VionaColors.danger,
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      child: Text(
                        badge > 99 ? '99+' : '$badge',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          height: 1,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w400,
                color: isActive ? VionaColors.purple : VionaColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
