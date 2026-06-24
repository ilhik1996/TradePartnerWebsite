import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks (registered before any imports) ────────────────────────────────────

vi.mock("../db", () => ({
  db: { select: vi.fn() },
}));

vi.mock("../modules/lottery", () => ({
  getOrCreateDraw: vi.fn(),
  todayDateString: vi.fn(() => "2026-06-21"),
  addPaidEntry: vi.fn(),
  conductDraw: vi.fn(),
}));

vi.mock("../modules/subscriptions", () => ({
  renewDueSubscriptions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../modules/gamification", () => ({
  awardXp: vi.fn().mockResolvedValue(undefined),
  checkAndAwardBadges: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../modules/email", () => ({
  sendDrawResultEmail: vi.fn().mockResolvedValue(undefined),
  sendLowBalanceEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../modules/notifications", () => ({
  insertNotification: vi.fn().mockResolvedValue(undefined),
}));

import { checkAndConductDraws, autoEnterUsers, startScheduler } from "../modules/scheduler";
import { db } from "../db";
import { conductDraw, addPaidEntry, getOrCreateDraw } from "../modules/lottery";
import { insertNotification } from "../modules/notifications";
import { awardXp } from "../modules/gamification";

const mockedDb = db as any;
const mockedConductDraw   = conductDraw   as ReturnType<typeof vi.fn>;
const mockedAddPaidEntry  = addPaidEntry  as ReturnType<typeof vi.fn>;
const mockedGetOrCreateDraw = getOrCreateDraw as ReturnType<typeof vi.fn>;
const mockedInsertNotification = insertNotification as ReturnType<typeof vi.fn>;
const mockedAwardXp = awardXp as ReturnType<typeof vi.fn>;

// Build a chainable select that handles where / leftJoin / innerJoin chains
function makeSelectChain(rows: any[]) {
  const terminal = () => Promise.resolve(rows);
  const lvl3: any = { where: terminal };
  const lvl2: any = { where: terminal, leftJoin: () => lvl3, innerJoin: () => lvl2 };
  return { from: () => lvl2 };
}

const BASE_COUNTRY = {
  id: 1, name: "Ukraine", isActive: true, currency: "UAH",
  currencySymbol: "₴", entryAmountDaily: "5.00", drawHourUtc: 21,
};

const BASE_OPEN_DRAW = {
  id: 100, status: "open", drawDate: "2026-06-21", totalEntries: 5,
  countryId: 1, totalPool: "100.00",
};

const BASE_USER = { id: 10, autoParticipate: true, status: "active" };
const BASE_WALLET_RICH = { id: 5, userId: 10, balance: "100.00" };
const BASE_WALLET_POOR = { id: 5, userId: 10, balance: "2.00" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── startScheduler — idempotency ──────────────────────────────────────────────

describe("startScheduler — idempotency", () => {
  it("registers intervals only on the first call; second call is a no-op", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(global, "setInterval");
    mockedDb.select.mockReturnValue(makeSelectChain([])); // no countries

    startScheduler(() => {});
    startScheduler(() => {}); // second call — _started is already true

    // 4 setInterval calls come from the first invocation only
    // (draws, auto-enter, subscription renewal, session cleanup)
    expect(spy).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});

// ── checkAndConductDraws ──────────────────────────────────────────────────────

describe("checkAndConductDraws — skips when no active countries", () => {
  it("does not call conductDraw when country list is empty", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([]));
    await checkAndConductDraws(() => {});
    expect(mockedConductDraw).not.toHaveBeenCalled();
  });
});

