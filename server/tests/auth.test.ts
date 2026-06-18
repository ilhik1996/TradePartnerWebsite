import { describe, it, expect, vi } from "vitest";

// auth.ts imports db at module level — stub to avoid DATABASE_URL requirement
vi.mock("../db", () => ({
  db: { select: vi.fn() },
}));

import { signToken, verifyToken } from "../auth";

// ─── signToken / verifyToken ──────────────────────────────────────────────────

describe("signToken + verifyToken round-trip", () => {
  it("round-trips userId", () => {
    const token = signToken({ userId: 42 });
    expect(verifyToken(token)?.userId).toBe(42);
  });

  it("round-trips role", () => {
    const token = signToken({ userId: 1, role: "admin" });
    expect(verifyToken(token)?.role).toBe("admin");
  });

  it("works without a role field (role is undefined in payload)", () => {
    const token = signToken({ userId: 7 });
    const payload = verifyToken(token);
    expect(payload?.userId).toBe(7);
    expect(payload?.role).toBeUndefined();
  });

  it("produces a three-part dot-separated JWT string", () => {
    const token = signToken({ userId: 1 });
    expect(token.split(".")).toHaveLength(3);
  });

  it("produces different tokens for different userIds", () => {
    const t1 = signToken({ userId: 1 });
    const t2 = signToken({ userId: 2 });
    expect(t1).not.toBe(t2);
  });

  it("produces different tokens for different roles with the same userId", () => {
    const user = signToken({ userId: 5, role: "user" });
    const admin = signToken({ userId: 5, role: "admin" });
    expect(user).not.toBe(admin);
  });
});

describe("verifyToken — rejection cases", () => {
  it("returns null for a random string", () => {
    expect(verifyToken("not-a-jwt")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyToken("")).toBeNull();
  });

  it("returns null for a structurally valid JWT signed with a different secret", () => {
    // Build a minimal JWT signed with the wrong secret by hand
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ userId: 1 })).toString("base64url");
    const fakeToken = `${header}.${payload}.invalidsignature`;
    expect(verifyToken(fakeToken)).toBeNull();
  });

  it("returns null for a token with a tampered payload", () => {
    const token = signToken({ userId: 1, role: "user" });
    const parts = token.split(".");
    // Replace payload with a forged one (admin role)
    const forgedPayload = Buffer.from(JSON.stringify({ userId: 1, role: "admin" })).toString("base64url");
    const tampered = `${parts[0]}.${forgedPayload}.${parts[2]}`;
    expect(verifyToken(tampered)).toBeNull();
  });

  it("returns null for a token with a null byte in signature", () => {
    expect(verifyToken("a.b.\0")).toBeNull();
  });
});
