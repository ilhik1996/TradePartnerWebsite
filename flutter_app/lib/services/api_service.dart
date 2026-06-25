import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:meta/meta.dart';

class ApiService {
  static const String _baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://viona.app/api',
  );

  // Public accessor so other screens can build URLs without duplicating the constant
  static String get baseUrl => _baseUrl;

  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  @visibleForTesting
  Dio get dioForTesting => _dio;

  final _storage = const FlutterSecureStorage();
  late final Dio _dio = Dio(BaseOptions(
    baseUrl: _baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
    headers: {'Content-Type': 'application/json'},
  ))..interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await _storage.read(key: 'viona_token');
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    },
    onError: (e, handler) async {
      if (e.response?.statusCode == 401) {
        await _storage.delete(key: 'viona_token');
      }
      handler.next(e);
    },
  ));

  // ── Auth ──────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> register({
    String? email, String? phone, required String password, int? countryId,
    bool autoParticipate = true,
  }) async {
    final r = await _dio.post('/auth/register', data: {
      if (email != null) 'email': email,
      if (phone != null) 'phone': phone,
      'password': password,
      if (countryId != null) 'countryId': countryId,
      'autoParticipate': autoParticipate,
    });
    final token = r.data['token'] as String?;
    if (token != null) await _storage.write(key: 'viona_token', value: token);
    return r.data;
  }

  Future<Map<String, dynamic>> login(String identifier, String password) async {
    final r = await _dio.post('/auth/login', data: {
      'identifier': identifier, 'password': password,
    });
    final token = r.data['token'] as String?;
    if (token != null) await _storage.write(key: 'viona_token', value: token);
    return r.data;
  }

  Future<Map<String, dynamic>> me() async {
    final r = await _dio.get('/auth/me');
    return r.data;
  }

  Future<void> logout() async {
    try {
      await _dio.post('/auth/logout');
    } catch (_) {
      // best-effort — always clear local token even if server is unreachable
    }
    await _storage.delete(key: 'viona_token');
  }

  Future<Map<String, dynamic>> changePassword(
    String currentPassword,
    String newPassword,
  ) async {
    final r = await _dio.patch('/auth/password', data: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
    final token = r.data['token'] as String?;
    if (token != null) await _storage.write(key: 'viona_token', value: token);
    return r.data;
  }

  Future<bool> hasToken() async {
    final t = await _storage.read(key: 'viona_token');
    return t != null;
  }

  // ── Countries ─────────────────────────────────────────────────────────────

  Future<List<dynamic>> getCountries() async {
    final r = await _dio.get('/countries');
    return r.data;
  }

  Future<Map<String, dynamic>> getCountry(int id) async {
    final r = await _dio.get('/countries/$id');
    return r.data;
  }

  // ── Draws ─────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> getTodayDraw(int countryId) async {
    try {
      final r = await _dio.get('/draws/today/$countryId');
      return r.data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<List<dynamic>> getDrawHistory(int countryId) async {
    final r = await _dio.get('/draws/history/$countryId');
    return r.data;
  }

  Future<Map<String, dynamic>> enterDraw(int drawId) async {
    final r = await _dio.post('/draws/$drawId/enter');
    return r.data;
  }

  Future<Map<String, dynamic>> enterFree(int drawId, {
    required String firstName, required String lastName,
    required String email, required int countryId,
  }) async {
    final r = await _dio.post('/draws/$drawId/enter-free', data: {
      'firstName': firstName, 'lastName': lastName,
      'email': email, 'countryId': countryId,
    });
    return r.data;
  }

  Future<dynamic> getMyEntry(int drawId) async {
    final r = await _dio.get('/draws/$drawId/my-entry');
    return r.data;
  }

  // ── Wallet ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> getWallet() async {
    final r = await _dio.get('/wallet');
    return r.data;
  }

  Future<List<dynamic>> getTransactions({int limit = 20, int offset = 0}) async {
    final r = await _dio.get('/wallet/transactions?limit=$limit&offset=$offset');
    return r.data;
  }

  Future<Map<String, dynamic>> deposit(double amount, String currency) async {
    final r = await _dio.post('/wallet/deposit', data: {
      'amount': amount, 'currency': currency,
    });
    return r.data;
  }

  Future<Map<String, dynamic>> withdraw(double amount) async {
    final r = await _dio.post('/wallet/withdraw', data: {'amount': amount});
    return r.data;
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> getProfile() async {
    final r = await _dio.get('/profile');
    return r.data;
  }

  Future<void> updateProfile({String? firstName, String? lastName}) async {
    await _dio.patch('/profile', data: {
      if (firstName != null) 'firstName': firstName,
      if (lastName != null) 'lastName': lastName,
    });
  }

  Future<void> setAutoParticipate(bool enabled) async {
    await _dio.patch('/settings/auto-participate', data: {'enabled': enabled});
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  Future<List<dynamic>> getNotifications() async {
    final r = await _dio.get('/notifications');
    return r.data;
  }

  Future<void> markNotificationRead(int id) async {
    await _dio.patch('/notifications/$id/read');
  }

  Future<void> markAllNotificationsRead() async {
    await _dio.patch('/notifications/read-all');
  }

  // ── Referrals ─────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getReferrals() async {
    final r = await _dio.get('/referrals/my');
    return r.data;
  }

  Future<Map<String, dynamic>> applyReferralCode(String code) async {
    final r = await _dio.post('/referrals/apply', data: {'code': code});
    return r.data;
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  Future<dynamic> getSubscription() async {
    final r = await _dio.get('/subscription');
    return r.data;
  }

  Future<Map<String, dynamic>> createSubscription(String type) async {
    final r = await _dio.post('/subscription', data: {'type': type});
    return r.data;
  }

  Future<void> cancelSubscription(int id) async {
    await _dio.delete('/subscription/$id');
  }

  Future<List<dynamic>> getSubscriptionHistory() async {
    final r = await _dio.get('/subscription/history');
    return r.data;
  }

  // ── Gamification ──────────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> getUserLevel() async {
    final r = await _dio.get('/gamification/me');
    return r.data;
  }

  Future<List<dynamic>> getLeaderboard({int limit = 10}) async {
    final r = await _dio.get('/gamification/leaderboard?limit=$limit');
    return r.data;
  }

  // ── Partners ──────────────────────────────────────────────────────────────

  Future<List<dynamic>> getPartners() async {
    final r = await _dio.get('/partners');
    return r.data;
  }

  // ── KYC ───────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> startKyc({
    required String level,
    String? dateOfBirth,
  }) async {
    final r = await _dio.post('/kyc/start', data: {
      'level': level,
      if (dateOfBirth != null) 'dateOfBirth': dateOfBirth,
    });
    return r.data as Map<String, dynamic>;
  }

  // ── Responsible gaming ────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> getResponsibleGaming() async {
    try {
      final r = await _dio.get('/settings/responsible-gaming');
      return r.data as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  Future<void> updateResponsibleGaming({
    double? dailyLimit,
    double? weeklyLimit,
    double? monthlyLimit,
  }) async {
    await _dio.patch('/settings/responsible-gaming', data: {
      'dailyLimitAmount': dailyLimit,
      'weeklyLimitAmount': weeklyLimit,
      'monthlyLimitAmount': monthlyLimit,
    });
  }

  Future<Map<String, dynamic>> selfExclude(int days) async {
    final r = await _dio.post('/settings/self-exclude', data: {'days': days});
    return r.data;
  }
}
