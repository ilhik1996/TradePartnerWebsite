import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("../modules/notifications", () => ({
  insertNotification: vi.fn().mockResolvedValue(undefined),
}));

import { addPaidEntry, addFreeEntry } from "../modules/lottery";
import { db } from "../db";

const mockedDb = db as any;

// ─── Mock helpers ─────────────────────────────────────────────────────────────

// Returns a thenable chain that also exposes .for() and .then() so the mock
// works for all three call patterns Drizzle uses:
//   await db.select().from().where()            — direct await
//   await db.select().from().where().for(...)   — FOR UPDATE lock
//   db.select().from().where().then(r => r[0])  — .then() chaining
function sel(rows: any[]) {
  const p = Promise.resolve(rows);
  const chain: any = {
    from: () => chain,
    where: () => makeThenable(rows),
    for: () => p,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  };
  return chain;
}

// A value that behaves as a Promise AND has extra chainable methods
function makeThenable(rows: any[]) {
  const p = Promise.resolve(rows);
  return Object.assign(p, {
    for: (_mode: string) => Promise.resolve(rows),
    returning: () => Promise.resolve(rows),
  });
}

// Build a transaction mock whose inner selects, updates, and inserts are driven
// by sequential `responses` arrays.
function makeTx(responses: {
  selects: any[][];       // one array of rows per select call inside the tx
  updateReturns?: any[];  // rows returned from update().returning() (draw totals)
  insertTxRow?: any;      // row from insert(transactions).returning()
}) {
  let selectIdx = 0;
  let updateIdx = 0;

  return {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = responses.selects[selectIdx++] ?? [];
          return makeThenable(rows);
        },
      }),
    }),

    update: () => ({
      set: () => ({
        where: () => {
          // The draw-totals update uses .returning(); wallet update doesn't.
          // We detect which call it is by order: first update = wallet, second = draw.
          const rows = (responses.updateReturns && updateIdx++ > 0)
            ? responses.updateReturns
            : [];
          return makeThenable(rows);
        },
      }),
    }),

    insert: () => ({
      values: () => {
        const rows = responses.insertTxRow ? [responses.insertTxRow] : [];
        return makeThenable(rows);
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── addPaidEntry — user status checks ───────────────────────────────────────

describe("addPaidEntry — user status checks", () => {
  it("throws when the user does not exist", async () => {
    mockedDb.select.mockReturnValue(sel([]));
    await expect(addPaidEntry(99, 1)).rejects.toThrow("User not found");
  });

  it("throws when the user is self-excluded", async () => {
    mockedDb.select.mockReturnValue(sel([{ status: "self_excluded" }]));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("self-excluded");
  });

  it("throws when the user is suspended", async () => {
    mockedDb.select.mockReturnValue(sel([{ status: "suspended" }]));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("not active");
  });

  it("throws when the user is banned", async () => {
    mockedDb.select.mockReturnValue(sel([{ status: "banned" }]));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("not active");
  });
});

// ─── addPaidEntry — draw status checks ───────────────────────────────────────

describe("addPaidEntry — draw status checks", () => {
  function withUser() {
    return sel([{ status: "active" }]);
  }

  it("throws when the draw does not exist", async () => {
    mockedDb.select
      .mockReturnValueOnce(withUser())
      .mockReturnValue(sel([]));
    await expect(addPaidEntry(1, 999)).rejects.toThrow("not open");
  });

  it("throws when the draw is already closed", async () => {
    mockedDb.select
      .mockReturnValueOnce(withUser())
      .mockReturnValue(sel([{ id: 1, status: "closed", countryId: 1 }]));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("not open");
  });

  it("throws when the draw is cancelled", async () => {
    mockedDb.select
      .mockReturnValueOnce(withUser())
      .mockReturnValue(sel([{ id: 1, status: "cancelled", countryId: 1 }]));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("not open");
  });
});

// ─── addPaidEntry — country check ────────────────────────────────────────────

describe("addPaidEntry — country check", () => {
  it("throws when the country record is missing", async () => {
    mockedDb.select
      .mockReturnValueOnce(sel([{ status: "active" }]))
      .mockReturnValueOnce(sel([{ id: 1, status: "open", countryId: 77 }]))
      .mockReturnValue(sel([]));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("Country not found");
  });
});

// ─── addPaidEntry — responsible gaming limits ─────────────────────────────────

const COUNTRY = { id: 1, entryAmountDaily: "50.00", currency: "UAH", currencySymbol: "₴", prizePercentage: "50" };
const DRAW = { id: 1, status: "open", countryId: 1, totalEntries: 0 };

// Set up the three outer selects that all RG tests share (user → draw → country)
function setupPreflight() {
  mockedDb.select
    .mockReturnValueOnce(sel([{ status: "active" }]))
    .mockReturnValueOnce(sel([DRAW]))
    .mockReturnValueOnce(sel([COUNTRY]));
}

// Set up a happy-path transaction (open draw re-check, no duplicate, funded wallet)
function setupHappyTx() {
  mockedDb.transaction.mockImplementation(async (fn: any) => {
    return fn(makeTx({
      selects: [
        [{ status: "open" }],       // draw re-check FOR UPDATE
        [],                          // no duplicate entry
        [{ id: 1, balance: "200.00" }], // wallet FOR UPDATE
      ],
      updateReturns: [{ totalEntries: 1 }],
      insertTxRow: { id: 42 },
    }));
  });
}

describe("addPaidEntry — responsible gaming limits", () => {
  it("passes when no responsible gaming record exists", async () => {
    setupPreflight();
    mockedDb.select.mockReturnValueOnce(sel([])); // no rg record
    setupHappyTx();
    const result = await addPaidEntry(1, 1);
    expect(result.entryAmount).toBe(50);
    expect(result.newBalance).toBe(150);
  });

  it("throws when daily limit would be exceeded", async () => {
    setupPreflight();
    mockedDb.select
      .mockReturnValueOnce(sel([{ dailyLimitAmount: "60.00", weeklyLimitAmount: null, monthlyLimitAmount: null }]))
      .mockReturnValueOnce(sel([{ daily: 30, weekly: 30, monthly: 30 }]));
    // 30 + 50 = 80 > 60
    await expect(addPaidEntry(1, 1)).rejects.toThrow("Daily spending limit");
  });

  it("throws when weekly limit would be exceeded", async () => {
    setupPreflight();
    mockedDb.select
      .mockReturnValueOnce(sel([{ dailyLimitAmount: null, weeklyLimitAmount: "70.00", monthlyLimitAmount: null }]))
      .mockReturnValueOnce(sel([{ daily: 0, weekly: 30, monthly: 30 }]));
    // 30 + 50 = 80 > 70
    await expect(addPaidEntry(1, 1)).rejects.toThrow("Weekly spending limit");
  });

  it("throws when monthly limit would be exceeded", async () => {
    setupPreflight();
    mockedDb.select
      .mockReturnValueOnce(sel([{ dailyLimitAmount: null, weeklyLimitAmount: null, monthlyLimitAmount: "75.00" }]))
      .mockReturnValueOnce(sel([{ daily: 0, weekly: 0, monthly: 30 }]));
    // 30 + 50 = 80 > 75
    await expect(addPaidEntry(1, 1)).rejects.toThrow("Monthly spending limit");
  });

  it("allows entry when spending exactly equals the limit (not exceeded)", async () => {
    setupPreflight();
    // daily spent 30 + entry 50 = 80, limit = 80 → 80 > 80 is false → passes
    mockedDb.select
      .mockReturnValueOnce(sel([{ dailyLimitAmount: "80.00", weeklyLimitAmount: null, monthlyLimitAmount: null }]))
      .mockReturnValueOnce(sel([{ daily: 30, weekly: 30, monthly: 30 }]));
    setupHappyTx();
    const result = await addPaidEntry(1, 1);
    expect(result.ticketNumber).toBe(1);
  });
});

// ─── addPaidEntry — in-transaction checks ────────────────────────────────────

describe("addPaidEntry — in-transaction checks", () => {
  function setupPreflightOk() {
    mockedDb.select
      .mockReturnValueOnce(sel([{ status: "active" }]))
      .mockReturnValueOnce(sel([DRAW]))
      .mockReturnValueOnce(sel([COUNTRY]))
      .mockReturnValueOnce(sel([])); // no rg
  }

  it("throws when draw closed between pre-flight and transaction", async () => {
    setupPreflightOk();
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(makeTx({
      selects: [[{ status: "closed" }]], // draw already closed
    })));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("already closed");
  });

  it("throws on duplicate entry", async () => {
    setupPreflightOk();
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(makeTx({
      selects: [
        [{ status: "open" }],   // draw ok
        [{ id: 99 }],           // existing entry found!
      ],
    })));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("Already entered");
  });

  it("throws when wallet not found inside transaction", async () => {
    setupPreflightOk();
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(makeTx({
      selects: [
        [{ status: "open" }],  // draw ok
        [],                     // no duplicate
        [],                     // no wallet!
      ],
    })));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("Wallet not found");
  });

  it("throws when balance is insufficient", async () => {
    setupPreflightOk();
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(makeTx({
      selects: [
        [{ status: "open" }],
        [],
        [{ id: 1, balance: "10.00" }],  // only 10, need 50
      ],
    })));
    await expect(addPaidEntry(1, 1)).rejects.toThrow("Insufficient balance");
  });

  it("deducts entryAmount from balance and returns correct newBalance", async () => {
    setupPreflightOk();
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(makeTx({
      selects: [
        [{ status: "open" }],
        [],
        [{ id: 1, balance: "123.45" }],  // 123.45 - 50 = 73.45
      ],
      updateReturns: [{ totalEntries: 5 }],
      insertTxRow: { id: 7 },
    })));
    const result = await addPaidEntry(1, 1);
    expect(result.newBalance).toBeCloseTo(73.45, 2);
    expect(result.ticketNumber).toBe(5);
    expect(result.entryAmount).toBe(50);
  });
});

