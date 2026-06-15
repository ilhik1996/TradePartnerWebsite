import { db } from "../db";
import { subscriptions, users, countries } from "@shared/schema";
import { eq, and, lte, gt } from "drizzle-orm";
import { addPaidEntry, getOrCreateDraw, todayDateString } from "./lottery";
import { processDeposit } from "./payments";
import { nanoid } from "nanoid";
import { awardXp, checkAndAwardBadges } from "./gamification";
import { insertNotification } from "./notifications";

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

  // Charge first period BEFORE cancelling existing subscription — if the charge fails,
  // the user's existing subscription is left intact (no rollback needed)
  const result = await processDeposit(
    userId,
    amount,
    country.currency,
    paymentMethodToken,
    `VIONA ${type} subscription — ${country.name}`,
  );

  if (!result.ok) throw new Error(result.message ?? "Payment failed");

  // Payment succeeded — now cancel any existing active subscription
  await db.update(subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.countryId, country.id),
      eq(subscriptions.status, "active"),
    ));

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

  // Ensure auto-participate is on — a subscription is useless without it
  await db.update(users).set({ autoParticipate: true }).where(eq(users.id, userId));

  await insertNotification({
    userId,
    type: "subscription_created",
    title: `${type === "weekly" ? "Weekly" : "Monthly"} subscription active`,
    body: `${country.currencySymbol}${amount.toFixed(2)} charged. You'll automatically enter every daily draw in ${country.name}.`,
    metadata: { subscriptionId: sub.id },
    pushUrl: "/subscription",
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

      // Claim renewal slot first (atomic date advance) — only one process wins;
      // prevents concurrent schedulers from both charging the same period
      const next = new Date(sub.nextBillingDate);
      if (sub.type === "weekly") {
        next.setDate(next.getDate() + 7);
      } else {
        next.setMonth(next.getMonth() + 1);
      }
      const [claimed] = await db.update(subscriptions)
        .set({ nextBillingDate: next })
        .where(and(
          eq(subscriptions.id, sub.id),
          eq(subscriptions.nextBillingDate, sub.nextBillingDate),
        ))
        .returning({ id: subscriptions.id });

      if (!claimed) continue;  // another process already claimed this renewal

      // Attempt charge (guaranteed only one process reaches here per renewal cycle)
      const result = await processDeposit(
        sub.userId,
        amount,
        sub.currency,
        sub.paymentMethodToken ?? "mock_pm_token",
        `VIONA ${sub.type} subscription renewal`,
      );

      if (result.ok) {
        // Award XP for renewal non-blocking
        const xpReason = sub.type === "weekly" ? "weekly_sub" : "monthly_sub";
        awardXp(sub.userId, xpReason, db).then(() => checkAndAwardBadges(sub.userId, db)).catch(() => {});
      } else {
        // Charge failed — roll back the date advance and pause the subscription
        await db.update(subscriptions)
          .set({ nextBillingDate: sub.nextBillingDate, status: "paused" })
          .where(eq(subscriptions.id, sub.id));

        await insertNotification({
          userId: sub.userId,
          type: "subscription_renewal_failed",
          title: "Subscription renewal failed",
          body: "We couldn't charge your payment method. Your subscription is paused — please update your payment details.",
          pushUrl: "/subscription",
        });
      }
    } catch (err) {
      console.error(`[Subscriptions] Renewal error for sub #${sub.id}:`, err);
    }
  }
}
