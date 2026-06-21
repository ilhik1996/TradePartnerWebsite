import { describe, it, expect, vi, beforeEach } from "vitest";

// payments.ts imports db at module level — stub it so the module loads cleanly
vi.mock("../db", () => ({
  db: { transaction: vi.fn(), select: vi.fn() },
}));

import { chargebackRiskScore, processDeposit } from "../modules/payments";
import { db } from "../db";

const mockedDb = db as any;

// Build a mock tx object for db.transaction(fn)
function makeTx(walletBalance: string | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve(
            walletBalance === null
              ? []
              : [{ id: 1, userId: 1, balance: walletBalance }]
          ),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({ values: () => Promise.resolve([]) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── processDeposit ───────────────────────────────────────────────────────────

describe("processDeposit — successful path", () => {
  it("returns { ok: true, transactionId } when provider succeeds and wallet is credited", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 0.5 >= 0.05 → MockProvider succeeds
    mockedDb.transaction.mockImplementation((fn: any) => fn(makeTx("50.00")));

    const result = await processDeposit(1, 25, "USD", "tok_test", "Top-up");

    expect(result.ok).toBe(true);
    expect(typeof result.transactionId).toBe("string");
  });
});

describe("processDeposit — provider failure", () => {
  it("returns { ok: false, message } without touching the DB when provider declines", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 0 < 0.05 → MockProvider fails

    const result = await processDeposit(1, 25, "USD", "tok_test", "Top-up");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/declined/i);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});

describe("processDeposit — wallet not found", () => {
  it("returns { ok: false, message: 'Wallet not found' } when user has no wallet row", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // provider succeeds
    mockedDb.transaction.mockImplementation((fn: any) => fn(makeTx(null))); // empty → no wallet

    const result = await processDeposit(1, 25, "USD", "tok_test", "Top-up");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/wallet not found/i);
  });
});

describe("processDeposit — balance overflow guard", () => {
  it("returns { ok: false } when deposit would exceed the maximum balance limit", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // provider succeeds
    // 9_999_999.00 + 1.00 = 10_000_000.00 > 9_999_999.99
    mockedDb.transaction.mockImplementation((fn: any) => fn(makeTx("9999999.00")));

    const result = await processDeposit(1, 1, "USD", "tok_test", "Top-up");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/maximum.*balance|exceed/i);
  });
});

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