// ─── addFreeEntry ─────────────────────────────────────────────────────────────

describe("addFreeEntry — draw validation", () => {
  it("throws when the draw is not open", async () => {
    mockedDb.select.mockReturnValue(sel([{ id: 1, status: "closed" }]));
    await expect(addFreeEntry(1, 1)).rejects.toThrow("not open");
  });

  it("returns alreadyEntered=true when user already has a ticket (fast path)", async () => {
    mockedDb.select
      .mockReturnValueOnce(sel([{ id: 1, status: "open" }]))
      .mockReturnValue(sel([{ ticketNumber: 7 }]));
    const result = await addFreeEntry(1, 1);
    expect(result.alreadyEntered).toBe(true);
    expect(result.ticketNumber).toBe(7);
  });

  it("returns ticket number on first free entry", async () => {
    mockedDb.select
      .mockReturnValueOnce(sel([{ id: 1, status: "open" }]))
      .mockReturnValueOnce(sel([]));  // no existing entry
    mockedDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        update: () => ({
          set: () => ({
            where: () => makeThenable([{ totalEntries: 3 }]),
          }),
        }),
        insert: () => ({
          values: () => makeThenable([]),
        }),
      };
      return fn(tx);
    });
    const result = await addFreeEntry(1, 1);
    expect(result.ticketNumber).toBe(3);
    expect((result as any).alreadyEntered).toBeUndefined();
  });

  it("handles PostgreSQL 23505 unique violation (concurrent duplicate) gracefully", async () => {
    mockedDb.select
      .mockReturnValueOnce(sel([{ id: 1, status: "open" }]))
      .mockReturnValueOnce(sel([]));  // fast-path: no existing entry yet
    mockedDb.transaction.mockImplementation(async () => {
      const err: any = new Error("unique violation");
      err.code = "23505";
      throw err;
    });
    // Recovery select after 23505
    mockedDb.select.mockReturnValueOnce(sel([{ ticketNumber: 5 }]));
    const result = await addFreeEntry(1, 1);
    expect(result.ticketNumber).toBe(5);
    expect(result.alreadyEntered).toBe(true);
  });

  it("re-throws errors that are NOT a 23505 unique violation", async () => {
    mockedDb.select
      .mockReturnValueOnce(sel([{ id: 1, status: "open" }]))
      .mockReturnValueOnce(sel([]));
    mockedDb.transaction.mockImplementation(async () => {
      throw new Error("connection lost");
    });
    await expect(addFreeEntry(1, 1)).rejects.toThrow("connection lost");
  });
});
