import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:viona/services/api_service.dart';

void main() {
  late DioAdapter dioAdapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    dioAdapter = DioAdapter(dio: ApiService().dioForTesting);
  });

  tearDown(() => dioAdapter.close());

  // ── Responsible gaming ────────────────────────────────────────────────────

  group('updateResponsibleGaming', () {
    test('sends explicit null for all fields when no args given (regression: limits would not clear)', () async {
      // Before the fix, null params were silently dropped, making it impossible to clear a limit.
      // Now all three fields are always sent, allowing the server to set them to null.
      // The adapter only intercepts if the request body matches exactly — verifying the body.
      dioAdapter.onPatch(
        '/settings/responsible-gaming',
        (server) => server.reply(200, {}),
        data: {
          'dailyLimitAmount': null,
          'weeklyLimitAmount': null,
          'monthlyLimitAmount': null,
        },
      );
      await ApiService().updateResponsibleGaming();
    });

    test('sends provided values alongside null for unset fields', () async {
      dioAdapter.onPatch(
        '/settings/responsible-gaming',
        (server) => server.reply(200, {}),
        data: {
          'dailyLimitAmount': 50.0,
          'weeklyLimitAmount': null,
          'monthlyLimitAmount': 200.0,
        },
      );
      await ApiService().updateResponsibleGaming(dailyLimit: 50.0, monthlyLimit: 200.0);
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  group('login', () {
    test('stores JWT token in secure storage on success', () async {
      dioAdapter.onPost(
        '/auth/login',
        (server) => server.reply(200, {
          'token': 'jwt_abc123',
          'user': {'id': 1, 'email': 'user@example.com'},
        }),
      );
      final result = await ApiService().login('user@example.com', 'pass1234');
      expect(result['token'], equals('jwt_abc123'));
      expect(await ApiService().hasToken(), isTrue);
    });

    test('returns full response including user data', () async {
      dioAdapter.onPost(
        '/auth/login',
        (server) => server.reply(200, {
          'token': 'tok',
          'user': {'id': 7, 'email': 'x@y.com', 'countryId': 3},
        }),
      );
      final result = await ApiService().login('x@y.com', 'secret');
      expect(result['user']['id'], equals(7));
      expect(result['user']['countryId'], equals(3));
    });

    test('throws on 401 invalid credentials', () async {
      dioAdapter.onPost(
        '/auth/login',
        (server) => server.reply(401, {'message': 'Invalid credentials'}),
      );
      expect(
        () => ApiService().login('bad@email.com', 'wrongpass'),
        throwsA(isA<DioException>()),
      );
    });
  });

  group('register', () {
    test('stores token and returns response', () async {
      dioAdapter.onPost(
        '/auth/register',
        (server) => server.reply(201, {
          'token': 'new_token',
          'user': {'id': 99, 'email': 'new@example.com'},
        }),
      );
      final result = await ApiService().register(
        email: 'new@example.com',
        password: 'password123',
        countryId: 1,
      );
      expect(result['token'], equals('new_token'));
      expect(await ApiService().hasToken(), isTrue);
    });
  });

  group('logout', () {
    test('removes token from secure storage', () async {
      FlutterSecureStorage.setMockInitialValues({'viona_token': 'some_token'});
      await ApiService().logout();
      expect(await ApiService().hasToken(), isFalse);
    });
  });

  group('hasToken', () {
    test('returns true when token is present', () async {
      FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
      expect(await ApiService().hasToken(), isTrue);
    });

    test('returns false when no token', () async {
      FlutterSecureStorage.setMockInitialValues({});
      expect(await ApiService().hasToken(), isFalse);
    });
  });

  // ── Partners ──────────────────────────────────────────────────────────────

  group('getPartners', () {
    test('returns list of partners', () async {
      dioAdapter.onGet('/partners', (server) => server.reply(200, [
        {'id': 1, 'name': 'Rozetka', 'category': 'retail', 'cashbackPercent': '5'},
        {'id': 2, 'name': 'McDonald\'s', 'category': 'food', 'cashbackPercent': '3'},
      ]));
      final partners = await ApiService().getPartners();
      expect(partners, hasLength(2));
      expect(partners[0]['name'], equals('Rozetka'));
      expect(partners[1]['category'], equals('food'));
    });

    test('returns empty list when no partners', () async {
      dioAdapter.onGet('/partners', (server) => server.reply(200, []));
      final partners = await ApiService().getPartners();
      expect(partners, isEmpty);
    });
  });

  // ── Draws ─────────────────────────────────────────────────────────────────

  group('getTodayDraw', () {
    test('returns null when server responds 404', () async {
      dioAdapter.onGet(
        '/draws/today/1',
        (server) => server.reply(404, {'message': 'No draw scheduled today'}),
      );
      final draw = await ApiService().getTodayDraw(1);
      expect(draw, isNull);
    });

    test('returns draw map when draw exists', () async {
      dioAdapter.onGet('/draws/today/2', (server) => server.reply(200, {
        'id': 42, 'status': 'open', 'totalPool': '500.00', 'totalEntries': 100,
      }));
      final draw = await ApiService().getTodayDraw(2);
      expect(draw, isNotNull);
      expect(draw!['id'], equals(42));
      expect(draw['status'], equals('open'));
    });

    test('rethrows non-404 errors', () async {
      dioAdapter.onGet(
        '/draws/today/1',
        (server) => server.reply(500, {'message': 'Internal error'}),
      );
      expect(
        () => ApiService().getTodayDraw(1),
        throwsA(isA<DioException>()),
      );
    });
  });

  // ── Wallet ────────────────────────────────────────────────────────────────

  group('getWallet', () {
    test('returns wallet data', () async {
      dioAdapter.onGet('/wallet', (server) => server.reply(200, {
        'balance': '1250.00', 'currency': 'UAH',
      }));
      final wallet = await ApiService().getWallet();
      expect(wallet!['balance'], equals('1250.00'));
      expect(wallet['currency'], equals('UAH'));
    });
  });

  group('deposit', () {
    test('sends amount and currency to server', () async {
      dioAdapter.onPost(
        '/wallet/deposit',
        (server) => server.reply(200, {'newBalance': 1350.0}),
        data: {'amount': 100.0, 'currency': 'UAH'},
      );
      final result = await ApiService().deposit(100.0, 'UAH');
      expect(result['newBalance'], equals(1350.0));
    });
  });

  // ── Countries ─────────────────────────────────────────────────────────────

  group('getCountries', () {
    test('returns country list', () async {
      dioAdapter.onGet('/countries', (server) => server.reply(200, [
        {'id': 1, 'name': 'Ukraine', 'currencySymbol': '₴'},
        {'id': 2, 'name': 'USA', 'currencySymbol': '\$'},
      ]));
      final countries = await ApiService().getCountries();
      expect(countries, hasLength(2));
      expect(countries[0]['name'], equals('Ukraine'));
    });
  });

  group('getCountry', () {
    test('returns single country by id', () async {
      dioAdapter.onGet('/countries/1', (server) => server.reply(200, {
        'id': 1, 'name': 'Ukraine', 'currencySymbol': '₴', 'drawHourUtc': 21,
      }));
      final country = await ApiService().getCountry(1);
      expect(country['drawHourUtc'], equals(21));
    });
  });
}
