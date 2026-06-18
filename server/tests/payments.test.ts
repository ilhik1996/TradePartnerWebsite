import { describe, it, expect, vi } from "vitest";

// payments.ts imports db at module level — stub it so the module loads cleanly
vi.mock("../db", () => ({
  db: { transaction: vi.fn(), select: vi.fn() },
}));

import { chargebackRiskScore } from "../modules/payments";

// ─── chargebackRiskScore ──────────────────────────────────────────────────────

describe("chargebackRiskScore", () => {
  const base = { userId: 1, ip: "1.2.3.4", userAgent: "Mozilla/5.0" };

  it("returns 0 for amounts at or below $500", () => {
    expect(chargebackRiskScore({ ...base, amountUsd: 0 })).toBe(0);
    expect(chargebackRiskScore({ ...base, amountUsd: 100 })).toBe(0);
    expect(chargebackRiskScore({ ...base, amountUsd: 500 })).toBe(0);
  });

  it("returns 30 for amounts above $500 and at or below $1000", () => {
    expect(chargebackRiskScore({ ...base, amountUsd: 501 })).toBe(30);
    expect(chargebackRiskScore({ ...base, amountUsd: 999 })).toBe(30);
    expect(chargebackRiskScore({ ...base, amountUsd: 1000 })).toBe(30);
  });

  it("returns 60 for amounts above $1000", () => {
    expect(chargebackRiskScore({ ...base, amountUsd: 1001 })).toBe(60);
    expect(chargebackRiskScore({ ...base, amountUsd: 5000 })).toBe(60);
  });

  it("result is always capped at 100", () => {
    expect(chargebackRiskScore({ ...base, amountUsd: 999_999 })).toBeLessThanOrEqual(100);
  });

  it("score is non-negative for any input", () => {
    for (const amount of [0, 10, 100, 500, 501, 1000, 1001, 10000]) {
      expect(chargebackRiskScore({ ...base, amountUsd: amount })).toBeGreaterThanOrEqual(0);
    }
  });
});
