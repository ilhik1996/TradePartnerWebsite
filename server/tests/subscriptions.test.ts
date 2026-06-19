import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (registered before any imports from the modules under test) ────────

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../modules/payments", () => ({
  processDeposit: vi.fn(),
}));

vi.mock("../modules/notifications", () => ({
  insertNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../modules/gamification", () => ({
  awardXp: vi.fn().mockResolvedValue(10),
  checkAndAwardBadges: vi.fn().mockResolvedValue([]),
}));

vi.mock("../modules/lottery", () => ({
  addPaidEntry: vi.fn().mockResolvedValue(undefined),
  getOrCreateDraw: vi.fn().mockResolvedValue({ id: 1 }),
  todayDateString: vi.fn().mockReturnValue("2025-01-01"),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { cancelSubscription, createSubscription, renewDueSubscriptions } from "../modules/subscriptions";
import { db } from "../db";
import { processDeposit } from "../modules/payments";
import { insertNotification } from "../modules/notifications";

const mockedDb = db as any;
const mockedProcessDeposit = vi.mocked(processDeposit);

// ─── Chainable mock factories ─────────────────────────────────────────────────

function makeSelectChain(rows: any[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

function makeUpdateChain(returnRows: any[] = []) {
  return {
    set: () => ({
      where: () => Promise.resolve(returnRows),
    }),
  };
}

function makeInsertChain(returnRows: any[] = []) {
  return {
    values: () => ({
      returning: () => Promise.resolve(returnRows),
    }),
  };
}

// update().set().where().returning() — used by renewDueSubscriptions atomic claim
function makeUpdateWithReturning(returnRows: any[] = []) {
  return {
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve(returnRows),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── cancelSubscription ───────────────────────────────────────────────────────

describe("cancelSubscription", () => {
  it("throws when subscription is not found", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([]));
    await expect(cancelSubscription(1, 999)).rejects.toThrow("Subscription not found");
  });

  it("throws when subscription is not active (already cancelled)", async () => {
    const sub = { id: 5, userId: 1, status: "cancelled", nextBillingDate: new Date() };
    mockedDb.select.mockReturnValue(makeSelectChain([sub]));
    await expect(cancelSubscription(1, 5)).rejects.toThrow("not active");
  });

  it("throws when subscription is not active (paused)", async () => {
    const sub = { id: 5, userId: 1, status: "paused", nextBillingDate: new Date() };
    mockedDb.select.mockReturnValue(makeSelectChain([sub]));
    await expect(cancelSubscription(1, 5)).rejects.toThrow("not active");
  });

  it("returns { cancelled: true, effectiveDate } equal to nextBillingDate", async () => {
    const nextBillingDate = new Date("2025-03-01T00:00:00.000Z");
    const sub = { id: 5, userId: 1, status: "active", nextBillingDate };
    mockedDb.select.mockReturnValue(makeSelectChain([sub]));
    mockedDb.update.mockReturnValue(makeUpdateChain());

    const result = await cancelSubscription(1, 5);
    expect(result.cancelled).toBe(true);
    expect(result.effectiveDate).toEqual(nextBillingDate);
  });

  it("calls db.update to set status=cancelled", async () => {
    const sub = { id: 7, userId: 2, status: "active", nextBillingDate: new Date() };
    mockedDb.select.mockReturnValue(makeSelectChain([sub]));
    mockedDb.update.mockReturnValue(makeUpdateChain());

    await cancelSubscription(2, 7);
    expect(mockedDb.update).toHaveBeenCalledOnce();
  });
});

// ─── createSubscription — error paths ────────────────────────────────────────

describe("createSubscription — error paths", () => {
  it("throws when user is not found", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([]));
    await expect(createSubscription(99, "weekly", "tok")).rejects.toThrow("User not found");
  });

  it("throws when user account is not active", async () => {
    const inactiveUser = { id: 1, status: "suspended", countryId: 1 };
    mockedDb.select.mockReturnValue(makeSelectChain([inactiveUser]));
    await expect(createSubscription(1, "weekly", "tok")).rejects.toThrow("not active");
  });

  it("throws when user has no countryId", async () => {
    const userNoCountry = { id: 1, status: "active", countryId: null };
    mockedDb.select.mockReturnValue(makeSelectChain([userNoCountry]));
    await expect(createSubscription(1, "weekly", "tok")).rejects.toThrow("no country");
  });

  it("throws when country record is not found", async () => {
    const user = { id: 1, status: "active", countryId: 77 };
    // First select → user, second select → no country
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([user]))
      .mockReturnValueOnce(makeSelectChain([]));
    await expect(createSubscription(1, "weekly", "tok")).rejects.toThrow("Country not found");
  });

  it("throws when the payment provider returns ok=false", async () => {
    const user = { id: 1, status: "active", countryId: 1 };
    const country = { id: 1, name: "Ukraine", currency: "UAH", currencySymbol: "₴", entryAmountWeekly: "50", entryAmountMonthly: "150" };
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([user]))
      .mockReturnValueOnce(makeSelectChain([country]));
    mockedProcessDeposit.mockResolvedValue({ ok: false, message: "Card declined" });

    await expect(createSubscription(1, "weekly", "bad_token")).rejects.toThrow("Card declined");
  });

  it("throws 'Payment failed' when ok=false and no message is provided", async () => {
    const user = { id: 1, status: "active", countryId: 1 };
    const country = { id: 1, name: "Ukraine", currency: "UAH", currencySymbol: "₴", entryAmountWeekly: "50", entryAmountMonthly: "150" };
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([user]))
      .mockReturnValueOnce(makeSelectChain([country]));
    mockedProcessDeposit.mockResolvedValue({ ok: false, message: undefined });

    await expect(createSubscription(1, "weekly", "tok")).rejects.toThrow("Payment failed");
  });
});

