import { db } from "../db";
import { subscriptions, users, countries, notifications } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { addPaidEntry, getOrCreateDraw, todayDateString } from "./lottery";
import { processDeposit } from "./payments";
import { nanoid } from "nanoid";
import { awardXp, checkAndAwardBadges } from "./gamification";

// ─── Create subscription ──────────────────────────────────────────────────────

export async function createSubscription(
  userId: number,
  type: "weekly" | "monthly",
  paymentMethodToken: string,
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");
  if (user.status !== "active") throw new Error("Account is not active — subscriptions unavailable");
  if (!user.countryId) throw new Error("User has no country set");

  const [country] = await db.select().from(countries).where(eq(countries.id, user.countryId));
  if (!country) throw new Error("Country not found");

  const amount = type === "weekly"
    ? parseFloat(country.entryAmountWeekly as string)
    : parseFloat(country.entryAmountMonthly as string);

  // Cancel any existing active subscription BEFORE charging (avoids double-active state)
  await db.update(subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.countryId, country.id),
      eq(subscriptions.status, "active"),
    ));

  // Charge first period
  const result = await processDeposit(
    userId,
    amount,
    country.currency,
    paymentMethodToken,
    `VIONA ${type} subscription — ${country.name}`,
  );

  if (!result.ok) throw new Error(result.message ?? "Payment failed");

  const now = new Date();
  const nextBillingDate = new Date(now);
  if (type === "weekly") {
    nextBillingDate.setDate(now.getDate() + 7);
  } else {
    nextBillingDate.setMonth(now.getMonth() + 1);
  }

  const [sub] = await db.insert(subscriptions).values({
    userId,
    countryId: country.id,
    type,
    status: "active",
    amount: amount.toFixed(2),
    currency: country.currency,
    startDate: now,
    nextBillingDate,
    paymentMethodToken,
  }).returning();

  await db.insert(notifications).values({
    userId,
    type: "subscription_created",
    title: `${type === "weekly" ? "Weekly" : "Monthly"} subscription active`,
    body: `${country.currencySymbol}${amount.toFixed(2)} charged. You'll automatically enter every daily draw in ${country.name}.`,
    metadata: { subscriptionId: sub.id },
  });

  return sub;
}

// ─── Cancel subscription ──────────────────────────────────────────────────────

export async function cancelSubscription(userId: number, subscriptionId: number) {
  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)));

  if (!sub) throw new Error("Subscription not found");
  if (sub.status !== "active") throw new Error("Subscription is not active");

  await db.update(subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId));

  return { cancelled: true, effectiveDate: sub.nextBillingDate };
}

// ─── Get active subscription ───────────────────────────────────────────────────

export async function getActiveSubscription(userId: number) {
  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
  return sub ?? null;
}

// ─── Renewal job — called by scheduler every hour ─────────────────────────────

export async function renewDueSubscriptions() {
  const now = new Date();
  const due = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), lte(subscriptions.nextBillingDate, now)));

  for (const sub of due) {
    try {
      const [country] = await db.select().from(countries).where(eq(countries.id, sub.countryId));
      const amount = parseFloat(sub.amount as string);

      // Attempt renewal charge
      const result = await processDeposit(
        sub.userId,
        amount,
        sub.currency,
        sub.paymentMethodToken ?? "mock_pm_token",
        `VIONA ${sub.type} subscription renewal`,
      );

      if (result.ok) {
        // Advance billing date
        const next = new Date(sub.nextBillingDate);
        if (sub.type === "weekly") {
          next.setDate(next.getDate() + 7);
        } else {
          next.setMonth(next.getMonth() + 1);
        }
        await db.update(subscriptions)
          .set({ nextBillingDate: next })
          .where(eq(subscriptions.id, sub.id));
        // Award XP for renewal non-blocking
        const xpReason = sub.type === "weekly" ? "weekly_sub" : "monthly_sub";
        awardXp(sub.userId, xpReason, db).then(() => checkAndAwardBadges(sub.userId, db)).catch(() => {});
      } else {
        // Renewal failed — pause subscription, notify user
        await db.update(subscriptions)
          .set({ status: "paused" })
          .where(eq(subscriptions.id, sub.id));

        await db.insert(notifications).values({
          userId: sub.userId,
          type: "subscription_renewal_failed",
          title: "Subscription renewal failed",
          body: "We couldn't charge your payment method. Your subscription is paused — please update your payment details.",
        });
      }
    } catch (err) {
      console.error(`[Subscriptions] Renewal error for sub #${sub.id}:`, err);
    }
  }
}
