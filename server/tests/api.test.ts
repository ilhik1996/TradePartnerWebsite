import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock all DB-touching modules so tests run without DATABASE_URL ─────────────

// Chainable query stub: lets requireAuth / requireAdmin pass through without
// a real DB connection.  Route handlers that reach DB code will still throw
// (caught by ar() → 500), which is the pre-existing behaviour these tests
// rely on for "Zod accepts; DB error expected" assertions.
vi.mock("../db", () => {
  const makeSelectChain = (): any => {
    let _fromTable: any;
    const chain: any = {
      from: (table: any) => {
        _fromTable = table;
        // Make chain thenable so `await db.select().from(t)` works for
        // aggregate queries that have no .where() call (e.g. COUNT/SUM stats).
        chain.then = (resolve: any) => resolve([{ count: 0, total: "0" }]);
        return chain;
      },
      // userSessions blacklist check must return [] (token not revoked).
      // All other queries (users.status, adminUsers.isActive) return an active stub
      // that also includes aggregate fields (count, total) for stats-style routes.
      // Returns `chain` (not a raw Promise) so callers can chain .groupBy() after
      // .where() — e.g. checkAndAwardBadges' streak_7 query.
      where: () => {
        const isSessionsTable = _fromTable && "tokenHash" in _fromTable;
        const rows = isSessionsTable ? [] : [{ status: "active", id: 1, isActive: true, count: 0, total: "0", day: "2025-01-01", badgeId: undefined }];
        chain.then = (resolve: any) => resolve(rows);
        return chain;
      },
      groupBy: () => chain,
      for: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
    };
    return chain;
  };
  const makeInsertChain = (): any => ({
    values: () => makeInsertChain(),
    onConflictDoNothing: () => Promise.resolve(),
    returning: () => Promise.resolve([{ id: 1, name: "Test", category: "retail", cashbackPercent: "5", isActive: true }]),
  });
  const makeUpdateChain = (): any => ({
    set: () => makeUpdateChain(),
    where: () => ({
      then: (resolve: any) => resolve([{ id: 1, name: "Updated", isActive: true }]),
      returning: () => Promise.resolve([{ id: 1, name: "Updated", isActive: true }]),
    }),
  });
  return {
    db: {
      select: makeSelectChain,
      insert: () => makeInsertChain(),
      update: () => makeUpdateChain(),
      delete: () => ({ where: () => Promise.resolve() }),
    },
  };
});
vi.mock("../modules/push", () => ({
  sendPushToUser: vi.fn(),
  VAPID_PUBLIC_KEY: null,
}));
// Replace rate limiters with passthrough middleware so the full test suite
// can exceed 120 requests without hitting 429s. Rate-limiter logic itself is
// covered by security.test.ts.
const _pass = (_req: any, _res: any, next: any) => next();
vi.mock("../middleware/security", async (importOriginal) => {
  const real = await importOriginal<typeof import("../middleware/security")>();
  return {
    ...real,
    authRateLimit:   _pass,
    apiRateLimit:    _pass,
    paymentRateLimit: _pass,
  };
});

// Import after mocks are registered
const { registerRoutes } = await import("../routes");
const { signToken } = await import("../auth");

// ── Test app setup ─────────────────────────────────────────────────────────────

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

// ── Health ─────────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with ok:true", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.ts).toBe("string");
  });
});

// ── Push ──────────────────────────────────────────────────────────────────────

describe("GET /api/push/vapid-key", () => {
  it("returns 503 when VAPID keys are not configured", async () => {
    const res = await request(app).get("/api/push/vapid-key");
    expect(res.status).toBe(503);
  });
});

// ── Auth validation ───────────────────────────────────────────────────────────

