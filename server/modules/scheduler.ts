import { db } from "../db";
import { countries, draws, users, wallets, drawEntries } from "@shared/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { getOrCreateDraw, todayDateString, addPaidEntry, conductDraw } from "./lottery";

// Called once at server start — sets up interval-based checking
export function startScheduler(broadcastFn: (data: object) => void) {
  // Check every minute if any draw needs to be conducted
  setInterval(() => checkAndConductDraws(broadcastFn), 60_000);
  // Also auto-enter users who have auto_participate=true and sufficient balance
  setInterval(() => autoEnterUsers(), 5 * 60_000);

  // Run immediately on startup
  checkAndConductDraws(broadcastFn);
  autoEnterUsers();
}

async function checkAndConductDraws(broadcastFn: (data: object) => void) {
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

      // Check if draw was created more than drawHourUtc hours ago (i.e. it's past draw time)
      const drawOpenedAt = openDraw.openedAt ?? openDraw.createdAt;
      const msSinceOpen = now.getTime() - new Date(drawOpenedAt).getTime();
      const hoursSinceOpen = msSinceOpen / (1000 * 60 * 60);

      // If past the scheduled draw hour, conduct it
      const scheduledTime = new Date();
      scheduledTime.setUTCHours(country.drawHourUtc, 0, 0, 0);
      if (now >= scheduledTime) {
        console.log(`[Scheduler] Conducting draw #${openDraw.id} for ${country.name}`);
        try {
          const result = await conductDraw(openDraw.id);
          if (result) broadcastFn({ type: "draw_completed", countryId: country.id, ...result });
        } catch (err) {
          console.error(`[Scheduler] Draw error:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[Scheduler] Check error:", err);
  }
}

async function autoEnterUsers() {
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

          // Check balance
          const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
          if (!wallet || parseFloat(wallet.balance as string) < entryAmount) continue;

          await addPaidEntry(user.id, draw.id);
        } catch {
          // Skip individual failures silently
        }
      }
    }
  } catch (err) {
    console.error("[AutoEnter] Error:", err);
  }
}
