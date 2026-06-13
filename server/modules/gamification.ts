import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";

// ─── Local table definitions (not yet in shared schema) ──────────────────────

export const gamificationEvents = pgTable("gamification_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  xp: integer("xp").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gamificationBadges = pgTable("gamification_badges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  badgeId: text("badge_id").notNull(),
  awardedAt: timestamp("awarded_at").notNull().defaultNow(),
});

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
  "Newcomer",
  "Contender",
  "Regular",
  "Enthusiast",
  "Veteran",
  "Champion",
  "Elite",
  "Master",
  "Grandmaster",
  "Legend",
];

// ─── Badge Definitions ────────────────────────────────────────────────────────

export interface BadgeDefinition {
  id: string;
  name: string;
  condition: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: "first_entry", name: "First Entry", condition: "firstEntry" },
  { id: "first_win",   name: "First Win",   condition: "firstWin"   },
  { id: "streak_7",    name: "7-Day Streak", condition: "streak7"   },
  { id: "referrer",    name: "Referrer",     condition: "referral"  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserLevel {
  xp: number;
  level: number;
  title: string;
  nextLevelXp: number | null;
  badges: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeLevel(totalXp: number): { level: number; title: string; nextLevelXp: number | null } {
  let level = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1; // levels are 1-indexed
      break;
    }
  }
  // Cap at max level
  if (level > LEVEL_THRESHOLDS.length) level = LEVEL_THRESHOLDS.length;

  const title = LEVEL_TITLES[level - 1] ?? LEVEL_TITLES[LEVEL_TITLES.length - 1];
  const nextLevelXp = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : null;

  return { level, title, nextLevelXp };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Award XP to a user for a given reason. Inserts an event row and returns
 * the user's updated total XP.
 */
export async function awardXp(
  userId: number,
  reason: XpReason,
  db: any,
): Promise<number> {
  const xp = XP[reason];

  await db.insert(gamificationEvents).values({
    userId,
    xp,
    reason,
    createdAt: new Date(),
  });

  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(xp), 0)` })
    .from(gamificationEvents)
    .where(eq(gamificationEvents.userId, userId));

  return Number(row?.total ?? 0);
}

/**
 * Return the current level, title, XP and badges for a user.
 */
export async function getUserLevel(userId: number, db: any): Promise<UserLevel> {
  const [xpRow] = await db
    .select({ total: sql<number>`coalesce(sum(xp), 0)` })
    .from(gamificationEvents)
    .where(eq(gamificationEvents.userId, userId));

  const totalXp = Number(xpRow?.total ?? 0);
  const { level, title, nextLevelXp } = computeLevel(totalXp);

  const badgeRows: { badgeId: string }[] = await db
    .select({ badgeId: gamificationBadges.badgeId })
    .from(gamificationBadges)
    .where(eq(gamificationBadges.userId, userId));

  const badges = badgeRows.map((b) => b.badgeId);

  return { xp: totalXp, level, title, nextLevelXp, badges };
}

/**
 * Check eligibility for each badge and insert any newly earned ones.
 * Skips badges the user already holds.
 */
export async function checkAndAwardBadges(userId: number, db: any): Promise<string[]> {
  // Fetch already-earned badges
  const existingRows: { badgeId: string }[] = await db
    .select({ badgeId: gamificationBadges.badgeId })
    .from(gamificationBadges)
    .where(eq(gamificationBadges.userId, userId));

  const existing = new Set(existingRows.map((r) => r.badgeId));

  // Import shared tables lazily to avoid circular-dep issues
  const { drawEntries, draws, referrals } = await import("@shared/schema");

  // Count draw entries for this user
  const [entryRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(drawEntries)
    .where(eq(drawEntries.userId, userId));
  const entryCount = Number(entryRow?.count ?? 0);

  // Count wins (draws where this user is the winner)
  const [winRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(draws)
    .where(eq(draws.winnerUserId, userId));
  const winCount = Number(winRow?.count ?? 0);

  // Count referrals made by this user
  const [refRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(referrals)
    .where(eq(referrals.referrerId, userId));
  const referralCount = Number(refRow?.count ?? 0);

  const toAward: string[] = [];

  if (!existing.has("first_entry") && entryCount >= 1) {
    toAward.push("first_entry");
  }
  if (!existing.has("first_win") && winCount >= 1) {
    toAward.push("first_win");
  }
  if (!existing.has("referrer") && referralCount >= 1) {
    toAward.push("referrer");
  }
  // streak_7 requires external tracking; award if XP events span 7+ distinct days
  if (!existing.has("streak_7")) {
    const streakRows: { day: string }[] = await db
      .select({ day: sql<string>`date_trunc('day', created_at)::text` })
      .from(gamificationEvents)
      .where(eq(gamificationEvents.userId, userId))
      .groupBy(sql`date_trunc('day', created_at)`);

    if (streakRows.length >= 7) {
      toAward.push("streak_7");
    }
  }

  if (toAward.length > 0) {
    await db.insert(gamificationBadges).values(
      toAward.map((badgeId) => ({
        userId,
        badgeId,
        awardedAt: new Date(),
      })),
    );
  }

  return toAward;
}
