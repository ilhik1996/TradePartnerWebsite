import { describe, it, expect, vi } from "vitest";
import { LEVEL_THRESHOLDS, LEVEL_TITLES, XP, computeLevel, hasConsecutiveDays, awardXp, checkAndAwardBadges } from "../modules/gamification";

describe("LEVEL_THRESHOLDS", () => {
  it("has 10 levels", () => {
    expect(LEVEL_THRESHOLDS).toHaveLength(10);
  });

  it("starts at 0 XP for level 1", () => {
    expect(LEVEL_THRESHOLDS[0]).toBe(0);
  });

  it("thresholds are strictly increasing", () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      expect(LEVEL_THRESHOLDS[i]).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1]);
    }
  });
});

describe("LEVEL_TITLES", () => {
  it("has a title for each level", () => {
    expect(LEVEL_TITLES).toHaveLength(LEVEL_THRESHOLDS.length);
  });

  it("all titles are non-empty strings", () => {
    for (const t of LEVEL_TITLES) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });
});

describe("XP constants", () => {
  it("entry XP is positive", () => expect(XP.entry).toBeGreaterThan(0));
  it("win XP > entry XP (winning is rewarded more)", () => expect(XP.win).toBeGreaterThan(XP.entry));
  it("referral XP is positive", () => expect(XP.referral).toBeGreaterThan(0));
});

describe("KYC age validation logic", () => {
  function isOldEnough(dateOfBirth: string): boolean {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return false;
    const ageMsec = Date.now() - dob.getTime();
    const ageYears = ageMsec / (1000 * 60 * 60 * 24 * 365.25);
    return ageYears >= 18;
  }

  it("rejects someone born 10 years ago", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 10);
    expect(isOldEnough(dob.toISOString().split("T")[0])).toBe(false);
  });

  it("rejects someone born exactly 17 years ago", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 17);
    expect(isOldEnough(dob.toISOString().split("T")[0])).toBe(false);
  });

  it("accepts someone born 18 years ago", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 18);
    dob.setDate(dob.getDate() - 1); // one day past birthday
    expect(isOldEnough(dob.toISOString().split("T")[0])).toBe(true);
  });

  it("accepts someone born 25 years ago", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 25);
    expect(isOldEnough(dob.toISOString().split("T")[0])).toBe(true);
  });

  it("rejects invalid date string", () => {
    expect(isOldEnough("not-a-date")).toBe(false);
    expect(isOldEnough("")).toBe(false);
  });
});

// ─── computeLevel ─────────────────────────────────────────────────────────────

describe("computeLevel", () => {
  it("returns level 1 at 0 XP", () => {
    const { level, title } = computeLevel(0);
    expect(level).toBe(1);
    expect(title).toBe("Newcomer");
  });

  it("stays at level 1 just below the level-2 threshold", () => {
    const { level } = computeLevel(LEVEL_THRESHOLDS[1] - 1);
    expect(level).toBe(1);
  });

  it("advances to level 2 at exactly the threshold", () => {
    const { level, title } = computeLevel(LEVEL_THRESHOLDS[1]);
    expect(level).toBe(2);
    expect(title).toBe("Contender");
  });

  it("advances through every level at exact thresholds", () => {
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      const { level } = computeLevel(LEVEL_THRESHOLDS[i]);
      expect(level).toBe(i + 1);
    }
  });

  it("caps at max level for very large XP", () => {
    const { level, nextLevelXp } = computeLevel(999_999);
    expect(level).toBe(LEVEL_THRESHOLDS.length);
    expect(nextLevelXp).toBeNull();
  });

  it("returns nextLevelXp = null at max level", () => {
    const { nextLevelXp } = computeLevel(LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]);
    expect(nextLevelXp).toBeNull();
  });

  it("nextLevelXp matches the next threshold for non-max levels", () => {
    const { nextLevelXp } = computeLevel(0);
    expect(nextLevelXp).toBe(LEVEL_THRESHOLDS[1]);
  });

  it("currentLevelXp matches the current level threshold", () => {
    const xp = LEVEL_THRESHOLDS[2] + 10; // somewhere in level 3
    const { currentLevelXp } = computeLevel(xp);
    expect(currentLevelXp).toBe(LEVEL_THRESHOLDS[2]);
  });

  it("title matches LEVEL_TITLES for all levels", () => {
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      const { title } = computeLevel(LEVEL_THRESHOLDS[i]);
      expect(title).toBe(LEVEL_TITLES[i]);
    }
  });
});