describe("checkAndConductDraws — hour gate", () => {
  it("skips country when current UTC hour is before the draw hour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T14:00:00Z")); // 14:00 UTC

    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([{ ...BASE_COUNTRY, drawHourUtc: 21 }]))
      .mockReturnValue(makeSelectChain([]));

    await checkAndConductDraws(() => {});
    expect(mockedConductDraw).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("checkAndConductDraws — skips when no open draw", () => {
  it("does not call conductDraw when draws query returns empty", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T22:00:00Z")); // 22:00 > drawHourUtc=21

    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([BASE_COUNTRY])) // countries
      .mockReturnValue(makeSelectChain([]));                 // no open draw

    await checkAndConductDraws(() => {});
    expect(mockedConductDraw).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("checkAndConductDraws — conducts draw", () => {
  it("calls conductDraw and broadcasts result when draw hour has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T22:00:00Z"));

    mockedConductDraw.mockResolvedValue({
      drawId: 100, winnerUserId: 42, winnerTicket: 3, prizeAmount: 500,
    });
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([BASE_COUNTRY]))     // countries
      .mockReturnValueOnce(makeSelectChain([BASE_OPEN_DRAW]))   // open draw
      .mockReturnValue(makeSelectChain([]));                     // winner/loser queries

    const broadcast = vi.fn();
    await checkAndConductDraws(broadcast);

    expect(mockedConductDraw).toHaveBeenCalledWith(100);
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: "draw_completed",
      drawId: 100,
      countryId: 1,
    }));
    vi.useRealTimers();
  });

  it("swallows errors from conductDraw without rethrowing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T22:00:00Z"));

    mockedConductDraw.mockRejectedValue(new Error("DB locked"));
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([BASE_COUNTRY]))
      .mockReturnValueOnce(makeSelectChain([BASE_OPEN_DRAW]))
      .mockReturnValue(makeSelectChain([]));

    await expect(checkAndConductDraws(() => {})).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

// ── autoEnterUsers ────────────────────────────────────────────────────────────

describe("autoEnterUsers — no active countries", () => {
  it("does not call addPaidEntry when country list is empty", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([]));
    mockedGetOrCreateDraw.mockResolvedValue({ id: 1, status: "open" });
    await autoEnterUsers();
    expect(mockedAddPaidEntry).not.toHaveBeenCalled();
  });
});

describe("autoEnterUsers — draw not open", () => {
  it("skips entry when today's draw is already completed", async () => {
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([BASE_COUNTRY]))
      .mockReturnValue(makeSelectChain([]));
    mockedGetOrCreateDraw.mockResolvedValue({ id: 100, status: "completed" });

    await autoEnterUsers();
    expect(mockedAddPaidEntry).not.toHaveBeenCalled();
  });
});

describe("autoEnterUsers — user already entered", () => {
  it("does not call addPaidEntry when user has an existing entry", async () => {
    mockedGetOrCreateDraw.mockResolvedValue({ id: 100, status: "open" });
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([BASE_COUNTRY]))      // countries
      .mockReturnValueOnce(makeSelectChain([BASE_USER]))          // users
      .mockReturnValueOnce(makeSelectChain([{ id: 999 }]));       // existing drawEntry

    await autoEnterUsers();
    expect(mockedAddPaidEntry).not.toHaveBeenCalled();
  });
});

describe("autoEnterUsers — insufficient balance", () => {
  it("sends balance_low notification and skips addPaidEntry when balance < entry fee", async () => {
    mockedGetOrCreateDraw.mockResolvedValue({ id: 100, status: "open" });
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([BASE_COUNTRY]))
      .mockReturnValueOnce(makeSelectChain([BASE_USER]))
      .mockReturnValueOnce(makeSelectChain([]))                   // no existing entry
      .mockReturnValue(makeSelectChain([BASE_WALLET_POOR]));      // wallet (2.00 < 5.00)

    await autoEnterUsers();

    expect(mockedInsertNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 10,
      type: "balance_low",
    }));
    expect(mockedAddPaidEntry).not.toHaveBeenCalled();
  });
});

describe("autoEnterUsers — sufficient balance", () => {
  it("calls addPaidEntry and awards XP when user balance meets the entry fee", async () => {
    mockedGetOrCreateDraw.mockResolvedValue({ id: 100, status: "open" });
    mockedAddPaidEntry.mockResolvedValue(undefined);
    mockedDb.select
      .mockReturnValueOnce(makeSelectChain([BASE_COUNTRY]))
      .mockReturnValueOnce(makeSelectChain([BASE_USER]))
      .mockReturnValueOnce(makeSelectChain([]))                   // no existing entry
      .mockReturnValueOnce(makeSelectChain([BASE_WALLET_RICH]));  // wallet (100.00 >= 5.00)

    await autoEnterUsers();

    expect(mockedAddPaidEntry).toHaveBeenCalledWith(10, 100);
    // XP is awarded non-blocking — flush microtasks
    await Promise.resolve();
    expect(mockedAwardXp).toHaveBeenCalledWith(10, "entry", expect.anything());
  });
});