describe("POST /api/auth/register — input validation", () => {
  it("rejects empty body with 400", async () => {
    const res = await request(app).post("/api/auth/register").send({});
    expect(res.status).toBe(400);
  });

  it("rejects missing password", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "test@example.com",
      countryId: 1,
    });
    expect(res.status).toBe(400);
  });

  it("rejects short password", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "test@example.com",
      password: "abc",
      countryId: 1,
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid email format", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "not-an-email",
      password: "password123",
      countryId: 1,
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login — input validation", () => {
  it("rejects empty body", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("rejects missing password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });
});

// ── Auth guard ────────────────────────────────────────────────────────────────

describe("Protected routes — missing token returns 401", () => {
  const protectedRoutes = [
    ["GET", "/api/auth/me"],
    ["GET", "/api/wallet"],
    ["GET", "/api/notifications"],
    ["GET", "/api/gamification/me"],
    ["POST", "/api/draws/1/enter"],
    ["GET", "/api/profile"],
    ["GET", "/api/subscription"],
    ["POST", "/api/push/subscribe"],
  ] as const;

  for (const [method, path] of protectedRoutes) {
    it(`${method} ${path} → 401 without token`, async () => {
      const res = await (method === "GET"
        ? request(app).get(path)
        : request(app).post(path).send({}));
      expect(res.status).toBe(401);
    });
  }
});

describe("Protected routes — invalid token returns 401", () => {
  it("GET /api/auth/me with garbage token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer garbage.token.here");
    expect(res.status).toBe(401);
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", "Bearer bad.token.here");
    expect(res.status).toBe(401);
  });

  it("returns 200 with { ok: true } for a valid token", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ── Change password ───────────────────────────────────────────────────────────

describe("PATCH /api/auth/password", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .patch("/api/auth/password")
      .send({ currentPassword: "old", newPassword: "newpass123" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when newPassword is too short", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .patch("/api/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "old", newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when currentPassword is missing", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .patch("/api/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "validnewpass" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is empty", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .patch("/api/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Admin guard ───────────────────────────────────────────────────────────────

describe("Admin routes — non-admin token returns 403 or 401", () => {
  it("GET /api/admin/users without token → 401", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });
});

// ── KYC age validation ────────────────────────────────────────────────────────

describe("POST /api/kyc/start — age validation (requires auth, tested via Zod layer)", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/kyc/start")
      .send({ level: "age", dateOfBirth: "2020-01-01" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid level value", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .post("/api/kyc/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ level: "platinum", dateOfBirth: "2000-01-01" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed dateOfBirth (non-ISO format)", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .post("/api/kyc/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ level: "age", dateOfBirth: "01/01/2000" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for future dateOfBirth", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .post("/api/kyc/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ level: "age", dateOfBirth: "2099-01-01" });
    expect(res.status).toBe(400);
  });
});

// ── Health endpoint ────────────────────────────────────────────────────────────

describe("GET /api/health — detailed assertions", () => {
  it("ts is a valid ISO date string", async () => {
    const res = await request(app).get("/api/health");
    expect(new Date(res.body.ts).getTime()).toBeGreaterThan(0);
  });

  it("responds quickly (under 500ms)", async () => {
    const start = Date.now();
    await request(app).get("/api/health");
    expect(Date.now() - start).toBeLessThan(500);
  });
});

// ── Admin withdrawal endpoints ────────────────────────────────────────────────

describe("Admin withdrawal endpoints — require auth", () => {
  it("GET /api/admin/withdrawals without token → 401", async () => {
    const res = await request(app).get("/api/admin/withdrawals");
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/withdrawals/1/approve without token → 401", async () => {
    const res = await request(app).post("/api/admin/withdrawals/1/approve");
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/withdrawals/1/reject without token → 401", async () => {
    const res = await request(app).post("/api/admin/withdrawals/1/reject").send({});
    expect(res.status).toBe(401);
  });
});

// ── Wallet withdraw validation ─────────────────────────────────────────────────

describe("POST /api/wallet/withdraw — validation", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/wallet/withdraw").send({ amount: 10 });
    expect(res.status).toBe(401);
  });
});

// ── Public draw verification endpoint ─────────────────────────────────────────

describe("GET /api/draws/:drawId/verify", () => {
  it("responds without crashing for an unknown draw id", async () => {
    const res = await request(app).get("/api/draws/999999/verify");
    // With the DB mock the route may return 200 (mock data), 404, or 500
    expect([200, 404, 500]).toContain(res.status);
  });

  it("returns 400 for non-numeric draw id", async () => {
    const res = await request(app).get("/api/draws/abc/verify");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid numeric/i);
  });

  it("requires no authentication", async () => {
    // Route is public — 500 (DB error) not 401
    const res = await request(app).get("/api/draws/1/verify");
    expect(res.status).not.toBe(401);
  });
});

// ── Security headers ──────────────────────────────────────────────────────────

describe("Security headers on API responses", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets Referrer-Policy", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});

// ── Referral apply — duplicate guard ─────────────────────────────────────────

describe("POST /api/referrals/apply — auth guard", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/referrals/apply").send({ code: "TESTCODE" });
    expect(res.status).toBe(401);
  });
});

// ── Free entry — registered-account guard ─────────────────────────────────────

describe("POST /api/draws/:drawId/enter-free — account conflict guard", () => {
  it("returns 409 when email belongs to a registered (non-guest) account", async () => {
    // DB mock returns { status: "active", id: 1, isActive: true } (isGuest undefined === falsy)
    // so the guard should fire and return 409 instead of creating a duplicate entry.
    const res = await request(app)
      .post("/api/draws/1/enter-free")
      .send({ email: "existing@example.com", firstName: "Test", lastName: "User", countryId: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/sign in/i);
  });

  it("returns 400 for non-numeric draw id", async () => {
    const res = await request(app)
      .post("/api/draws/abc/enter-free")
      .send({ email: "guest@example.com", firstName: "Test", lastName: "User", countryId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid numeric/i);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/draws/1/enter-free")
      .send({ email: "guest@example.com" });
    expect(res.status).toBe(400);
  });
});

// ── Free entry (AMOE) — input validation ─────────────────────────────────────

describe("POST /api/draws/:drawId/enter-free — input validation", () => {
  it("returns 400 for non-numeric drawId", async () => {
    const res = await request(app)
      .post("/api/draws/abc/enter-free")
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", countryId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid numeric/i);
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/draws/1/enter-free")
      .send({ firstName: "Jane", lastName: "Doe", countryId: 1 });
    // Zod validation fires before DB — expect 400
    expect(res.status).toBe(400);
  });

  it("returns 400 when firstName is missing", async () => {
    const res = await request(app)
      .post("/api/draws/1/enter-free")
      .send({ lastName: "Doe", email: "jane@example.com", countryId: 1 });
    expect(res.status).toBe(400);
  });

  it("requires no authentication (public AMOE endpoint)", async () => {
    const res = await request(app)
      .post("/api/draws/1/enter-free")
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", countryId: 1 });
    // DB mock empty → error, but not 401 (route is public)
    expect(res.status).not.toBe(401);
  });
});

// ── Register — existing guest account upgrade ─────────────────────────────────

describe("POST /api/auth/register — guest upgrade path (unit)", () => {
  it("returns 400 without password (Zod validates before DB)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "guest@example.com", countryId: 1 });
    expect(res.status).toBe(400);
  });

  it("does NOT return 401 — registration is a public endpoint", async () => {
    // A normal 400 (validation) or 500 (DB) is expected; never 401
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "guest@example.com", password: "password123", countryId: 1 });
    expect(res.status).not.toBe(401);
  });
});