// ─── hasConsecutiveDays ───────────────────────────────────────────────────────

describe("hasConsecutiveDays", () => {
  it("returns false for empty array", () => {
    expect(hasConsecutiveDays([], 1)).toBe(false);
  });

  it("returns true for single day with n=1", () => {
    expect(hasConsecutiveDays(["2025-01-01"], 1)).toBe(true);
  });

  it("returns false for single day with n=2", () => {
    expect(hasConsecutiveDays(["2025-01-01"], 2)).toBe(false);
  });

  it("returns true for 7 consecutive days", () => {
    const days = ["2025-01-01","2025-01-02","2025-01-03","2025-01-04","2025-01-05","2025-01-06","2025-01-07"];
    expect(hasConsecutiveDays(days, 7)).toBe(true);
  });

  it("returns false when a gap breaks the streak", () => {
    const days = ["2025-01-01","2025-01-02","2025-01-03","2025-01-05","2025-01-06","2025-01-07","2025-01-08"];
    expect(hasConsecutiveDays(days, 7)).toBe(false);
  });

  it("finds streak at the end of the array", () => {
    const days = ["2025-01-01","2025-01-10","2025-01-11","2025-01-12"];
    expect(hasConsecutiveDays(days, 3)).toBe(true);
  });

  it("deduplicates repeated dates before checking", () => {
    const days = ["2025-01-01","2025-01-01","2025-01-02","2025-01-03"];
    expect(hasConsecutiveDays(days, 3)).toBe(true);
  });

  it("returns false when array length is shorter than n (fast path)", () => {
    expect(hasConsecutiveDays(["2025-01-01","2025-01-02"], 3)).toBe(false);
  });

  it("returns true for exactly n consecutive days", () => {
    const days = ["2025-03-01","2025-03-02","2025-03-03"];
    expect(hasConsecutiveDays(days, 3)).toBe(true);
  });

  it("handles month boundary correctly", () => {
    const days = ["2025-01-30","2025-01-31","2025-02-01","2025-02-02"];
    expect(hasConsecutiveDays(days, 4)).toBe(true);
  });

  it("handles year boundary correctly", () => {
    const days = ["2024-12-30","2024-12-31","2025-01-01","2025-01-02"];
    expect(hasConsecutiveDays(days, 4)).toBe(true);
  });
});

// ─── awardXp ──────────────────────────────────────────────────────────────────
// gamification.ts receives `db` as a parameter, so we pass a plain mock object

function makeFakeDb(selectResults: any[][], insertOk = true) {
  let selectIdx = 0;
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => (insertOk ? Promise.resolve([]) : Promise.reject(new Error("DB error")))),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => Promise.resolve(selectResults[selectIdx++] ?? []),
      }),
    })),
  };
}

describe("awardXp", () => {
  it("returns the accumulated XP total after inserting the event", async () => {
    const db = makeFakeDb([[{ total: 60 }]]);
    const total = await awardXp(1, "entry", db);
    expect(total).toBe(60);
  });

  it("inserts an event with the correct XP value for each reason", async () => {
    for (const [reason, xp] of Object.entries(XP) as [keyof typeof XP, number][]) {
      const db = makeFakeDb([[{ total: xp }]]);
      await awardXp(1, reason, db);
      const valuesArg = (db.insert as any).mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.xp).toBe(xp);
      expect(valuesArg.reason).toBe(reason);
    }
  });

  it("returns 0 when the user has no prior XP events (empty aggregate)", async () => {
    const db = makeFakeDb([[{ total: 0 }]]);
    expect(await awardXp(42, "entry", db)).toBe(0);
  });

  it("handles null/undefined aggregate total gracefully (returns 0)", async () => {
    const db = makeFakeDb([[{ total: null }]]);
    expect(await awardXp(1, "entry", db)).toBe(0);
  });
});

