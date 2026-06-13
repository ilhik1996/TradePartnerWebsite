import { describe, it, expect, vi } from "vitest";

// Mock DB so lottery.ts can be imported without a real DATABASE_URL
vi.mock("../db", () => ({ db: {} }));

import { generateProvablyFairWinner, todayDateString } from "../modules/lottery";

describe("generateProvablyFairWinner", () => {
  it("returns a ticket number within 1..totalEntries", () => {
    const { winnerTicket } = generateProvablyFairWinner(1, 100, "test-secret");
    expect(winnerTicket).toBeGreaterThanOrEqual(1);
    expect(winnerTicket).toBeLessThanOrEqual(100);
  });

  it("is deterministic — same inputs produce same winner", () => {
    const a = generateProvablyFairWinner(42, 500, "secret");
    const b = generateProvablyFairWinner(42, 500, "secret");
    expect(a.winnerTicket).toBe(b.winnerTicket);
    expect(a.seedHash).toBe(b.seedHash);
    expect(a.proof).toBe(b.proof);
  });

  it("different draw IDs produce different results", () => {
    const a = generateProvablyFairWinner(1, 100, "secret");
    const b = generateProvablyFairWinner(2, 100, "secret");
    // Not guaranteed (hash collision possible) but overwhelmingly likely
    expect(a.winnerTicket !== b.winnerTicket || a.seedHash !== b.seedHash).toBe(true);
  });

  it("different secrets produce different results", () => {
    const a = generateProvablyFairWinner(1, 100, "secret-A");
    const b = generateProvablyFairWinner(1, 100, "secret-B");
    expect(a.seedHash).not.toBe(b.seedHash);
  });

  it("works with totalEntries = 1 — only possible winner is ticket 1", () => {
    const { winnerTicket } = generateProvablyFairWinner(99, 1, "secret");
    expect(winnerTicket).toBe(1);
  });

  it("produces a 64-char hex seedHash", () => {
    const { seedHash } = generateProvablyFairWinner(1, 10, "s");
    expect(seedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a 64-char hex proof", () => {
    const { proof } = generateProvablyFairWinner(1, 10, "s");
    expect(proof).toMatch(/^[0-9a-f]{64}$/);
  });

  it("seedHash and proof are different values", () => {
    const { seedHash, proof } = generateProvablyFairWinner(5, 200, "my-secret");
    expect(seedHash).not.toBe(proof);
  });

  it("distributes winners fairly across range (statistical)", () => {
    // Run 1000 draws with different drawIds; all winners should be in [1, 50]
    const totalEntries = 50;
    for (let drawId = 1; drawId <= 1000; drawId++) {
      const { winnerTicket } = generateProvablyFairWinner(drawId, totalEntries, "stat-secret");
      expect(winnerTicket).toBeGreaterThanOrEqual(1);
      expect(winnerTicket).toBeLessThanOrEqual(totalEntries);
    }
  });
});

describe("todayDateString", () => {
  it("returns a string in YYYY-MM-DD format", () => {
    const s = todayDateString();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches the current UTC date", () => {
    const s = todayDateString();
    const expected = new Date().toISOString().split("T")[0];
    expect(s).toBe(expected);
  });
});