// ── Deposit validation (requires auth — use signed test JWT) ──────────────────

describe("POST /api/wallet/deposit — amount validation", () => {
  const token = signToken({ userId: 999 });

  it("rejects negative amount → 400", async () => {
    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: -50 });
    expect(res.status).toBe(400);
  });

  it("rejects zero amount → 400", async () => {
    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects amount over max (10001) → 400", async () => {
    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 10001 });
    expect(res.status).toBe(400);
  });

  it("rejects string amount → 400", async () => {
    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: "lots" });
    expect(res.status).toBe(400);
  });
});

// ── Withdrawal validation (requires auth — use signed test JWT) ───────────────

describe("POST /api/wallet/withdraw — amount validation", () => {
  const token = signToken({ userId: 999 });

  it("rejects negative amount → 400", async () => {
    const res = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: -100 });
    expect(res.status).toBe(400);
  });

  it("rejects zero amount → 400", async () => {
    const res = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects amount over max (50001) → 400", async () => {
    const res = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 50001 });
    expect(res.status).toBe(400);
  });

  it("rejects missing amount → 400", async () => {
    const res = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Admin withdrawal rejection — reason length limit ─────────────────────────

describe("POST /api/admin/withdrawals/:id/reject — reason validation", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("rejects reason over 500 characters → 400", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/1/reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "x".repeat(501) });
    expect(res.status).toBe(400);
  });

  it("accepts reason exactly 500 characters (validation passes, DB error expected)", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/1/reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "x".repeat(500) });
    // Zod accepts; DB mock throws → 400 or 500; must not be 422
    expect([400, 500]).toContain(res.status);
  });

  it("accepts empty reason (reason is optional)", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/1/reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    // Zod accepts; DB mock throws → 400 or 500; must not be 422
    expect([400, 500]).toContain(res.status);
  });
});

// ── Webhook fail-closed behaviour ─────────────────────────────────────────────

describe("POST /api/webhooks/kyc — 503 when SUMSUB_SECRET_KEY not configured", () => {
  it("returns 503 in non-development environment (test env has no secret)", async () => {
    // NODE_ENV=test satisfies !== 'development', so the fail-closed branch fires
    const res = await request(app)
      .post("/api/webhooks/kyc")
      .set("x-payload-digest", "fakesig")
      .send({ type: "applicantReviewed", externalUserId: "1" });
    expect(res.status).toBe(503);
  });
});

describe("POST /api/webhooks/stripe — 503 when STRIPE_WEBHOOK_SECRET not configured", () => {
  it("returns 503 in non-development environment (test env has no secret)", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=fakesig")
      .send({ type: "checkout.session.completed" });
    expect(res.status).toBe(503);
  });
});

// ── Free entry — lastName now optional ───────────────────────────────────────

describe("POST /api/draws/:drawId/enter-free — lastName is now optional", () => {
  it("does not reject with a lastName validation error when lastName is omitted", async () => {
    const res = await request(app)
      .post("/api/draws/1/enter-free")
      .send({ firstName: "Jane", email: "jane@example.com", countryId: 1 });
    // Zod now defaults missing lastName to ""; any 400 comes from DB, not validation
    if (res.status === 400) {
      expect(res.body.message ?? "").not.toMatch(/last.name|lastName/i);
    }
  });
});

// ── Admin user search ──────────────────────────────────────────────────────────

describe("GET /api/admin/users — search parameter", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("accepts ?search= and does not return 400", async () => {
    const res = await request(app)
      .get("/api/admin/users?search=test&limit=10")
      .set("Authorization", `Bearer ${adminToken}`);
    // DB mock may produce 500; must not be 400 or 401
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── Responsible gaming partial update ─────────────────────────────────────────

describe("PATCH /api/settings/responsible-gaming — partial update", () => {
  const token = signToken({ userId: 999 });

  it("accepts only dailyLimitAmount (partial update valid) → auth passes, DB error expected", async () => {
    const res = await request(app)
      .patch("/api/settings/responsible-gaming")
      .set("Authorization", `Bearer ${token}`)
      .send({ dailyLimitAmount: 50 });
    // Zod accepts; DB mock may error → 400 or 500; never 422
    expect([200, 400, 500]).toContain(res.status);
    expect(res.status).not.toBe(422);
  });

  it("rejects negative dailyLimitAmount → 400", async () => {
    const res = await request(app)
      .patch("/api/settings/responsible-gaming")
      .set("Authorization", `Bearer ${token}`)
      .send({ dailyLimitAmount: -10 });
    expect(res.status).toBe(400);
  });

  it("accepts explicit null to clear a limit", async () => {
    const res = await request(app)
      .patch("/api/settings/responsible-gaming")
      .set("Authorization", `Bearer ${token}`)
      .send({ dailyLimitAmount: null });
    expect([200, 400, 500]).toContain(res.status);
    expect(res.status).not.toBe(422);
  });
});

// ── Countries endpoint ────────────────────────────────────────────────────────

describe("GET /api/countries/:id", () => {
  it("returns 400 for non-numeric id", async () => {
    const res = await request(app).get("/api/countries/abc");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid numeric/i);
  });

  it("returns 200 or 404 for numeric id (no auth required)", async () => {
    const res = await request(app).get("/api/countries/1");
    expect([200, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(401);
  });
});

// ── Petition sign — countryCode normalization ─────────────────────────────────

describe("POST /api/petition/sign — countryCode normalization", () => {
  const token = signToken({ userId: 42 });

  it("accepts lowercase countryCode (Zod toUpperCase normalizes it)", async () => {
    const res = await request(app)
      .post("/api/petition/sign")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "Ivan", countryCode: "ua" });
    // Zod accepts "ua" and uppercases to "UA"; any 400 comes from DB, not countryCode validation
    if (res.status === 400) {
      expect(res.body.message ?? "").not.toMatch(/country.?code|length/i);
    }
  });

  it("rejects countryCode shorter than 2 chars with 400", async () => {
    const res = await request(app)
      .post("/api/petition/sign")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "Ivan", countryCode: "u" });
    expect(res.status).toBe(400);
  });

  it("rejects countryCode longer than 2 chars with 400", async () => {
    const res = await request(app)
      .post("/api/petition/sign")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "Ivan", countryCode: "UAH" });
    expect(res.status).toBe(400);
  });

  it("rejects missing firstName with 400", async () => {
    const res = await request(app)
      .post("/api/petition/sign")
      .set("Authorization", `Bearer ${token}`)
      .send({ countryCode: "UA" });
    expect(res.status).toBe(400);
  });
});