// ─── checkAndAwardBadges ──────────────────────────────────────────────────────

function makeBadgeDb(
  existingBadges: string[],
  counts: { entries?: number; wins?: number; referrals?: number; days?: string[] }
) {
  const results: any[][] = [
    existingBadges.map(id => ({ badgeId: id })),                             // existing badges
    [{ count: counts.entries ?? 0 }],                                        // drawEntries count
    [{ count: counts.wins ?? 0 }],                                           // draws won count
    [{ count: counts.referrals ?? 0 }],                                      // referrals count
    (counts.days ?? []).map(d => ({ day: d })),                              // streak days
  ];

  let selectIdx = 0;
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => Promise.resolve([])),
      })),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => {
          const rows = results[selectIdx++] ?? [];
          // handle groupBy chaining for streak_7 query
          return { groupBy: () => Promise.resolve(rows), ...{ then: Promise.resolve(rows).then.bind(Promise.resolve(rows)) } };
        },
      }),
    })),
  };
}

describe("checkAndAwardBadges", () => {
  it("awards first_entry when the user has ≥ 1 draw entry and no badge yet", async () => {
    const db = makeBadgeDb([], { entries: 1 });
    const awarded = await checkAndAwardBadges(1, db);
    expect(awarded).toContain("first_entry");
  });

  it("does NOT re-award first_entry when the badge already exists", async () => {
    const db = makeBadgeDb(["first_entry"], { entries: 5 });
    const awarded = await checkAndAwardBadges(1, db);
    expect(awarded).not.toContain("first_entry");
  });

  it("awards first_win when the user has won ≥ 1 draw", async () => {
    const db = makeBadgeDb([], { wins: 1 });
    const awarded = await checkAndAwardBadges(1, db);
    expect(awarded).toContain("first_win");
  });

  it("does NOT award first_win when wins = 0", async () => {
    const db = makeBadgeDb([], { entries: 0, wins: 0, referrals: 0 });
    const awarded = await checkAndAwardBadges(1, db);
    expect(awarded).not.toContain("first_win");
  });

  it("awards referrer badge when the user has ≥ 1 referral", async () => {
    const db = makeBadgeDb([], { referrals: 1 });
    const awarded = await checkAndAwardBadges(1, db);
    expect(awarded).toContain("referrer");
  });

  it("awards streak_7 when 7 consecutive active days exist", async () => {
    const days = ["2025-01-01","2025-01-02","2025-01-03","2025-01-04","2025-01-05","2025-01-06","2025-01-07"];
    const db = makeBadgeDb([], { days });
    const awarded = await checkAndAwardBadges(1, db);
    expect(awarded).toContain("streak_7");
  });

  it("does NOT award streak_7 when days have a gap", async () => {
    const days = ["2025-01-01","2025-01-02","2025-01-04","2025-01-05","2025-01-06","2025-01-07","2025-01-08"];
    const db = makeBadgeDb([], { days });
    const awarded = await checkAndAwardBadges(1, db);
    expect(awarded).not.toContain("streak_7");
  });

  it("calls db.insert when badges need to be awarded", async () => {
    const db = makeBadgeDb([], { entries: 1 });
    await checkAndAwardBadges(1, db);
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("does NOT call db.insert when all conditions are unmet", async () => {
    const db = makeBadgeDb([], { entries: 0, wins: 0, referrals: 0, days: [] });
    await checkAndAwardBadges(1, db);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns an empty array when all conditions are unmet", async () => {
    const db = makeBadgeDb([], { entries: 0, wins: 0, referrals: 0, days: [] });
    const awarded = await checkAndAwardBadges(1, db);
    expect(awarded).toHaveLength(0);
  });
});
