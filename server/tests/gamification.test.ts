import { describe, it, expect } from "vitest";
import { LEVEL_THRESHOLDS, LEVEL_TITLES, XP } from "../modules/gamification";

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