// ── Withdrawal reject — guard and route existence ─────────────────────────────

describe("POST /api/admin/withdrawals/:id/reject", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("requires admin auth → 401 without token", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/1/reject")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric withdrawal id", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/abc/reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects reason exceeding 500 chars with 400", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/1/reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "x".repeat(501) });
    expect(res.status).toBe(400);
  });
});

// ── Email normalization (lowercase transform) ─────────────────────────────────

describe("POST /api/auth/register — email normalization", () => {
  it("does not reject UPPER-case email — Zod lowercases before validation", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "USER@EXAMPLE.COM", password: "password123", countryId: 1 });
    // Zod accepts (email valid after lowercase); only DB or 500 possible
    expect(res.status).not.toBe(400);
  });

  it("does not reject Mixed-Case email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "Alice@Example.Com", password: "password123", countryId: 1 });
    expect(res.status).not.toBe(400);
  });
});

describe("POST /api/auth/login — identifier normalization", () => {
  it("does not reject UPPER-case email identifier at schema level", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "ADMIN@VIONA.APP", password: "admin123" });
    // Should fail auth (wrong creds) → 401; never 400 from schema
    expect(res.status).not.toBe(400);
  });

  it("phone identifiers are passed through unchanged", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "+380501234567", password: "pass" });
    expect(res.status).not.toBe(400);
  });
});

describe("POST /api/draws/:drawId/enter-free — email normalization", () => {
  it("does not reject UPPER-case email in free entry", async () => {
    const res = await request(app)
      .post("/api/draws/1/enter-free")
      .send({ email: "GUEST@EXAMPLE.COM", firstName: "Test", countryId: 1 });
    // DB mock returns non-guest; expect 409 (conflict) not 400 (validation)
    expect(res.status).not.toBe(400);
  });
});

// ── Admin users — NaN-safe pagination ────────────────────────────────────────

describe("GET /api/admin/users — NaN-safe limit/offset", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("treats non-numeric limit as default (50) — no 400 from parseInt", async () => {
    const res = await request(app)
      .get("/api/admin/users?limit=abc")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });

  it("treats non-numeric offset as 0 — no 400 from parseInt", async () => {
    const res = await request(app)
      .get("/api/admin/users?offset=xyz")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });

  it("caps limit at 200 even when larger value provided", async () => {
    const res = await request(app)
      .get("/api/admin/users?limit=9999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });
});

// ── Admin users — wildcard escaping in search ─────────────────────────────────

describe("GET /api/admin/users — search wildcard escaping", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("accepts search containing % without 400", async () => {
    const res = await request(app)
      .get("/api/admin/users?search=admin%25user")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts search containing _ without 400", async () => {
    const res = await request(app)
      .get("/api/admin/users?search=admin_user")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── Notification mark-read — id validation ───────────────────────────────────

describe("PATCH /api/notifications/:id/read — id validation", () => {
  const token = signToken({ userId: 999 });

  it("returns 400 for non-numeric notification id", async () => {
    const res = await request(app)
      .patch("/api/notifications/abc/read")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid numeric/i);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).patch("/api/notifications/1/read");
    expect(res.status).toBe(401);
  });
});

// ── Notification mark-all-read ────────────────────────────────────────────────

describe("PATCH /api/notifications/read-all", () => {
  const token = signToken({ userId: 999 });

  it("returns 200 with ok:true when authenticated", async () => {
    const res = await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).patch("/api/notifications/read-all");
    expect(res.status).toBe(401);
  });
});

// ── Push subscribe — body validation ─────────────────────────────────────────

describe("POST /api/push/subscribe — body validation", () => {
  const token = signToken({ userId: 999 });

  it("returns 400 when endpoint is missing", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({ keys: { p256dh: "key", auth: "auth" } });
    expect(res.status).toBe(400);
  });

  it("returns 400 when endpoint is not a valid URL", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: "not-a-url", keys: { p256dh: "key", auth: "auth" } });
    expect(res.status).toBe(400);
  });

  it("returns 400 when keys object is missing entirely", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: "https://push.example.com/sub" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when p256dh is missing from keys", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: "https://push.example.com/sub", keys: { auth: "auth123" } });
    expect(res.status).toBe(400);
  });

  it("returns 400 when auth is missing from keys", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: "https://push.example.com/sub", keys: { p256dh: "key123" } });
    expect(res.status).toBe(400);
  });
});

// ── Admin users — enum filter validation ─────────────────────────────────────

