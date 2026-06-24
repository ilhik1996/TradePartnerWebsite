# VIONA — Daily Lottery Platform

A full-stack daily lottery platform with a React/TypeScript web client, an Express/TypeScript backend, and a Flutter mobile app.

## Architecture

```
TradePartnerWebsite/
├── server/          Express + TypeScript API (port 5000)
│   ├── modules/     Feature modules (lottery, wallet, subscriptions, …)
│   ├── tests/       17 server test files (344 tests, vitest + supertest)
│   ├── auth.ts      JWT sign/verify + requireAuth middleware
│   ├── db.ts        Drizzle ORM + PostgreSQL connection
│   └── routes.ts    All API routes registered here
├── client/          React + TypeScript SPA (Vite)
│   └── src/
│       ├── pages/   13 pages (dashboard, wallet, cabinet, admin, …)
│       ├── hooks/   use-realtime.ts (WebSocket), use-auth.tsx, …
│       └── lib/     api.ts, queryClient.ts, translations.ts
├── shared/
│   └── schema.ts    Drizzle schema + Zod insert-schemas (shared by server & client)
├── flutter_app/     Flutter mobile app
│   ├── lib/
│   │   ├── screens/ 10 screens
│   │   ├── widgets/ CountdownTimer, VionaCard, VionaPrizeCard
│   │   └── services/api_service.dart, websocket_service.dart
│   └── test/        13 test files (165 tests, flutter_test + http_mock_adapter)
├── Dockerfile       Multi-stage build (builder → runner, non-root user)
├── docker-compose.yml
└── .github/workflows/ci.yml  Server + Flutter tests, production build
```

## Running the project

```bash
# Install server + client dependencies
npm ci

# Start dev server (Express + Vite HMR on port 5000)
npm run dev

# Type-check (tsc --noEmit)
npm run check

# Production build → dist/
npm run build
```

## Running tests

```bash
# Server tests (344 cases — no DB required, all modules mocked)
npm test
npm run test:watch     # watch mode

# Flutter tests (165 cases)
cd flutter_app
flutter pub get
flutter analyze --no-fatal-infos
flutter test
flutter test --reporter compact   # compact output
```

## Database

PostgreSQL via Drizzle ORM. Schema lives in `shared/schema.ts` and is used by both the server and type-generated client helpers.

```bash
# Push schema changes to DB (set DATABASE_URL first)
npm run db:push
```

Key tables: `countries`, `users`, `user_profiles`, `responsible_gaming`, `draws`, `draw_entries`, `wallets`, `transactions`, `subscriptions`, `referral_codes`, `notifications`, `partners`, `gamification_levels`.

## API conventions

- All routes are under `/api/`
- Auth: JWT in `Authorization: Bearer <token>` header
- Errors: `{ message: string }` with appropriate HTTP status
- `requireAuth` middleware (server/auth.ts) validates the token and attaches `req.userId`
- Route handlers are wrapped in `ar()` (async-error wrapper) which converts thrown errors to 500 responses
- Zod validation is used on all request bodies; invalid payloads return 400

## Flutter mobile app

- Singleton services: `ApiService()` (Dio HTTP client) and `WebSocketService()` (real-time draw updates)
- Auth token stored in `FlutterSecureStorage` under key `viona_token`
- Navigation: GoRouter
- State management: flutter_riverpod (DashboardScreen only)

### Flutter testing pattern

```dart
setUp(() {
  FlutterSecureStorage.setMockInitialValues({'viona_token': 'tok'});
  adapter = DioAdapter(dio: ApiService().dioForTesting);  // @visibleForTesting getter
});
tearDown(() => adapter.close());
```

`DioAdapter` (http_mock_adapter) intercepts Dio requests — no real network calls. `dioForTesting` is exposed via `@visibleForTesting` annotation on `ApiService`.

## Key patterns & known gotchas

### Mounted guard (Flutter)

All `async` callbacks that touch `TextEditingController` or call `setState` after `await` must check `if (!mounted) return` before doing so. Four screens had use-after-dispose bugs that were fixed:

- `profile_screen.dart` — `_firstNameCtrl.text` / `_lastNameCtrl.text` set after `Future.wait([...])`
- `referrals_screen.dart` — `_codeCtrl.clear()` after `_api.applyReferralCode()`
- `wallet_screen.dart` — `_amountCtrl.clear()` after deposit, `_withdrawCtrl.clear()` after withdrawal

Each fix has a regression test using the "replace widget tree mid-flight" pattern — pump a slow response, swap the widget tree, let the callback fire, verify no `FlutterError: controller used after dispose`.

### Responsible gaming limits (Flutter → server)

`ApiService.updateResponsibleGaming()` always sends all three limit fields (`dailyLimitAmount`, `weeklyLimitAmount`, `monthlyLimitAmount`). Omitting a field leaves the old limit in place; sending `null` explicitly clears it. The server Zod schema marks each field as `.nullable()` for this reason. The regression test (`api_service_test.dart`) verifies all three keys are present in the PATCH body even when no arguments are passed.

### Stale closure guard (React WebSocket)

`use-realtime.ts` stores the `onMessage` callback in a `useRef` (`handlerRef.current = onMessage`) on every render so the WebSocket handler always calls the latest closure. Without this, the handler would capture a stale `loadData` reference from the first render.

### Admin fetch monkey-patch (React)

`admin.tsx` patches `window.fetch` at module level to inject the admin token header for `/api/admin` URLs only. The patch is scoped to prefix-matching so it doesn't affect other fetch calls.

## CI

`.github/workflows/ci.yml` has three jobs:

| Job | Trigger | Steps |
|-----|---------|-------|
| `test` | push/PR | `npm ci` → `tsc` → `npm test` (344 server tests) |
| `flutter-test` | push/PR | Flutter setup → `pub get` → `analyze` → `flutter test` (165 tests) |
| `build` | after both pass | `npm run build` → verify `dist/index.js` + `dist/public/` exist |

Both `test` and `flutter-test` must pass before `build` runs (`needs: [test, flutter-test]`).
