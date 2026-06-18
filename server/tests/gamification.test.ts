import { describe, it, expect } from "vitest";
import { LEVEL_THRESHOLDS, LEVEL_TITLES, XP, computeLevel, hasConsecutiveDays } from "../modules/gamification";

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
