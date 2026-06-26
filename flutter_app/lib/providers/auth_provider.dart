import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api_service.dart';

// ─── Auth state ───────────────────────────────────────────────────────────────

class AuthState {
  final Map<String, dynamic>? user;
  final bool loading;
  final String? error;

  const AuthState({this.user, this.loading = false, this.error});

  bool get isAuthenticated => user != null;

  AuthState copyWith({Map<String, dynamic>? user, bool? loading, String? error}) {
    return AuthState(
      user: user ?? this.user,
      loading: loading ?? this.loading,
      error: error ?? this.error,
    );
  }
}

// ─── Notifier ─────────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiService _api;

  AuthNotifier(this._api) : super(const AuthState(loading: true)) {
    _init();
  }

  Future<void> _init() async {
    try {
      final hasToken = await _api.hasToken();
      if (hasToken) {
        final user = await _api.me();
        state = AuthState(user: user);
      } else {
        state = const AuthState();
      }
    } catch (_) {
      state = const AuthState();
    }
  }

  Future<void> login(String identifier, String password) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final result = await _api.login(identifier, password);
      state = AuthState(user: result['user'] as Map<String, dynamic>?);
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: e.toString().replaceFirst('Exception: ', ''),
      );
      rethrow;
    }
  }

  Future<void> register({
    String? email,
    String? phone,
    required String password,
    int? countryId,
  }) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final result = await _api.register(
        email: email,
        phone: phone,
        password: password,
        countryId: countryId,
      );
      state = AuthState(user: result['user'] as Map<String, dynamic>?);
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: e.toString().replaceFirst('Exception: ', ''),
      );
      rethrow;
    }
  }

  Future<void> logout() async {
    await _api.logout();
    state = const AuthState();
  }

  Future<void> refresh() async {
    try {
      final user = await _api.me();
      state = state.copyWith(user: user);
    } catch (_) {
      await logout();
    }
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ApiService());
});

final currentUserProvider = Provider<Map<String, dynamic>?>((ref) {
  return ref.watch(authProvider).user;
});

final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authProvider).isAuthenticated;
});