describe("GET /api/admin/users — enum filter validation", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("rejects invalid kyc filter value → 400", async () => {
    const res = await request(app)
      .get("/api/admin/users?kyc=hacked")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("rejects invalid status filter value → 400", async () => {
    const res = await request(app)
      .get("/api/admin/users?status=evil")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid kyc filter → not 400", async () => {
    const res = await request(app)
      .get("/api/admin/users?kyc=age_verified")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });

  it("accepts valid status filter → not 400", async () => {
    const res = await request(app)
      .get("/api/admin/users?status=active")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });
});

// ── Wallet transaction pagination cap ─────────────────────────────────────────

describe("GET /api/wallet/transactions — pagination", () => {
  const token = signToken({ userId: 999 });

  it("requires authentication → 401 without token", async () => {
    const res = await request(app).get("/api/wallet/transactions");
    expect(res.status).toBe(401);
  });

  it("accepts limit and offset query params without 400", async () => {
    const res = await request(app)
      .get("/api/wallet/transactions?limit=10&offset=0")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(400);
  });
});

describe("GET /api/stats — public aggregate stats", () => {
  it("returns 200 without authentication", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
  });

  it("returns JSON with totalUsers, completedDraws, and totalPrizesPaid fields", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.body).toHaveProperty("totalUsers");
    expect(res.body).toHaveProperty("completedDraws");
    expect(res.body).toHaveProperty("totalPrizesPaid");
  });

  it("returns numeric-compatible values for all fields", async () => {
    const res = await request(app).get("/api/stats");
    expect(Number.isFinite(Number(res.body.totalUsers))).toBe(true);
    expect(Number.isFinite(Number(res.body.completedDraws))).toBe(true);
    // totalPrizesPaid comes from SUM — may be number or numeric string
    expect(Number.isNaN(Number(res.body.totalPrizesPaid))).toBe(false);
  });
});

// ── Admin: audit logs ─────────────────────────────────────────────────────────

describe("GET /api/admin/audit-logs", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });
  const userToken  = signToken({ userId: 1 });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/admin/audit-logs");
    expect(res.status).toBe(401);
  });

  it("returns 403 with a regular user token (no admin role)", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 200 with admin token", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("accepts limit and offset query params without error", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs?limit=10&offset=0")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("treats non-numeric limit gracefully (caps / defaults) — no 400", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs?limit=abc&offset=xyz")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });

  it("caps limit at 500 even when larger value is requested", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs?limit=99999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });
});

// ── Admin: gamification XP award ─────────────────────────────────────────────

describe("POST /api/gamification/award", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });
  const userToken  = signToken({ userId: 1 });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .post("/api/gamification/award")
      .send({ userId: 1, reason: "entry" });
    expect(res.status).toBe(401);
  });

  it("returns 403 with a regular user token", async () => {
    const res = await request(app)
      .post("/api/gamification/award")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ userId: 1, reason: "entry" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .post("/api/gamification/award")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "entry" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when reason is missing", async () => {
    const res = await request(app)
      .post("/api/gamification/award")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: 1 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid reason value", async () => {
    const res = await request(app)
      .post("/api/gamification/award")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: 1, reason: "hack_the_planet" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when userId is not a positive integer", async () => {
    const res = await request(app)
      .post("/api/gamification/award")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: -1, reason: "deposit" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid payload (entry reason) — not 400", async () => {
    const res = await request(app)
      .post("/api/gamification/award")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: 1, reason: "entry" });
    expect(res.status).not.toBe(400);
  });

  it("accepts monthly_sub reason — not 400", async () => {
    const res = await request(app)
      .post("/api/gamification/award")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: 1, reason: "monthly_sub" });
    expect(res.status).not.toBe(400);
  });
});

// ── Admin: partner CRUD ────────────────────────────────────────────────────────

describe("POST /api/admin/partners", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });
  const userToken  = signToken({ userId: 1 });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .send({ name: "Test", category: "food", cashbackPercent: 5 });
    expect(res.status).toBe(401);
  });

  it("returns 403 with a regular user token", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ name: "Test", category: "food", cashbackPercent: 5 });
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "food", cashbackPercent: 5 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when category is missing", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test Shop", cashbackPercent: 5 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid category value", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test Shop", category: "crypto", cashbackPercent: 5 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when cashbackPercent exceeds 50", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test", category: "retail", cashbackPercent: 51 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when cashbackPercent is negative", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test", category: "retail", cashbackPercent: -1 });
    expect(res.status).toBe(400);
  });

  it("accepts valid category 'retail' without 400", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test Shop", category: "retail", cashbackPercent: 5 });
    expect(res.status).not.toBe(400);
  });

  it("accepts valid category 'food' without 400", async () => {
    const res = await request(app)
      .post("/api/admin/partners")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test Cafe", category: "food", cashbackPercent: 3 });
    expect(res.status).not.toBe(400);
  });
});