// ─── createSubscription — next billing date arithmetic ───────────────────────

describe("createSubscription — next billing date", () => {
  function setupHappyPath(type: "weekly" | "monthly") {
    const user = { id: 1, status: "active", countryId: 1 };
    const country = {
      id: 1, name: "Ukraine", currency: "UAH", currencySymbol: "₴",
      entryAmountWeekly: "50", entryAmountMonthly: "150",
    };
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([user]))
      .mockReturnValueOnce(makeSelectChain([country]));
    mockedProcessDeposit.mockResolvedValue({ ok: true });

    const insertedSub = { id: 10, type, status: "active", nextBillingDate: new Date() };
    mockedDb.update.mockReturnValue(makeUpdateChain());
    mockedDb.insert.mockReturnValue(makeInsertChain([insertedSub]));
    return insertedSub;
  }

  it("weekly subscription: nextBillingDate is 7 days after now", async () => {
    const before = new Date();
    setupHappyPath("weekly");

    // Capture what values() was called with to inspect nextBillingDate
    const insertSpy = vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((vals: any) => ({
        returning: () => Promise.resolve([{ id: 10, ...vals }]),
      })),
    });
    mockedDb.insert.mockReturnValue({ values: insertSpy.mock.results[0]?.value?.values ?? vi.fn().mockReturnValue({ returning: () => Promise.resolve([{ id: 10 }]) }) });

    // Re-setup with a spy to capture the inserted values
    vi.clearAllMocks();
    const user = { id: 1, status: "active", countryId: 1 };
    const country = { id: 1, name: "Ukraine", currency: "UAH", currencySymbol: "₴", entryAmountWeekly: "50", entryAmountMonthly: "150" };
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([user]))
      .mockReturnValueOnce(makeSelectChain([country]));
    mockedProcessDeposit.mockResolvedValue({ ok: true });
    mockedDb.update.mockReturnValue(makeUpdateChain());

    let capturedValues: any = null;
    mockedDb.insert.mockReturnValue({
      values: (v: any) => {
        capturedValues = v;
        return { returning: () => Promise.resolve([{ id: 10, ...v }]) };
      },
    });

    await createSubscription(1, "weekly", "tok");

    const diff = capturedValues.nextBillingDate.getTime() - capturedValues.startDate.getTime();
    const diffDays = Math.round(diff / 86_400_000);
    expect(diffDays).toBe(7);
  });

  it("monthly subscription: nextBillingDate is exactly 1 UTC month after start", async () => {
    vi.clearAllMocks();
    const user = { id: 1, status: "active", countryId: 1 };
    const country = { id: 1, name: "Ukraine", currency: "UAH", currencySymbol: "₴", entryAmountWeekly: "50", entryAmountMonthly: "150" };
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([user]))
      .mockReturnValueOnce(makeSelectChain([country]));
    mockedProcessDeposit.mockResolvedValue({ ok: true });
    mockedDb.update.mockReturnValue(makeUpdateChain());

    let capturedValues: any = null;
    mockedDb.insert.mockReturnValue({
      values: (v: any) => {
        capturedValues = v;
        return { returning: () => Promise.resolve([{ id: 10, ...v }]) };
      },
    });

    await createSubscription(1, "monthly", "tok");

    const start: Date = capturedValues.startDate;
    const next: Date = capturedValues.nextBillingDate;
    expect(next.getUTCMonth()).toBe((start.getUTCMonth() + 1) % 12);
    expect(next.getUTCDate()).toBe(start.getUTCDate());
  });

  it("weekly subscription uses the weekly amount, monthly uses monthly", async () => {
    for (const [type, expectedAmount] of [["weekly", "50.00"], ["monthly", "150.00"]] as const) {
      vi.clearAllMocks();
      const user = { id: 1, status: "active", countryId: 1 };
      const country = { id: 1, name: "Ukraine", currency: "UAH", currencySymbol: "₴", entryAmountWeekly: "50", entryAmountMonthly: "150" };
      mockedDb.select
        .mockReturnValueOnce(makeSelectChain([user]))
        .mockReturnValueOnce(makeSelectChain([country]));
      mockedProcessDeposit.mockResolvedValue({ ok: true });
      mockedDb.update.mockReturnValue(makeUpdateChain());

      let capturedValues: any = null;
      mockedDb.insert.mockReturnValue({
        values: (v: any) => {
          capturedValues = v;
          return { returning: () => Promise.resolve([{ id: 10, ...v }]) };
        },
      });

      await createSubscription(1, type, "tok");
      expect(capturedValues.amount).toBe(expectedAmount);
    }
  });

  it("payment is attempted BEFORE cancelling existing subscription", async () => {
    const callOrder: string[] = [];
    const user = { id: 1, status: "active", countryId: 1 };
    const country = { id: 1, name: "Ukraine", currency: "UAH", currencySymbol: "₴", entryAmountWeekly: "50", entryAmountMonthly: "150" };

    vi.clearAllMocks();
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([user]))
      .mockReturnValueOnce(makeSelectChain([country]));
    mockedProcessDeposit.mockImplementation(async () => {
      callOrder.push("charge");
      return { ok: true };
    });
    mockedDb.update.mockImplementation(() => {
      callOrder.push("cancel_existing");
      return makeUpdateChain();
    });
    mockedDb.insert.mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([{ id: 10 }]) }),
    });

    await createSubscription(1, "weekly", "tok");
    expect(callOrder[0]).toBe("charge");
    expect(callOrder[1]).toBe("cancel_existing");
  });
});

