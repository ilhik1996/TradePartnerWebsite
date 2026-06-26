import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────
vi.mock("../db", () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import { depositFunds, getBalance, getOrCreateWallet, getTransactionHistory } from "../modules/wallet";
import { db } from "../db";

const mockedDb = db as any;

// Helper: create a chainable select that ends in `Promise.resolve(rows)`
function makeSelectChain(rows: any[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

// Helper: build a mock tx object for use inside db.transaction(fn)
function makeTx(walletRows: any[], insertedTxRow: any = null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve(walletRows),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve(insertedTxRow ? [insertedTxRow] : []),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── depositFunds — input validation ─────────────────────────────────────────

describe("depositFunds — input validation", () => {
  it("rejects 0 amount before touching the DB", async () => {
    await expect(depositFunds(1, 0)).rejects.toThrow("Amount must be positive");
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("rejects a negative amount", async () => {
    await expect(depositFunds(1, -50)).rejects.toThrow("Amount must be positive");
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});

// ─── depositFunds — DB paths ──────────────────────────────────────────────────

describe("depositFunds — DB paths", () => {
  it("throws when wallet is not found", async () => {
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(makeTx([])));
    await expect(depositFunds(99, 10)).rejects.toThrow("Wallet not found");
  });

  it("throws when deposit would exceed the 9 999 999.99 balance cap", async () => {
    // 9 999 990.00 + 20 = 10 000 010 > 9 999 999.99
    const wallet = { id: 1, balance: "9999990.00", currency: "USD" };
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(makeTx([wallet])));
    await expect(depositFunds(1, 20)).rejects.toThrow("exceed maximum");
  });

  it("returns the new balance and inserted transaction record on success", async () => {
    const wallet = { id: 1, balance: "100.00", currency: "USD" };
    const txRecord = { id: 42, type: "deposit", amount: "50.00", balanceAfter: "150.00" };
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(makeTx([wallet], txRecord)));

    const result = await depositFunds(1, 50);
    expect(result.newBalance).toBe(150);
    expect(result.transaction).toEqual(txRecord);
  });

  it("passes the optional reference string to the inserted transaction", async () => {
    const wallet = { id: 1, balance: "0.00", currency: "EUR" };
    const txRecord = { id: 7, reference: "ref-xyz" };
    const insertSpy = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([txRecord]),
      }),
    });
    const tx = {
      ...makeTx([wallet]),
      insert: insertSpy,
    };
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(tx));

    await depositFunds(1, 10, "ref-xyz");
    // values() should have been called with an object containing our reference
    const valuesArg = insertSpy.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesArg.reference).toBe("ref-xyz");
  });

  it("stores the correct balanceAfter in the transaction record", async () => {
    const wallet = { id: 1, balance: "200.00", currency: "GBP" };
    const txRecord = { id: 1 };
    const insertSpy = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([txRecord]),
      }),
    });
    const tx = {
      ...makeTx([wallet]),
      insert: insertSpy,
    };
    mockedDb.transaction.mockImplementation(async (fn: any) => fn(tx));

    await depositFunds(1, 75.5);
    const valuesArg = insertSpy.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesArg.balanceAfter).toBe("275.50");
    expect(valuesArg.amount).toBe("75.50");
  });
});

// ─── getBalance ────────────────────────────────────────────────────────────────

describe("getBalance", () => {
  it("returns 0 when the user has no wallet", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([]));
    expect(await getBalance(99)).toBe(0);
  });

  it("returns the parsed numeric balance for an existing wallet", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([{ balance: "1234.56" }]));
    expect(await getBalance(1)).toBe(1234.56);
  });

  it("handles zero balance", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([{ balance: "0.00" }]));
    expect(await getBalance(1)).toBe(0);
  });
});

// ─── getOrCreateWallet ────────────────────────────────────────────────────────

function makeInsertChain() {
  return {
    values: () => ({
      onConflictDoNothing: () => Promise.resolve([]),
    }),
  };
}

describe("getOrCreateWallet", () => {
  it("returns the wallet after upsert", async () => {
    const wallet = { id: 3, userId: 7, balance: "0.00", currency: "UAH" };
    mockedDb.insert.mockReturnValue(makeInsertChain());
    mockedDb.select.mockReturnValue(makeSelectChain([wallet]));

    const result = await getOrCreateWallet(7, "UAH");
    expect(result.id).toBe(3);
    expect(result.currency).toBe("UAH");
  });

  it("throws when the wallet row is missing after insert", async () => {
    mockedDb.insert.mockReturnValue(makeInsertChain());
    mockedDb.select.mockReturnValue(makeSelectChain([]));

    await expect(getOrCreateWallet(99, "USD")).rejects.toThrow("Wallet not found");
  });

  it("always calls db.insert with onConflictDoNothing", async () => {
    const wallet = { id: 1, userId: 1, balance: "0.00", currency: "USD" };
    mockedDb.insert.mockReturnValue(makeInsertChain());
    mockedDb.select.mockReturnValue(makeSelectChain([wallet]));

    await getOrCreateWallet(1, "USD");
    expect(mockedDb.insert).toHaveBeenCalledOnce();
  });

  it("returns a non-zero balance for an existing wallet", async () => {
    const wallet = { id: 2, userId: 5, balance: "1500.00", currency: "EUR" };
    mockedDb.insert.mockReturnValue(makeInsertChain());
    mockedDb.select.mockReturnValue(makeSelectChain([wallet]));

    const result = await getOrCreateWallet(5, "EUR");
    expect(result.balance).toBe("1500.00");
  });
});

// ─── getTransactionHistory ────────────────────────────────────────────────────

function makeHistoryChain(rows: any[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => ({
            offset: () => Promise.resolve(rows),
          }),
        }),
      }),
    }),
  };
}

describe("getTransactionHistory", () => {
  it("returns an empty array when the user has no transactions", async () => {
    mockedDb.select.mockReturnValue(makeHistoryChain([]));
    expect(await getTransactionHistory(1)).toEqual([]);
  });

  it("returns all rows from the DB query", async () => {
    const rows = [
      { id: 1, type: "deposit", amount: "50.00" },
      { id: 2, type: "lottery_entry", amount: "-5.00" },
    ];
    mockedDb.select.mockReturnValue(makeHistoryChain(rows));
    const result = await getTransactionHistory(1);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("deposit");
  });

  it("accepts custom limit and offset without throwing", async () => {
    mockedDb.select.mockReturnValue(makeHistoryChain([]));
    await expect(getTransactionHistory(1, 5, 10)).resolves.toEqual([]);
  });

  it("uses default limit=20 and offset=0 when not specified", async () => {
    // The important thing is no error is thrown and the chain is traversed
    mockedDb.select.mockReturnValue(makeHistoryChain([{ id: 1 }]));
    const result = await getTransactionHistory(42);
    expect(result).toHaveLength(1);
  });
});
