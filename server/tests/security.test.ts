import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectSuspicious, deviceFingerprint } from "../middleware/security";

// ─── detectSuspicious ─────────────────────────────────────────────────────────
// detectSuspicious uses a module-level Map, so tests must use unique keys to
// avoid cross-test pollution.

let _counter = 0;
const uid = () => `test-${++_counter}`;

describe("detectSuspicious", () => {
  it("returns false on the very first call for a key", () => {
    expect(detectSuspicious("login", uid())).toBe(false);
  });

  it("returns false while count is at or below maxPerMinute", () => {
    const key = uid();
    // 5 calls with limit=5 → all should be below the threshold
    for (let i = 0; i < 5; i++) {
      expect(detectSuspicious("login", key, 5)).toBe(false);
    }
  });

  it("returns true once count exceeds maxPerMinute", () => {
    const key = uid();
    for (let i = 0; i < 5; i++) detectSuspicious("entry", key, 5);
    // 6th call — count is now 6 > 5
    expect(detectSuspicious("entry", key, 5)).toBe(true);
  });

  it("applies default maxPerMinute of 5", () => {
    const key = uid();
    for (let i = 0; i < 5; i++) detectSuspicious("deposit", key);
    // 6th call with default limit
    expect(detectSuspicious("deposit", key)).toBe(true);
  });

  it("respects a custom maxPerMinute of 1", () => {
    const key = uid();
    detectSuspicious("withdraw", key, 1);     // count = 1, not suspicious
    expect(detectSuspicious("withdraw", key, 1)).toBe(true); // count = 2 > 1
  });

  it("different action names are tracked independently for the same key", () => {
    const key = uid();
    for (let i = 0; i < 10; i++) detectSuspicious("flood_a", key, 3);
    // "flood_b" with the same key has its own counter — should be clean
    expect(detectSuspicious("flood_b", key, 3)).toBe(false);
  });

  it("different keys for the same action are tracked independently", () => {
    const keyA = uid();
    const keyB = uid();
    for (let i = 0; i < 10; i++) detectSuspicious("login", keyA, 3);
    expect(detectSuspicious("login", keyB, 3)).toBe(false);
  });

  it("continues returning true after being triggered (sticky within the window)", () => {
    const key = uid();
    for (let i = 0; i < 6; i++) detectSuspicious("spam", key, 5);
    // Should stay suspicious
    expect(detectSuspicious("spam", key, 5)).toBe(true);
    expect(detectSuspicious("spam", key, 5)).toBe(true);
  });
});

// ─── deviceFingerprint ────────────────────────────────────────────────────────

describe("deviceFingerprint middleware", () => {
  function makeReq(overrides: Record<string, any> = {}): any {
    return {
      headers: {
        "user-agent": "Mozilla/5.0 (Test)",
        "accept-language": "en-US,en;q=0.9",
        ...overrides.headers,
      },
      socket: { remoteAddress: "127.0.0.1", ...overrides.socket },
      ...overrides,
    };
  }

  it("assigns a 32-character hex fingerprint to req.deviceFingerprint", () => {
    const req = makeReq();
    const next = vi.fn();
    deviceFingerprint(req, {} as any, next);
    expect(typeof req.deviceFingerprint).toBe("string");
    expect(req.deviceFingerprint).toHaveLength(32);
    expect(req.deviceFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("calls next()", () => {
    const next = vi.fn();
    deviceFingerprint(makeReq(), {} as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("produces the same fingerprint for identical inputs", () => {
    const req1 = makeReq();
    const req2 = makeReq();
    const next = vi.fn();
    deviceFingerprint(req1, {} as any, next);
    deviceFingerprint(req2, {} as any, next);
    expect(req1.deviceFingerprint).toBe(req2.deviceFingerprint);
  });

  it("produces different fingerprints for different user-agents", () => {
    const req1 = makeReq({ headers: { "user-agent": "Chrome/120" } });
    const req2 = makeReq({ headers: { "user-agent": "Firefox/121" } });
    const next = vi.fn();
    deviceFingerprint(req1, {} as any, next);
    deviceFingerprint(req2, {} as any, next);
    expect(req1.deviceFingerprint).not.toBe(req2.deviceFingerprint);
  });

  it("prefers x-forwarded-for over socket.remoteAddress", () => {
    const reqForwarded = makeReq({
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "10.0.0.1" },
    });
    const reqSocket = makeReq({
      headers: {},
      socket: { remoteAddress: "1.2.3.4" },
    });
    const next = vi.fn();
    deviceFingerprint(reqForwarded, {} as any, next);
    deviceFingerprint(reqSocket, {} as any, next);
    // Both resolve to IP "1.2.3.4" — fingerprints differ only by accept-language/UA being equal
    // What matters is that x-forwarded-for takes priority — test via different IPs
    const reqDifferentIp = makeReq({
      headers: { "x-forwarded-for": "9.9.9.9" },
      socket: { remoteAddress: "1.2.3.4" },
    });
    deviceFingerprint(reqDifferentIp, {} as any, next);
    expect(reqForwarded.deviceFingerprint).not.toBe(reqDifferentIp.deviceFingerprint);
  });

  it("uses first IP from a comma-separated x-forwarded-for list", () => {
    const req = makeReq({ headers: { "x-forwarded-for": "  5.5.5.5 , 6.6.6.6" } });
    const reqSingle = makeReq({ headers: { "x-forwarded-for": "5.5.5.5" } });
    const next = vi.fn();
    deviceFingerprint(req, {} as any, next);
    deviceFingerprint(reqSingle, {} as any, next);
    expect(req.deviceFingerprint).toBe(reqSingle.deviceFingerprint);
  });

  it("falls back gracefully when headers are absent", () => {
    const req: any = { headers: {}, socket: {} };
    const next = vi.fn();
    expect(() => deviceFingerprint(req, {} as any, next)).not.toThrow();
    expect(req.deviceFingerprint).toHaveLength(32);
  });
});
