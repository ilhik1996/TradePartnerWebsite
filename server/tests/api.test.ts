import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock all DB-touching modules so tests run without DATABASE_URL ─────────────

vi.mock("../db", () => ({ db: {} }));
vi.mock("../modules/push", () => ({
  sendPushToUser: vi.fn(),
  VAPID_PUBLIC_KEY: null,
}));

// Import after mocks are registered
const { registerRoutes } = await import("../routes");

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
