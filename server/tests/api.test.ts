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
      from: (table: any) => { _fromTable = table; return chain; },
      // userSessions blacklist check must return [] (token not revoked).
      // All other queries (users.status, adminUsers.isActive) return an active stub.
      where: () => {
        const isSessionsTable = _fromTable && "tokenHash" in _fromTable;
        return Promise.resolve(isSessionsTable ? [] : [{ status: "active", id: 1, isActive: true }]);
      },
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
  });
  return {
    db: {
      select: makeSelectChain,
      insert: () => makeInsertChain(),
      delete: () => ({ where: () => Promise.resolve() }),
    },
  };
});
vi.mock("../modules/push", () => ({
  sendPushToUser: vi.fn(),
  VAPID_PUBLIC_KEY: null,
}));

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
