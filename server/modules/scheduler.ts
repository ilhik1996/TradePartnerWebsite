import { db } from "../db";
import { countries, draws, users, userProfiles, wallets, drawEntries } from "@shared/schema";
import { eq, and, ne } from "drizzle-orm";
import { getOrCreateDraw, todayDateString, addPaidEntry, conductDraw } from "./lottery";
import { renewDueSubscriptions } from "./subscriptions";
import { awardXp, checkAndAwardBadges } from "./gamification";
import { sendDrawResultEmail, sendLowBalanceEmail } from "./email";
import { insertNotification } from "./notifications";
import { purgeExpiredSessions } from "../auth";

let _started = false;

// Called once at server start — sets up interval-based checking
export function startScheduler(broadcastFn: (data: object) => void) {
  if (_started) return;
  _started = true;

  // Check every minute if any draw needs to be conducted
  setInterval(() => checkAndConductDraws(broadcastFn), 60_000);
  // Auto-enter users with auto_participate=true and sufficient balance
  setInterval(() => autoEnterUsers(), 5 * 60_000);
  // Renew due subscriptions every hour
  setInterval(() => renewDueSubscriptions(), 60 * 60_000);
  // Purge expired revoked-token entries once per day
  setInterval(() => purgeExpiredSessions(), 24 * 60 * 60_000);

  // Run immediately on startup
  checkAndConductDraws(broadcastFn);
  autoEnterUsers();
  renewDueSubscriptions();
}

export async function checkAndConductDraws(broadcastFn: (data: object) => void) {
  const now = new Date();
  const currentHourUtc = now.getUTCHours();
  const todayStr = todayDateString();

  try {
    const activeCountries = await db.select().from(countries).where(eq(countries.isActive, true));

    for (const country of activeCountries) {
      // Only conduct if current UTC hour >= country's draw hour
      if (currentHourUtc < country.drawHourUtc) continue;

      // Find open draw for today
      const [openDraw] = await db.select().from(draws).where(
        and(
          eq(draws.countryId, country.id),
          eq(draws.drawDate, todayStr),
          eq(draws.status, "open")
        )
      );

      if (!openDraw) continue;

      // If past the scheduled draw hour, conduct it
      const scheduledTime = new Date();
      scheduledTime.setUTCHours(country.drawHourUtc, 0, 0, 0);
      if (now >= scheduledTime) {
        console.log(`[Scheduler] Conducting draw #${openDraw.id} for ${country.name}`);
        try {
          const result = await conductDraw(openDraw.id);
          if (result) {
            // Broadcast only non-sensitive fields — winnerUserId stays server-side
            broadcastFn({ type: "draw_completed", countryId: country.id, drawId: result.drawId, prizeAmount: result.prizeAmount });
            // Award win XP non-blocking
            if (result.winnerUserId) {
              awardXp(result.winnerUserId, 'win', db).then(() => checkAndAwardBadges(result.winnerUserId, db)).catch(() => {});
            }
            // Send winner email non-blocking
            db.select({ email: users.email, firstName: userProfiles.firstName })
              .from(users)
              .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
              .where(eq(users.id, result.winnerUserId))
              .then(([winner]) => {
                if (winner?.email) {
                  sendDrawResultEmail({
                    to: winner.email,
                    firstName: winner.firstName ?? undefined,
                    drawDate: openDraw.drawDate,
                    isWinner: true,
                    prizeAmount: result.prizeAmount,
                    currencySymbol: country.currencySymbol ?? "",
                  }).catch(() => {});
                }
              }).catch(() => {});

            // Send loser emails non-blocking — fetch all entries except winner
            db.select({
              email: users.email,
              firstName: userProfiles.firstName,
              ticketNumber: drawEntries.ticketNumber,
            })
              .from(drawEntries)
              .innerJoin(users, eq(users.id, drawEntries.userId))
              .leftJoin(userProfiles, eq(userProfiles.userId, drawEntries.userId))
              .where(and(
                eq(drawEntries.drawId, openDraw.id),
                ne(drawEntries.userId, result.winnerUserId),
              ))
              .then((loserRows) => {
                const tasks = loserRows
                  .filter(l => !!l.email)
                  .map(loser => sendDrawResultEmail({
                    to: loser.email!,
                    firstName: loser.firstName ?? undefined,
                    drawDate: openDraw.drawDate,
                    isWinner: false,
                    myTicket: loser.ticketNumber ?? undefined,
                    winnerTicket: result.winnerTicket,
                    totalEntries: openDraw.totalEntries,
                    currencySymbol: country.currencySymbol ?? "",
                  }).catch(() => {}));
                return Promise.allSettled(tasks);
              }).catch(() => {});
          }
        } catch (err) {
          console.error(`[Scheduler] Draw error:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[Scheduler] Check error:", err);
  }
}

export async function autoEnterUsers() {
  const todayStr = todayDateString();
  try {
    const activeCountries = await db.select().from(countries).where(eq(countries.isActive, true));

    for (const country of activeCountries) {
      // Get or create today's draw
      const draw = await getOrCreateDraw(country.id, todayStr);
      if (draw.status !== "open") continue;

      const entryAmount = parseFloat(country.entryAmountDaily as string);

      // Find active users with auto_participate=true in this country who haven't entered yet
      const allUsers = await db.select({
        id: users.id,
        autoParticipate: users.autoParticipate,
        status: users.status,
      }).from(users).where(
        and(
          eq(users.countryId, country.id),
          eq(users.autoParticipate, true),
          eq(users.status, "active")
        )
      );

      for (const user of allUsers) {
        try {
          // Check if already entered
          const [existing] = await db.select().from(drawEntries).where(
            and(eq(drawEntries.drawId, draw.id), eq(drawEntries.userId, user.id))
          );
          if (existing) continue;

          // Check balance — notify user if insufficient
          const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
          if (!wallet || parseFloat(wallet.balance as string) < entryAmount) {
            insertNotification({
              userId: user.id,
              type: "balance_low",
              title: "Balance too low for today's draw",
              body: `Your balance is below ${country.currencySymbol}${entryAmount}. Top up to enter automatically.`,
              metadata: { entryAmount, currency: country.currency },
              pushUrl: "/wallet",
            }).catch(() => {});
            // Email (non-blocking) — fetch user row to get email
            db.select({ email: users.email })
              .from(users).where(eq(users.id, user.id))
              .then(([u]) => {
                if (u?.email) sendLowBalanceEmail(u.email, country.currencySymbol, entryAmount.toFixed(2)).catch(() => {});
              }).catch(() => {});
            continue;
          }

          await addPaidEntry(user.id, draw.id);
          // Award XP for auto-entry non-blocking
          awardXp(user.id, 'entry', db).then(() => checkAndAwardBadges(user.id, db)).catch(() => {});
        } catch {
          // Skip individual failures silently
        }
      }
    }
  } catch (err) {
    console.error("[AutoEnter] Error:", err);
  }
}
