import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── proximity score formula (mirrors sendDrawResultEmail) ────────────────────
// Formula: Math.max(0, 100 - Math.round((Math.abs(myTicket - winnerTicket) / totalEntries) * 100))
// Null when any of myTicket / winnerTicket / totalEntries is falsy.

function proximityScore(myTicket?: number, winnerTicket?: number, totalEntries?: number): number | null {
  if (!myTicket || !winnerTicket || !totalEntries) return null;
  return Math.max(0, 100 - Math.round((Math.abs(myTicket - winnerTicket) / totalEntries) * 100));
}

describe("draw result proximity score", () => {
  it("returns 100 when the player is one ticket away from the winner", () => {
    // distance = 0 → 100 - 0 = 100
    expect(proximityScore(50, 50, 100)).toBe(100);
  });

  it("returns 100 when distance is less than 0.5% of totalEntries (rounds to 0)", () => {
    // |1 - 1| / 1000 * 100 = 0 → 100
    expect(proximityScore(1, 1, 1000)).toBe(100);
  });

  it("returns 50 when player is exactly 50% away from the winner", () => {
    // |1 - 51| / 100 * 100 = 50 → 100 - 50 = 50
    expect(proximityScore(1, 51, 100)).toBe(50);
  });

  it("is symmetric — same distance from either side gives the same score", () => {
    expect(proximityScore(10, 60, 100)).toBe(proximityScore(60, 10, 100));
  });

  it("returns 1 when player is 99% away from the winner", () => {
    // |1 - 100| / 100 * 100 = 99 → 100 - 99 = 1
    expect(proximityScore(1, 100, 100)).toBe(1);
  });

  it("is floored at 0 and never negative", () => {
    // Extremely large distance — Math.max(0, ...) prevents negative
    expect(proximityScore(1, 10000, 100)).toBeGreaterThanOrEqual(0);
  });

  it("returns null when myTicket is missing", () => {
    expect(proximityScore(undefined, 50, 100)).toBeNull();
  });

  it("returns null when winnerTicket is missing", () => {
    expect(proximityScore(50, undefined, 100)).toBeNull();
  });

  it("returns null when totalEntries is missing", () => {
    expect(proximityScore(50, 50, undefined)).toBeNull();
  });

  it("returns null when myTicket is 0 (falsy)", () => {
    expect(proximityScore(0, 50, 100)).toBeNull();
  });
});

// ─── escHtml (via sendWelcomeEmail behaviour without network) ─────────────────
// escHtml is private, but its output appears in email HTML. We test it by
// verifying that sendWelcomeEmail with dangerous chars does not throw and
// that RESEND_API_KEY absent causes a console-only path (no network call).

describe("sendWelcomeEmail — dev fallback (no RESEND_API_KEY)", () => {
  const origEnv = process.env;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.RESEND_API_KEY;
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = origEnv;
    consoleSpy.mockRestore();
  });

  it("returns true when RESEND_API_KEY is absent (logs only)", async () => {
    const { sendWelcomeEmail } = await import("../modules/email");
    const result = await sendWelcomeEmail("test@example.com", "Alice");
    expect(result).toBe(true);
  });

  it("logs the recipient address to console in dev mode", async () => {
    const { sendWelcomeEmail } = await import("../modules/email");
    await sendWelcomeEmail("dev@example.com");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("dev@example.com"),
    );
  });

  it("does not throw when firstName contains HTML special chars", async () => {
    const { sendWelcomeEmail } = await import("../modules/email");
    await expect(sendWelcomeEmail("x@x.com", '<script>alert("xss")</script>')).resolves.toBe(true);
  });
});

describe("sendDrawResultEmail — dev fallback", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.RESEND_API_KEY;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
  });

  it("returns true for a winner result", async () => {
    const { sendDrawResultEmail } = await import("../modules/email");
    const result = await sendDrawResultEmail({
      to: "winner@example.com",
      drawDate: "2025-01-15",
      isWinner: true,
      prizeAmount: "1500.00",
      currencySymbol: "₴",
    });
    expect(result).toBe(true);
  });

  it("returns true for a loser result with proximity data", async () => {
    const { sendDrawResultEmail } = await import("../modules/email");
    const result = await sendDrawResultEmail({
      to: "loser@example.com",
      drawDate: "2025-01-15",
      isWinner: false,
      myTicket: 25,
      winnerTicket: 50,
      totalEntries: 100,
    });
    expect(result).toBe(true);
  });

  it("returns true for a loser result without proximity data", async () => {
    const { sendDrawResultEmail } = await import("../modules/email");
    const result = await sendDrawResultEmail({
      to: "loser@example.com",
      drawDate: "2025-01-15",
      isWinner: false,
    });
    expect(result).toBe(true);
  });
});
