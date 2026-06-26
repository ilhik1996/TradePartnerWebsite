import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// We test the Sumsub request-signing logic in isolation, without hitting the network.

// Helper that replicates the sign() function from kyc.ts
function sign(secretKey: string, timestamp: number, method: string, path: string, body?: string): string {
  const msg = `${timestamp}${method.toUpperCase()}${path}${body ?? ""}`;
  return createHmac("sha256", secretKey).update(msg).digest("hex");
}

describe("Sumsub request signing", () => {
  const secret = "test_secret";
  const ts = 1700000000;

  it("produces deterministic signature for GET request", () => {
    const sig = sign(secret, ts, "GET", "/resources/applicants?levelName=basic");
    expect(sig).toHaveLength(64);
    expect(sig).toBe(sign(secret, ts, "get", "/resources/applicants?levelName=basic"));
  });

  it("includes body in signature for POST", () => {
    const body = '{"externalUserId":"42"}';
    const sigWithBody = sign(secret, ts, "POST", "/resources/applicants", body);
    const sigNoBody = sign(secret, ts, "POST", "/resources/applicants");
    expect(sigWithBody).not.toBe(sigNoBody);
  });

  it("different timestamps produce different signatures", () => {
    const a = sign(secret, 1000, "GET", "/test");
    const b = sign(secret, 1001, "GET", "/test");
    expect(a).not.toBe(b);
  });
});

describe("sumsubConfigured()", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("returns false when env vars are missing", async () => {
    delete process.env.SUMSUB_APP_TOKEN;
    delete process.env.SUMSUB_SECRET_KEY;
    const { sumsubConfigured } = await import("../modules/kyc");
    expect(sumsubConfigured()).toBe(false);
  });

  it("returns true when both env vars are present", async () => {
    process.env.SUMSUB_APP_TOKEN = "tok";
    process.env.SUMSUB_SECRET_KEY = "sec";
    const { sumsubConfigured } = await import("../modules/kyc");
    expect(sumsubConfigured()).toBe(true);
  });
});

describe("createApplicant() without credentials", () => {
  it("throws when SUMSUB credentials are not set", async () => {
    const saved = { tok: process.env.SUMSUB_APP_TOKEN, key: process.env.SUMSUB_SECRET_KEY };
    delete process.env.SUMSUB_APP_TOKEN;
    delete process.env.SUMSUB_SECRET_KEY;

    const { createApplicant } = await import("../modules/kyc");
    await expect(createApplicant({ externalUserId: "1" })).rejects.toThrow("not configured");

    process.env.SUMSUB_APP_TOKEN = saved.tok;
    process.env.SUMSUB_SECRET_KEY = saved.key;
  });
});