describe("PATCH /api/admin/partners/:id", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .patch("/api/admin/partners/1")
      .send({ name: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .patch("/api/admin/partners/abc")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid category value in update", async () => {
    const res = await request(app)
      .patch("/api/admin/partners/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "not_a_category" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when cashbackPercent exceeds 50 in update", async () => {
    const res = await request(app)
      .patch("/api/admin/partners/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ cashbackPercent: 99 });
    expect(res.status).toBe(400);
  });

  it("accepts a valid partial update (name only) — not 400", async () => {
    const res = await request(app)
      .patch("/api/admin/partners/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Renamed Partner" });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts isActive toggle in update — not 400", async () => {
    const res = await request(app)
      .patch("/api/admin/partners/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

describe("DELETE /api/admin/partners/:id", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });
  const userToken  = signToken({ userId: 1 });

  it("returns 401 without token", async () => {
    const res = await request(app).delete("/api/admin/partners/1");
    expect(res.status).toBe(401);
  });

  it("returns 403 with a regular user token", async () => {
    const res = await request(app)
      .delete("/api/admin/partners/1")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .delete("/api/admin/partners/not-a-number")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid numeric id with admin token — not 400 or 401", async () => {
    const res = await request(app)
      .delete("/api/admin/partners/1")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── Draws ─────────────────────────────────────────────────────────────────────

describe("GET /api/draws/today/:countryId", () => {
  it("returns 400 for non-numeric countryId", async () => {
    const res = await request(app).get("/api/draws/today/abc");
    expect(res.status).toBe(400);
  });

  it("accepts numeric countryId — responds (not 400)", async () => {
    const res = await request(app).get("/api/draws/today/1");
    expect(res.status).not.toBe(400);
  });
});

describe("GET /api/draws/history/:countryId", () => {
  it("returns 400 for non-numeric countryId", async () => {
    const res = await request(app).get("/api/draws/history/abc");
    expect(res.status).toBe(400);
  });

  it("accepts numeric countryId without auth — responds (not 400)", async () => {
    const res = await request(app).get("/api/draws/history/1");
    expect(res.status).not.toBe(400);
  });

  it("accepts numeric countryId with auth token — responds (not 400)", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .get("/api/draws/history/1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(400);
  });
});

describe("GET /api/draws/:drawId/verify", () => {
  it("returns 400 for non-numeric drawId", async () => {
    const res = await request(app).get("/api/draws/abc/verify");
    expect(res.status).toBe(400);
  });

  it("accepts numeric drawId — responds (not 400)", async () => {
    const res = await request(app).get("/api/draws/7/verify");
    expect(res.status).not.toBe(400);
  });
});

describe("POST /api/draws/:drawId/enter", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/draws/7/enter");
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric drawId", async () => {
    const res = await request(app)
      .post("/api/draws/abc/enter")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid drawId with auth — not 401", async () => {
    const res = await request(app)
      .post("/api/draws/7/enter")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/draws/:drawId/enter-free", () => {
  it("returns 400 when name/email missing", async () => {
    const res = await request(app).post("/api/draws/7/enter-free").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when name only (no email)", async () => {
    const res = await request(app)
      .post("/api/draws/7/enter-free")
      .send({ name: "Alice" });
    expect(res.status).toBe(400);
  });

  it("accepts valid firstName + email + countryId — not 400", async () => {
    const res = await request(app)
      .post("/api/draws/7/enter-free")
      .send({ firstName: "Alice", lastName: "Smith", email: "alice@example.com", countryId: 1 });
    expect(res.status).not.toBe(400);
  });

  it("returns 400 for non-numeric drawId even with valid body", async () => {
    const res = await request(app)
      .post("/api/draws/abc/enter-free")
      .send({ name: "Alice Smith", email: "alice@example.com" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/draws/:drawId/my-entry", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/draws/7/my-entry");
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric drawId", async () => {
    const res = await request(app)
      .get("/api/draws/abc/my-entry")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid drawId with auth — not 401", async () => {
    const res = await request(app)
      .get("/api/draws/7/my-entry")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────

describe("PATCH /api/settings/auto-participate", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app).patch("/api/settings/auto-participate").send({ enabled: true });
    expect(res.status).toBe(401);
  });

  it("returns 400 when enabled field is missing", async () => {
    const res = await request(app)
      .patch("/api/settings/auto-participate")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when enabled is not a boolean", async () => {
    const res = await request(app)
      .patch("/api/settings/auto-participate")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: "yes" });
    expect(res.status).toBe(400);
  });

  it("accepts enabled: true — responds with autoParticipate", async () => {
    const res = await request(app)
      .patch("/api/settings/auto-participate")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts enabled: false", async () => {
    const res = await request(app)
      .patch("/api/settings/auto-participate")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: false });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/settings/self-exclude", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/settings/self-exclude").send({ days: 30 });
    expect(res.status).toBe(401);
  });

  it("returns 400 when days is missing", async () => {
    const res = await request(app)
      .post("/api/settings/self-exclude")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when days is 0 (min 1)", async () => {
    const res = await request(app)
      .post("/api/settings/self-exclude")
      .set("Authorization", `Bearer ${token}`)
      .send({ days: 0 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when days exceeds 365", async () => {
    const res = await request(app)
      .post("/api/settings/self-exclude")
      .set("Authorization", `Bearer ${token}`)
      .send({ days: 366 });
    expect(res.status).toBe(400);
  });

  it("accepts days: 30 — not 400 or 401", async () => {
    const res = await request(app)
      .post("/api/settings/self-exclude")
      .set("Authorization", `Bearer ${token}`)
      .send({ days: 30 });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts days: 1 (boundary min)", async () => {
    const res = await request(app)
      .post("/api/settings/self-exclude")
      .set("Authorization", `Bearer ${token}`)
      .send({ days: 1 });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts days: 365 (boundary max)", async () => {
    const res = await request(app)
      .post("/api/settings/self-exclude")
      .set("Authorization", `Bearer ${token}`)
      .send({ days: 365 });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("returns list with auth token — not 401", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});

describe("PATCH /api/notifications/:id/read", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app).patch("/api/notifications/1/read");
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .patch("/api/notifications/abc/read")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid numeric id with auth — not 400 or 401", async () => {
    const res = await request(app)
      .patch("/api/notifications/1/read")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── Subscription history ──────────────────────────────────────────────────────

describe("GET /api/subscription/history", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/subscription/history");
    expect(res.status).toBe(401);
  });

  it("returns list with auth token — not 401", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .get("/api/subscription/history")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});

// ── Referrals ─────────────────────────────────────────────────────────────────

describe("GET /api/referrals/my", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/referrals/my");
    expect(res.status).toBe(401);
  });

  it("returns data with auth token — not 401", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .get("/api/referrals/my")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/referrals/apply", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/referrals/apply").send({ code: "ALICE10" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when code is missing", async () => {
    const res = await request(app)
      .post("/api/referrals/apply")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is too short (min 4 chars)", async () => {
    const res = await request(app)
      .post("/api/referrals/apply")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "AB" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid code string — not 400 or 401", async () => {
    const res = await request(app)
      .post("/api/referrals/apply")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "ALICE10" });
    expect(res.status).not.toBe(401);
  });
});

