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

import { conductDraw, getOrCreateDraw } from "../modules/lottery";
import { db } from "../db";

const mockedDb = db as any;

// ─── Mock helpers ─────────────────────────────────────────────────────────────

// Returns a thenable (Promise + .for()) so it works for both:
//   const [row] = await db.select().from().where()
//   const val  = await db.select().from().where().then(r => r[0])
function sel(rows: any[]) {
  const p = Promise.resolve(rows);
  return {
    from: () => ({
      where: () => Object.assign(Promise.resolve(rows), {
        for: () => p,
      }),
    }),
  };
}

// db.update().set().where().returning()  — used for atomic claim
function makeUpdateReturning(rows: any[]) {
  return {
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve(rows),
      }),
    }),
  };
}

// db.update().set().where()  — used for cancel/status updates without returning
function makeUpdateChain() {
  return {
    set: () => ({
      where: () => Promise.resolve([]),
    }),
  };
}

// db.insert().values().onConflictDoNothing()  — used by getOrCreateDraw
function makeInsertOnConflict() {
  return {
    values: () => ({
      onConflictDoNothing: () => Promise.resolve([]),
    }),
  };
}

// Transaction mock for conductDraw's payout step.
// Supports: select().from().where().for(), update().set().where(), insert().values()
function makeConductTx(walletBalance: string) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve([{ id: 1, userId: 42, balance: walletBalance }]),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve([]),
    }),
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLAIMED_DRAW = {
  id: 100,
  status: "closed",
  totalEntries: 5,
  totalPool: "500.00",
  countryId: 1,
  drawDate: "2026-06-21",
};

const COUNTRY = {
  id: 1,
  name: "Ukraine",
  currencySymbol: "₴",
  prizePercentage: "50",
};

// The mock doesn't filter; any ticketNumber value is fine here
const WINNER_ENTRY = {
  id: 10,
  userId: 42,
  drawId: 100,
  ticketNumber: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Safe fallback for fire-and-forget selects (loser notifications)
  mockedDb.select.mockReturnValue(sel([]));
});

// ─── conductDraw — atomic claim ───────────────────────────────────────────────

