import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'theme/viona_theme.dart';
import 'services/api_service.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/wallet_screen.dart';
import 'screens/history_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/referrals_screen.dart';
import 'screens/subscription_screen.dart';
import 'screens/partners_screen.dart';

void main() {
  runApp(const ProviderScope(child: VionaApp()));
}

final _router = GoRouter(
  initialLocation: '/',
  redirect: (context, state) async {
    final api = ApiService();
    final hasToken = await api.hasToken();
    final onAuth = state.fullPath == '/login' || state.fullPath == '/register';
    if (!hasToken && !onAuth && state.fullPath != '/') return '/login';
    if (hasToken && onAuth) return '/dashboard';
    return null;
  },
  routes: [
    GoRoute(path: '/', redirect: (_, __) async {
      final hasToken = await ApiService().hasToken();
      return hasToken ? '/dashboard' : '/login';
    }),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
    GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
    GoRoute(path: '/wallet', builder: (_, __) => const WalletScreen()),
    GoRoute(path: '/history', builder: (_, __) => const HistoryScreen()),
    GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
    GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
    GoRoute(path: '/referrals', builder: (_, __) => const ReferralsScreen()),
    GoRoute(path: '/subscription', builder: (_, __) => const SubscriptionScreen()),
    GoRoute(path: '/partners', builder: (_, __) => const PartnersScreen()),
  ],
);

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