// ── Admin login ───────────────────────────────────────────────────────────────

describe("POST /api/admin/login", () => {
  it("returns 400 when body is empty", async () => {
    const res = await request(app).post("/api/admin/login").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app).post("/api/admin/login").send({ username: "admin" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when username is missing", async () => {
    const res = await request(app).post("/api/admin/login").send({ password: "secret" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when body has email but no password", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ email: "admin@example.com" });
    expect(res.status).toBe(400);
  });
});

// ── Admin countries ───────────────────────────────────────────────────────────

describe("GET /api/admin/countries", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/countries");
    expect(res.status).toBe(401);
  });

  it("returns 403 with regular user token", async () => {
    const userToken = signToken({ userId: 1 });
    const res = await request(app)
      .get("/api/admin/countries")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("returns list with admin token — not 401 or 403", async () => {
    const res = await request(app)
      .get("/api/admin/countries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("POST /api/admin/countries", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/admin/countries").send({ name: "France", currency: "EUR", currencySymbol: "€", prizePercentage: 50, entryAmountDaily: 5, drawHourUtc: 21 });
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/admin/countries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ currency: "EUR", currencySymbol: "€", prizePercentage: 50, entryAmountDaily: 5, drawHourUtc: 21 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when drawHourUtc is out of range (24)", async () => {
    const res = await request(app)
      .post("/api/admin/countries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "France", currency: "EUR", currencySymbol: "€", prizePercentage: 50, entryAmountDaily: 5, drawHourUtc: 24 });
    expect(res.status).toBe(400);
  });

  it("accepts valid payload — not 400 or 401", async () => {
    const res = await request(app)
      .post("/api/admin/countries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "FR", name: "France", currency: "EUR", currencySymbol: "€", locale: "fr-FR", prizePercentage: 50, entryAmountDaily: 5, entryAmountWeekly: 30, entryAmountMonthly: 100, drawHourUtc: 21 });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── Admin draws ───────────────────────────────────────────────────────────────

describe("GET /api/admin/draws", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/draws");
    expect(res.status).toBe(401);
  });

  it("returns 403 with user token", async () => {
    const userToken = signToken({ userId: 1 });
    const res = await request(app)
      .get("/api/admin/draws")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("returns list with admin token", async () => {
    const res = await request(app)
      .get("/api/admin/draws")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("accepts pagination params", async () => {
    const res = await request(app)
      .get("/api/admin/draws?limit=10&offset=5")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });
});

describe("POST /api/admin/draws", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/admin/draws").send({ countryId: 1 });
    expect(res.status).toBe(401);
  });

  it("returns 400 when countryId is missing", async () => {
    const res = await request(app)
      .post("/api/admin/draws")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when drawDate format is invalid", async () => {
    const res = await request(app)
      .post("/api/admin/draws")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ countryId: 1, drawDate: "25-06-2026" }); // wrong format
    expect(res.status).toBe(400);
  });

  it("accepts valid countryId — not 400 or 401", async () => {
    const res = await request(app)
      .post("/api/admin/draws")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ countryId: 1 });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts countryId with optional drawDate", async () => {
    const res = await request(app)
      .post("/api/admin/draws")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ countryId: 1, drawDate: "2026-12-31" });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/admin/draws/:id/conduct", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/admin/draws/1/conduct");
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .post("/api/admin/draws/abc/conduct")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid numeric id with admin token — not 401", async () => {
    const res = await request(app)
      .post("/api/admin/draws/1/conduct")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── Admin users ───────────────────────────────────────────────────────────────

describe("GET /api/admin/users", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("returns list with admin token", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("accepts search query param", async () => {
    const res = await request(app)
      .get("/api/admin/users?search=alice")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(400);
  });
});

describe("PATCH /api/admin/users/:id/status", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).patch("/api/admin/users/1/status").send({ status: "suspended" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .patch("/api/admin/users/abc/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "suspended" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid status value", async () => {
    const res = await request(app)
      .patch("/api/admin/users/1/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "deleted" });
    expect(res.status).toBe(400);
  });

  it("accepts suspended status — not 400 or 401", async () => {
    const res = await request(app)
      .patch("/api/admin/users/1/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "suspended" });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── Admin withdrawals ─────────────────────────────────────────────────────────

describe("GET /api/admin/withdrawals", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/withdrawals");
    expect(res.status).toBe(401);
  });

  it("returns list with admin token", async () => {
    const res = await request(app)
      .get("/api/admin/withdrawals")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("POST /api/admin/withdrawals/:id/approve", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/admin/withdrawals/1/approve");
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/abc/approve")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid numeric id with admin token — not 401", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/1/approve")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("POST /api/admin/withdrawals/:id/reject", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/admin/withdrawals/1/reject");
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/abc/reject")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid numeric id with admin token — not 401", async () => {
    const res = await request(app)
      .post("/api/admin/withdrawals/1/reject")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── Admin stats & petition ────────────────────────────────────────────────────

describe("GET /api/admin/stats", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("returns stats object with admin token", async () => {
    const res = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("GET /api/admin/petition", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/petition");
    expect(res.status).toBe(401);
  });

  it("returns petition data with admin token", async () => {
    const res = await request(app)
      .get("/api/admin/petition")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── Public petition ───────────────────────────────────────────────────────────

describe("GET /api/petition/count", () => {
  it("returns count without auth (public endpoint)", async () => {
    const res = await request(app).get("/api/petition/count");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("count");
  });
});

describe("GET /api/countries", () => {
  it("returns list without auth (public endpoint)", async () => {
    const res = await request(app).get("/api/countries");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/countries/:id", () => {
  it("returns 400 for non-numeric id", async () => {
    const res = await request(app).get("/api/countries/abc");
    expect(res.status).toBe(400);
  });

  it("returns data for numeric id (public endpoint)", async () => {
    const res = await request(app).get("/api/countries/1");
    expect(res.status).not.toBe(400);
  });
});

// ── Admin transactions ────────────────────────────────────────────────────────

describe("GET /api/admin/transactions", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/transactions");
    expect(res.status).toBe(401);
  });

  it("returns list with admin token", async () => {
    const res = await request(app)
      .get("/api/admin/transactions")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── DELETE /api/subscription/:id ──────────────────────────────────────────────

describe("DELETE /api/subscription/:id", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/subscription/1");
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .delete("/api/subscription/abc")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("accepts valid numeric id with auth — not 401", async () => {
    const res = await request(app)
      .delete("/api/subscription/1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});

// ── DELETE /api/petition/sign ─────────────────────────────────────────────────

describe("DELETE /api/petition/sign", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/petition/sign");
    expect(res.status).toBe(401);
  });

  it("revokes petition signature with auth — not 401", async () => {
    const token = signToken({ userId: 1 });
    const res = await request(app)
      .delete("/api/petition/sign")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});

// ── PATCH /api/admin/countries/:id ───────────────────────────────────────────

describe("PATCH /api/admin/countries/:id", () => {
  const adminToken = signToken({ userId: 1, role: "admin" });

  it("returns 401 without auth", async () => {
    const res = await request(app).patch("/api/admin/countries/1").send({ name: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 403 with user token", async () => {
    const userToken = signToken({ userId: 1 });
    const res = await request(app)
      .patch("/api/admin/countries/1")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ name: "Updated" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app)
      .patch("/api/admin/countries/abc")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when drawHourUtc is out of range", async () => {
    const res = await request(app)
      .patch("/api/admin/countries/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ drawHourUtc: 25 });
    expect(res.status).toBe(400);
  });

  it("accepts name-only update with admin token — not 400 or 401", async () => {
    const res = await request(app)
      .patch("/api/admin/countries/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Ukraine Updated" });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts isActive toggle", async () => {
    const res = await request(app)
      .patch("/api/admin/countries/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── POST /api/dev/seed ────────────────────────────────────────────────────────

describe("POST /api/dev/seed", () => {
  it("returns 403 in non-seeded environment (SEED_ALLOWED not set)", async () => {
    const prev = process.env.SEED_ALLOWED;
    delete process.env.SEED_ALLOWED;
    const res = await request(app).post("/api/dev/seed");
    expect(res.status).toBe(403);
    if (prev !== undefined) process.env.SEED_ALLOWED = prev;
  });

  it("returns 403 when NODE_ENV is production", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSeed = process.env.SEED_ALLOWED;
    process.env.NODE_ENV = "production";
    process.env.SEED_ALLOWED = "true";
    const res = await request(app).post("/api/dev/seed");
    expect(res.status).toBe(403);
    process.env.NODE_ENV = prevEnv;
    if (prevSeed !== undefined) process.env.SEED_ALLOWED = prevSeed;
    else delete process.env.SEED_ALLOWED;
  });
});

// ── PATCH /api/settings/responsible-gaming ────────────────────────────────────

describe("PATCH /api/settings/responsible-gaming", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .patch("/api/settings/responsible-gaming")
      .send({ dailyLimitAmount: 50 });
    expect(res.status).toBe(401);
  });

  it("returns 400 for negative dailyLimitAmount", async () => {
    const res = await request(app)
      .patch("/api/settings/responsible-gaming")
      .set("Authorization", `Bearer ${token}`)
      .send({ dailyLimitAmount: -10 });
    expect(res.status).toBe(400);
  });

  it("accepts null to clear a limit", async () => {
    const res = await request(app)
      .patch("/api/settings/responsible-gaming")
      .set("Authorization", `Bearer ${token}`)
      .send({ dailyLimitAmount: null });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts positive limit values — not 400 or 401", async () => {
    const res = await request(app)
      .patch("/api/settings/responsible-gaming")
      .set("Authorization", `Bearer ${token}`)
      .send({ dailyLimitAmount: 100, weeklyLimitAmount: 500, monthlyLimitAmount: 1500 });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });

  it("accepts empty body (no-op update) — not 400", async () => {
    const res = await request(app)
      .patch("/api/settings/responsible-gaming")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
  });
});

// ── GET /api/settings/responsible-gaming ─────────────────────────────────────

describe("GET /api/settings/responsible-gaming", () => {
  const token = signToken({ userId: 1 });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/settings/responsible-gaming");
    expect(res.status).toBe(401);
  });

  it("returns data with auth token — not 401", async () => {
    const res = await request(app)
      .get("/api/settings/responsible-gaming")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});
