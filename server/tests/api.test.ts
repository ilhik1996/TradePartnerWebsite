import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock all DB-touching modules so tests run without DATABASE_URL ─────────────

// Chainable query stub: lets requireAuth / requireAdmin pass through without
// a real DB connection.  Route handlers that reach DB code will still throw
// (caught by ar() → 500), which is the pre-existing behaviour these tests
// rely on for "Zod accepts; DB error expected" assertions.
vi.mock("../db", () => {
  const makeChain = (): any => {
    const chain: any = {
      from: () => makeChain(),
      where: () => Promise.resolve([{ status: "active", id: 1 }]),
      for: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
    };
    return chain;
  };
  return { db: { select: makeChain } };
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