// ─── renewDueSubscriptions ────────────────────────────────────────────────────

const COUNTRY = { id: 1, currency: "UAH", currencySymbol: "₴" };

function makeSub(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    userId: 10,
    countryId: 1,
    type: "weekly",
    status: "active",
    amount: "50.00",
    currency: "UAH",
    paymentMethodToken: "tok_valid",
    nextBillingDate: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("renewDueSubscriptions", () => {
  // Reset ALL mock state (including implementations) before each test in this block,
  // because earlier describe blocks leave persistent mockImplementations on db.update.
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(insertNotification).mockResolvedValue(undefined as any);
  });

  it("does nothing when no subscriptions are due", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([]));
    await renewDueSubscriptions();
    expect(mockedProcessDeposit).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it("skips renewal when another process already claimed the slot (claimed is empty)", async () => {
    const sub = makeSub();
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([sub]))
      .mockReturnValueOnce(makeSelectChain([COUNTRY]));
    mockedDb.update.mockReturnValue(makeUpdateWithReturning([]));

    await renewDueSubscriptions();
    expect(mockedProcessDeposit).not.toHaveBeenCalled();
  });

  it("charges the subscription amount when the claim succeeds", async () => {
    const sub = makeSub();
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([sub]))
      .mockReturnValueOnce(makeSelectChain([COUNTRY]));
    mockedDb.update.mockReturnValue(makeUpdateWithReturning([{ id: 1 }]));
    mockedProcessDeposit.mockResolvedValue({ ok: true });

    await renewDueSubscriptions();
    expect(mockedProcessDeposit).toHaveBeenCalledWith(
      10, 50, "UAH", "tok_valid", expect.stringContaining("renewal")
    );
  });

  it("pauses subscription and sends notification when charge fails", async () => {
    const sub = makeSub();
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([sub]))
      .mockReturnValueOnce(makeSelectChain([COUNTRY]));
    // First update = atomic claim (succeeds), second update = pause on failure
    mockedDb.update
      .mockReturnValueOnce(makeUpdateWithReturning([{ id: 1 }]))
      .mockReturnValueOnce(makeUpdateChain());
    mockedProcessDeposit.mockResolvedValue({ ok: false, message: "Card declined" });

    await renewDueSubscriptions();

    expect(mockedDb.update).toHaveBeenCalledTimes(2);
    expect(vi.mocked(insertNotification)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, type: "subscription_renewal_failed" })
    );
  });

  it("advances weekly nextBillingDate by 7 days in the claim update", async () => {
    const sub = makeSub({ type: "weekly", nextBillingDate: new Date("2025-01-01T00:00:00.000Z") });
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([sub]))
      .mockReturnValueOnce(makeSelectChain([COUNTRY]));

    let claimSetArg: any = null;
    mockedDb.update.mockReturnValue({
      set: (v: any) => {
        claimSetArg = v;
        return { where: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }) };
      },
    });
    mockedProcessDeposit.mockResolvedValue({ ok: true });

    await renewDueSubscriptions();

    expect(claimSetArg.nextBillingDate.getTime()).toBe(new Date("2025-01-08T00:00:00.000Z").getTime());
  });

  it("clamps monthly renewal to last day of month (Jan 31 → Feb 28, not Mar 3)", async () => {
    const sub = makeSub({ type: "monthly", nextBillingDate: new Date("2025-01-31T00:00:00.000Z") });
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([sub]))
      .mockReturnValueOnce(makeSelectChain([COUNTRY]));

    let claimSetArg: any = null;
    mockedDb.update.mockReturnValue({
      set: (v: any) => {
        claimSetArg = v;
        return { where: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }) };
      },
    });
    mockedProcessDeposit.mockResolvedValue({ ok: true });

    await renewDueSubscriptions();

    expect(claimSetArg.nextBillingDate.getUTCMonth()).toBe(1);   // February (not March)
    expect(claimSetArg.nextBillingDate.getUTCDate()).toBe(28);   // Feb 28 in 2025 (non-leap)
  });

  it("does not crash when one renewal throws in the claim step — continues to next", async () => {
    const sub1 = makeSub({ id: 1 });
    const sub2 = makeSub({ id: 2, userId: 20 });
    mockedDb.select.mockReturnValue(makeSelectChain([sub1, sub2]));

    let updateCount = 0;
    mockedDb.update.mockImplementation(() => {
      updateCount++;
      if (updateCount === 1) throw new Error("DB deadlock on sub1");
      return makeUpdateWithReturning([{ id: 2 }]);
    });
    mockedProcessDeposit.mockResolvedValue({ ok: true });

    await expect(renewDueSubscriptions()).resolves.toBeUndefined();
    // sub1 threw, sub2 was processed
    expect(mockedProcessDeposit).toHaveBeenCalledTimes(1);
    expect(mockedProcessDeposit).toHaveBeenCalledWith(20, 50, "UAH", "tok_valid", expect.any(String));
  });
});
