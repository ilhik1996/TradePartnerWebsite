import { gamificationEvents, gamificationBadges, drawEntries, draws, referrals } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── XP Constants ─────────────────────────────────────────────────────────────

export const XP = {
  entry: 10,
  win: 50,
  referral: 25,
  weekly_sub: 15,
  monthly_sub: 30,
  deposit: 5,
} as const;

export type XpReason = keyof typeof XP;

// ─── Level Thresholds & Titles ────────────────────────────────────────────────

export const LEVEL_THRESHOLDS: number[] = [0, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000];

export const LEVEL_TITLES: string[] = [
  "Newcomer", "Contender", "Regular", "Enthusiast", "Veteran",
  "Champion", "Elite", "Master", "Grandmaster", "Legend",
];

// ─── Badge Definitions ────────────────────────────────────────────────────────

export interface BadgeDefinition {
  id: string;
  name: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: "first_entry", name: "First Entry" },
  { id: "first_win",   name: "First Win"   },
  { id: "streak_7",    name: "7-Day Streak" },
  { id: "referrer",    name: "Referrer"     },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserLevel {
  xp: number;
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number | null;
  badges: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeLevel(totalXp: number): { level: number; title: string; currentLevelXp: number; nextLevelXp: number | null } {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  level = Math.min(level, LEVEL_THRESHOLDS.length);
  const title = LEVEL_TITLES[level - 1] ?? LEVEL_TITLES[LEVEL_TITLES.length - 1];
  const currentLevelXp = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextLevelXp = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : null;
  return { level, title, currentLevelXp, nextLevelXp };
}

// Checks whether an array of ISO date strings contains a consecutive run of ≥ n days.
function hasConsecutiveDays(days: string[], n: number): boolean {
  if (days.length < n) return false;
  const sorted = Array.from(new Set(days)).sort();
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / 86_400_000;
    run = diffDays === 1 ? run + 1 : 1;
    if (run >= n) return true;
  }
  return run >= n;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function awardXp(userId: number, reason: XpReason, db: any): Promise<number> {
  await db.insert(gamificationEvents).values({ userId, xp: XP[reason], reason, createdAt: new Date() });

  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(xp), 0)` })
    .from(gamificationEvents)
    .where(eq(gamificationEvents.userId, userId));

  return Number(row?.total ?? 0);
}

export async function getUserLevel(userId: number, db: any): Promise<UserLevel> {
  const [xpRow] = await db
    .select({ total: sql<number>`coalesce(sum(xp), 0)` })
    .from(gamificationEvents)
    .where(eq(gamificationEvents.userId, userId));

  const totalXp = Number(xpRow?.total ?? 0);
  const { level, title, currentLevelXp, nextLevelXp } = computeLevel(totalXp);

  const badgeRows: { badgeId: string }[] = await db
    .select({ badgeId: gamificationBadges.badgeId })
    .from(gamificationBadges)
    .where(eq(gamificationBadges.userId, userId));

  return { xp: totalXp, level, title, currentLevelXp, nextLevelXp, badges: badgeRows.map(b => b.badgeId) };
}

export async function checkAndAwardBadges(userId: number, db: any): Promise<string[]> {
  const existingRows: { badgeId: string }[] = await db
    .select({ badgeId: gamificationBadges.badgeId })
    .from(gamificationBadges)
    .where(eq(gamificationBadges.userId, userId));

  const existing = new Set(existingRows.map(r => r.badgeId));
  const toAward: string[] = [];

  // first_entry
  if (!existing.has("first_entry")) {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drawEntries)
      .where(eq(drawEntries.userId, userId));
    if (Number(row?.count ?? 0) >= 1) toAward.push("first_entry");
  }

  // first_win
  if (!existing.has("first_win")) {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(draws)
      .where(eq(draws.winnerUserId, userId));
    if (Number(row?.count ?? 0) >= 1) toAward.push("first_win");
  }

  // referrer
  if (!existing.has("referrer")) {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(referrals)
      .where(eq(referrals.referrerId, userId));
    if (Number(row?.count ?? 0) >= 1) toAward.push("referrer");
  }

  // streak_7: 7 consecutive calendar days with at least one XP event
  if (!existing.has("streak_7")) {
    const dayRows: { day: string }[] = await db
      .select({ day: sql<string>`date_trunc('day', created_at)::date::text` })
      .from(gamificationEvents)
      .where(eq(gamificationEvents.userId, userId))
      .groupBy(sql`date_trunc('day', created_at)::date`);

    if (hasConsecutiveDays(dayRows.map(r => r.day), 7)) toAward.push("streak_7");
  }

  if (toAward.length > 0) {
    await db.insert(gamificationBadges).values(
      toAward.map(badgeId => ({ userId, badgeId, awardedAt: new Date() })),
    ).onConflictDoNothing();
  }

  return toAward;
}