describe("conductDraw — atomic claim fails", () => {
  it("returns null without touching select or transaction when claim returns 0 rows", async () => {
    mockedDb.update.mockReturnValue(makeUpdateReturning([]));
    expect(await conductDraw(100)).toBeNull();
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});

// ─── conductDraw — zero entries ───────────────────────────────────────────────

describe("conductDraw — zero entries", () => {
  it("cancels the draw and returns null when totalEntries is 0", async () => {
    mockedDb.update
      .mockReturnValueOnce(makeUpdateReturning([{ ...CLAIMED_DRAW, totalEntries: 0 }]))
      .mockReturnValue(makeUpdateChain());

    const result = await conductDraw(100);

    expect(result).toBeNull();
    expect(mockedDb.update).toHaveBeenCalledTimes(2);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});

// ─── conductDraw — country not found ─────────────────────────────────────────

describe("conductDraw — country not found", () => {
  it("throws 'Country not found' when country record is missing", async () => {
    mockedDb.update.mockReturnValue(makeUpdateReturning([CLAIMED_DRAW]));
    mockedDb.select.mockReturnValue(sel([])); // no country, no winner entry

    await expect(conductDraw(100)).rejects.toThrow("Country not found");
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});

// ─── conductDraw — winner entry not found ────────────────────────────────────

describe("conductDraw — winner entry not found", () => {
  it("throws 'Winner entry not found' when the drawn ticket has no DB row", async () => {
    mockedDb.update.mockReturnValue(makeUpdateReturning([CLAIMED_DRAW]));
    mockedDb.select
      .mockReturnValueOnce(sel([COUNTRY])) // country found
      .mockReturnValue(sel([]));            // no winner entry

    await expect(conductDraw(100)).rejects.toThrow("Winner entry not found");
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});

// ─── conductDraw — happy path ─────────────────────────────────────────────────

describe("conductDraw — successful draw", () => {
  function setupHappyPath() {
    mockedDb.update.mockReturnValue(makeUpdateReturning([CLAIMED_DRAW]));
    mockedDb.select
      .mockReturnValueOnce(sel([COUNTRY]))       // country
      .mockReturnValueOnce(sel([WINNER_ENTRY]))  // winner entry
      .mockReturnValue(sel([]));                 // loser notifications fallback
    mockedDb.transaction.mockImplementation(async (fn: any) =>
      fn(makeConductTx("100.00"))
    );
  }

  it("returns non-null result with drawId, winnerUserId, prizeAmount, proof", async () => {
    setupHappyPath();
    const result = await conductDraw(100);
    expect(result).not.toBeNull();
    expect(result!.drawId).toBe(100);
    expect(result!.winnerUserId).toBe(42);
    expect(typeof result!.prizeAmount).toBe("string");
    expect(typeof result!.proof).toBe("string");
  });

  it("prizeAmount = totalPool * (prizePercentage / 100)", async () => {
    setupHappyPath();
    // 500.00 * (50 / 100) = 250.00
    const result = await conductDraw(100);
    expect(result!.prizeAmount).toBe("250.00");
  });

  it("calls db.transaction exactly once for the payout", async () => {
    setupHappyPath();
    await conductDraw(100);
    expect(mockedDb.transaction).toHaveBeenCalledOnce();
  });

  it("proof is a 64-char hex string", async () => {
    setupHappyPath();
    const result = await conductDraw(100);
    expect(result!.proof).toMatch(/^[0-9a-f]{64}$/);
  });

  it("winnerTicket is within 1..totalEntries", async () => {
    setupHappyPath();
    const result = await conductDraw(100);
    expect(result!.winnerTicket).toBeGreaterThanOrEqual(1);
    expect(result!.winnerTicket).toBeLessThanOrEqual(CLAIMED_DRAW.totalEntries);
  });

  it("resolves without rethrowing when transaction inner wallet-not-found error is thrown", async () => {
    mockedDb.update.mockReturnValue(makeUpdateReturning([CLAIMED_DRAW]));
    mockedDb.select
      .mockReturnValueOnce(sel([COUNTRY]))
      .mockReturnValueOnce(sel([WINNER_ENTRY]))
      .mockReturnValue(sel([]));
    // Transaction throws — conductDraw should propagate it
    mockedDb.transaction.mockRejectedValue(new Error("Winner wallet not found"));

    await expect(conductDraw(100)).rejects.toThrow("Winner wallet not found");
  });
});

// ─── getOrCreateDraw ──────────────────────────────────────────────────────────

describe("getOrCreateDraw", () => {
  it("returns the draw row after upsert", async () => {
    const draw = { id: 5, countryId: 1, drawDate: "2026-06-21", status: "open" };
    mockedDb.insert.mockReturnValue(makeInsertOnConflict());
    mockedDb.select.mockReturnValue(sel([draw]));

    const result = await getOrCreateDraw(1, "2026-06-21");

    expect(result.id).toBe(5);
    expect(result.status).toBe("open");
  });

  it("throws 'Draw not found' when row is missing after insert", async () => {
    mockedDb.insert.mockReturnValue(makeInsertOnConflict());
    mockedDb.select.mockReturnValue(sel([]));

    await expect(getOrCreateDraw(1, "2026-06-21")).rejects.toThrow("Draw not found");
  });

  it("always calls db.insert with onConflictDoNothing to handle concurrent creation", async () => {
    const draw = { id: 5, countryId: 1, drawDate: "2026-06-21", status: "open" };
    mockedDb.insert.mockReturnValue(makeInsertOnConflict());
    mockedDb.select.mockReturnValue(sel([draw]));

    await getOrCreateDraw(1, "2026-06-21");

    expect(mockedDb.insert).toHaveBeenCalledOnce();
  });

  it("returns the correct status for a completed draw", async () => {
    const draw = { id: 7, countryId: 2, drawDate: "2026-06-21", status: "completed" };
    mockedDb.insert.mockReturnValue(makeInsertOnConflict());
    mockedDb.select.mockReturnValue(sel([draw]));

    const result = await getOrCreateDraw(2, "2026-06-21");
    expect(result.status).toBe("completed");
  });
});
