import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "./db";
import { signToken, verifyToken, requireAuth, requireAdmin } from "./auth";
import { getOrCreateWallet, depositFunds, getBalance, getTransactionHistory } from "./modules/wallet";
import {
  getOrCreateDraw, todayDateString, addPaidEntry, addFreeEntry, conductDraw
} from "./modules/lottery";
import { processDeposit, chargebackRiskScore } from "./modules/payments";
import { createSubscription, cancelSubscription, getActiveSubscription } from "./modules/subscriptions";
import { sendWelcomeEmail, sendDrawResultEmail, sendWithdrawalConfirmationEmail } from "./modules/email";
import { awardXp, getUserLevel, checkAndAwardBadges, XP } from "./modules/gamification";
import { getPartners, getPartner } from "./modules/partners";
import { sendPushToUser, VAPID_PUBLIC_KEY } from "./modules/push";
import { insertNotification } from "./modules/notifications";
import { authRateLimit, apiRateLimit, paymentRateLimit, deviceFingerprint, detectSuspicious } from "./middleware/security";
import {
  users, userProfiles, countries, draws, drawEntries, wallets, transactions,
  responsibleGaming, notifications, adminUsers, auditLogs, petitionSignatures,
  subscriptions, referrals, partners, pushSubscriptions,
  insertUserSchema, loginSchema, freeEntrySchema,
} from "@shared/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── WebSocket broadcaster ────────────────────────────────────────────────────

let wss: WebSocketServer;

function broadcast(data: object) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Exported so scheduler can reuse the same broadcast function
export function getBroadcast() { return broadcast; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(req: Request): number {
  return (req as any).userId;
}
function adminUid(req: Request): number {
  return (req as any).adminId;
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerRoutes(app: Express): Promise<Server> {

  // Apply device fingerprint to every request
  app.use(deviceFingerprint);

  // General API rate limit
  app.use("/api", apiRateLimit);

  // ── Health check ─────────────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", authRateLimit, async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const { password, email, phone, countryId } = data;
      const autoParticipate = req.body.autoParticipate !== false;

      // Check uniqueness
      if (email) {
        const [ex] = await db.select().from(users).where(eq(users.email, email));
        if (ex) { res.status(409).json({ message: "Email already registered" }); return; }
      }
      if (phone) {
        const [ex] = await db.select().from(users).where(eq(users.phone, phone));
        if (ex) { res.status(409).json({ message: "Phone already registered" }); return; }
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const referralCode = nanoid(8).toUpperCase();

      const country = countryId
        ? await db.select().from(countries).where(eq(countries.id, countryId)).then(r => r[0])
        : await db.select().from(countries).where(eq(countries.code, "UA")).then(r => r[0]);

      const [user] = await db.insert(users).values({
        email: email ?? null,
        phone: phone ?? null,
        passwordHash,
        countryId: country?.id ?? null,
        referralCode,
        autoParticipate,
      }).returning();

      await db.insert(userProfiles).values({ userId: user.id });

      await db.insert(responsibleGaming).values({
        userId: user.id,
        notificationFrequencyHours: 24,
      });

      // Create wallet in country currency
      if (country) {
        await getOrCreateWallet(user.id, country.currency);
      }

      const token = signToken({ userId: user.id });
      // Welcome email (non-blocking)
      if (user.email) sendWelcomeEmail(user.email).catch(() => {});
      res.status(201).json({ token, user: sanitizeUser(user) });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", authRateLimit, async (req: Request, res: Response) => {
    try {
      const { identifier, password } = loginSchema.parse(req.body);
      const [user] = await db.select().from(users).where(
        identifier.includes("@") ? eq(users.email, identifier) : eq(users.phone, identifier)
      );
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }
      if (user.status === "banned" || user.status === "suspended") {
        res.status(403).json({ message: "Account suspended" });
        return;
      }
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      const token = signToken({ userId: user.id });
      res.json({ token, user: sanitizeUser(user) });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const [user] = await db.select().from(users).where(eq(users.id, uid(req)));
    if (!user) { res.status(404).json({ message: "User not found" }); return; }
    res.json(sanitizeUser(user));
  });

  // ── Countries ─────────────────────────────────────────────────────────────

  app.get("/api/countries", async (_req: Request, res: Response) => {
    const list = await db.select().from(countries).where(eq(countries.isActive, true));
    res.json(list);
  });

  app.get("/api/countries/:id", async (req: Request, res: Response) => {
    const [country] = await db.select().from(countries).where(eq(countries.id, parseInt(req.params.id)));
    if (!country) { res.status(404).json({ message: "Country not found" }); return; }
    res.json(country);
  });

  // ── Draws ─────────────────────────────────────────────────────────────────

  // Today's draw for a country
  app.get("/api/draws/today/:countryId", async (req: Request, res: Response) => {
    try {
      const countryId = parseInt(req.params.countryId);
      const draw = await getOrCreateDraw(countryId, todayDateString());
      const entries = await db.select().from(drawEntries).where(eq(drawEntries.drawId, draw.id));
      res.json({ ...draw, entriesCount: entries.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // List past draws for a country
  app.get("/api/draws/history/:countryId", async (req: Request, res: Response) => {
    const countryId = parseInt(req.params.countryId);
    const list = await db.select().from(draws)
      .where(and(eq(draws.countryId, countryId), eq(draws.status, "completed")))
      .orderBy(desc(draws.completedAt))
      .limit(30);

    // Enrich with authenticated user's entry data if token present
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = verifyToken(authHeader.slice(7));
        const userId = (payload as any).userId as number;
        const drawIds = list.map(d => d.id);
        if (drawIds.length > 0) {
          const entries = await db.select().from(drawEntries)
            .where(and(eq(drawEntries.userId, userId), inArray(drawEntries.drawId, drawIds)));
          const entryMap = Object.fromEntries(entries.map(e => [e.drawId, e]));
          return res.json(list.map(d => ({
            ...d,
            myEntry: entryMap[d.id] ?? null,
            isWinner: d.winnerUserId === userId,
          })));
        }
      } catch {}
    }

    res.json(list);
  });

  // Paid entry
  app.post("/api/draws/:drawId/enter", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await addPaidEntry(uid(req), parseInt(req.params.drawId));
      const draw = await db.select().from(draws).where(eq(draws.id, parseInt(req.params.drawId))).then(r => r[0]);
      broadcast({ type: "draw_pool_update", drawId: draw.id, totalPool: draw.totalPool, totalEntries: draw.totalEntries });
      // Award XP non-blocking
      awardXp(uid(req), 'entry', db).then(() => checkAndAwardBadges(uid(req), db)).catch(() => {});
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Free entry (AMOE) — for users without account or without funds
  app.post("/api/draws/:drawId/enter-free", async (req: Request, res: Response) => {
    try {
      const body = freeEntrySchema.parse({ ...req.body, drawId: parseInt(req.params.drawId) });
      // Find or create a free-entry guest user by email
      let [user] = await db.select().from(users).where(eq(users.email, body.email));
      if (!user) {
        const passwordHash = await bcrypt.hash(nanoid(16), 10);
        const referralCode = nanoid(8).toUpperCase();
        [user] = await db.insert(users).values({
          email: body.email,
          passwordHash,
          countryId: body.countryId,
          referralCode,
          autoParticipate: false,
        }).returning();
        await db.insert(userProfiles).values({ userId: user.id, firstName: body.firstName, lastName: body.lastName });
        await db.insert(responsibleGaming).values({ userId: user.id });
        const country = await db.select().from(countries).where(eq(countries.id, body.countryId)).then(r => r[0]);
        if (country) await getOrCreateWallet(user.id, country.currency);
      }
      const result = await addFreeEntry(user.id, body.drawId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Check my entry for today's draw
  app.get("/api/draws/:drawId/my-entry", requireAuth, async (req: Request, res: Response) => {
    const [entry] = await db.select().from(drawEntries)
      .where(and(eq(drawEntries.drawId, parseInt(req.params.drawId)), eq(drawEntries.userId, uid(req))));
    res.json(entry ?? null);
  });

  // ── Wallet ────────────────────────────────────────────────────────────────

  app.get("/api/wallet", requireAuth, async (req: Request, res: Response) => {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, uid(req)));
    res.json(wallet ?? null);
  });

  app.get("/api/wallet/transactions", requireAuth, async (req: Request, res: Response) => {
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = parseInt((req.query.offset as string) || "0");
    const txs = await getTransactionHistory(uid(req), limit, offset);
    res.json(txs);
  });

  // Deposit via payment provider (Stripe / mock in dev)
  app.post("/api/wallet/deposit", requireAuth, paymentRateLimit, async (req: Request, res: Response) => {
    try {
      const { amount, paymentMethodToken, currency } = z.object({
        amount: z.number().positive().max(10000),
        paymentMethodToken: z.string().default("mock_pm_token"),
        currency: z.string().default("UAH"),
      }).parse(req.body);

      // Regulatory: deposits require age verification
      const [depositor] = await db.select({ kycLevel: users.kycLevel, status: users.status })
        .from(users).where(eq(users.id, uid(req)));
      if (!depositor || depositor.status !== "active") {
        res.status(403).json({ message: "Account is not active" }); return;
      }
      if (depositor.kycLevel === "none") {
        res.status(403).json({ message: "Age verification required before depositing. Please verify your age in account settings." }); return;
      }

      // Anti-fraud: chargeback risk check
      const riskScore = chargebackRiskScore({
        userId: uid(req),
        ip: req.ip ?? "",
        userAgent: req.headers["user-agent"] ?? "",
        amountUsd: amount,
      });
      if (riskScore >= 80) {
        res.status(403).json({ message: "Transaction flagged for review. Please contact support." });
        return;
      }

      // Suspicious velocity check
      if (detectSuspicious("deposit", String(uid(req)), 5)) {
        res.status(429).json({ message: "Too many deposit attempts. Please wait." });
        return;
      }

      const result = await processDeposit(
        uid(req), amount, currency, paymentMethodToken,
        `VIONA deposit ${currency} ${amount.toFixed(2)}`
      );

      if (!result.ok) {
        if (result.requiresAction) {
          res.status(202).json({ requiresAction: true, actionUrl: result.actionUrl });
          return;
        }
        res.status(400).json({ message: result.message });
        return;
      }

      // Award XP non-blocking
      awardXp(uid(req), 'deposit', db).then(() => checkAndAwardBadges(uid(req), db)).catch(() => {});
      res.json({ ok: true, transactionId: result.transactionId });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Mock withdrawal request
  app.post("/api/wallet/withdraw", requireAuth, async (req: Request, res: Response) => {
    try {
      const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
      const [user] = await db.select().from(users).where(eq(users.id, uid(req)));
      if (user.kycLevel !== "full") {
        res.status(403).json({ message: "Full KYC required to withdraw funds" });
        return;
      }
      const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, uid(req)));
      const balance = parseFloat(wallet.balance as string);
      if (balance < amount) { res.status(400).json({ message: "Insufficient balance" }); return; }

      const newBalance = balance - amount;
      await db.update(wallets).set({ balance: newBalance.toFixed(2), updatedAt: new Date() }).where(eq(wallets.userId, uid(req)));
      const [tx] = await db.insert(transactions).values({
        walletId: wallet.id,
        userId: uid(req),
        type: "withdrawal",
        amount: (-amount).toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        status: "pending",
        description: `Withdrawal request ${wallet.currency} ${amount.toFixed(2)}`,
      }).returning();

      // Send confirmation email (non-blocking)
      const [withdrawingUser] = await db.select().from(users).where(eq(users.id, uid(req)));
      if (withdrawingUser.email) {
        sendWithdrawalConfirmationEmail(withdrawingUser.email, amount.toFixed(2), wallet.currency).catch(() => {});
      }

      res.json({ transaction: tx, newBalance });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── User Profile & Settings ───────────────────────────────────────────────

  app.get("/api/profile", requireAuth, async (req: Request, res: Response) => {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, uid(req)));
    res.json(profile ?? null);
  });

  app.patch("/api/profile", requireAuth, async (req: Request, res: Response) => {
    const { firstName, lastName } = z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    }).parse(req.body);
    await db.update(userProfiles).set({ firstName, lastName }).where(eq(userProfiles.userId, uid(req)));
    res.json({ ok: true });
  });

  // Toggle auto-participate
  app.patch("/api/settings/auto-participate", requireAuth, async (req: Request, res: Response) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await db.update(users).set({ autoParticipate: enabled }).where(eq(users.id, uid(req)));
    res.json({ autoParticipate: enabled });
  });

  // Responsible gaming settings
  app.get("/api/settings/responsible-gaming", requireAuth, async (req: Request, res: Response) => {
    const [rg] = await db.select().from(responsibleGaming).where(eq(responsibleGaming.userId, uid(req)));
    res.json(rg ?? null);
  });

  app.patch("/api/settings/responsible-gaming", requireAuth, async (req: Request, res: Response) => {
    const data = z.object({
      dailyLimitAmount: z.number().nullable().optional(),
      weeklyLimitAmount: z.number().nullable().optional(),
      monthlyLimitAmount: z.number().nullable().optional(),
    }).parse(req.body);
    await db.update(responsibleGaming).set({
      dailyLimitAmount: data.dailyLimitAmount?.toFixed(2) ?? null,
      weeklyLimitAmount: data.weeklyLimitAmount?.toFixed(2) ?? null,
      monthlyLimitAmount: data.monthlyLimitAmount?.toFixed(2) ?? null,
      updatedAt: new Date(),
    }).where(eq(responsibleGaming.userId, uid(req)));
    res.json({ ok: true });
  });

  // Self-exclusion
  app.post("/api/settings/self-exclude", requireAuth, async (req: Request, res: Response) => {
    const { days } = z.object({ days: z.number().int().min(1).max(365) }).parse(req.body);
    const until = new Date();
    until.setDate(until.getDate() + days);
    await db.update(responsibleGaming)
      .set({ selfExcludedUntil: until, updatedAt: new Date() })
      .where(eq(responsibleGaming.userId, uid(req)));
    await db.update(users).set({ status: "self_excluded" }).where(eq(users.id, uid(req)));
    res.json({ selfExcludedUntil: until });
  });

  // ── Notifications ─────────────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    const list = await db.select().from(notifications)
      .where(eq(notifications.userId, uid(req)))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
    res.json(list);
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, parseInt(req.params.id)), eq(notifications.userId, uid(req))));
    res.json({ ok: true });
  });

  // ── Subscriptions ─────────────────────────────────────────────────────────

  app.get("/api/subscription", requireAuth, async (req: Request, res: Response) => {
    const sub = await getActiveSubscription(uid(req));
    res.json(sub);
  });

  app.post("/api/subscription", requireAuth, paymentRateLimit, async (req: Request, res: Response) => {
    try {
      const { type, paymentMethodToken } = z.object({
        type: z.enum(["weekly", "monthly"]),
        paymentMethodToken: z.string().default("mock_pm_token"),
      }).parse(req.body);

      const sub = await createSubscription(uid(req), type, paymentMethodToken);
      // Award XP non-blocking
      const xpReason = type === 'weekly' ? 'weekly_sub' : 'monthly_sub';
      awardXp(uid(req), xpReason, db).then(() => checkAndAwardBadges(uid(req), db)).catch(() => {});
      res.status(201).json(sub);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/subscription/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await cancelSubscription(uid(req), parseInt(req.params.id));
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Subscription history
  app.get("/api/subscription/history", requireAuth, async (req: Request, res: Response) => {
    const list = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, uid(req)))
      .orderBy(desc(subscriptions.createdAt))
      .limit(20);
    res.json(list);
  });

  // ── Referrals ──────────────────────────────────────────────────────────────

  // Get my referral code + stats
  app.get("/api/referrals/my", requireAuth, async (req: Request, res: Response) => {
    const referee = alias(users, "referee");
    const [user] = await db.select().from(users).where(eq(users.id, uid(req)));
    const myReferrals = await db
      .select({
        id: referrals.id,
        refereeId: referrals.refereeId,
        bonusAmount: referrals.bonusAmount,
        currency: referrals.currency,
        status: referrals.status,
        paidAt: referrals.paidAt,
        createdAt: referrals.createdAt,
        email: referee.email,
        joinedAt: referee.createdAt,
      })
      .from(referrals)
      .leftJoin(referee, eq(referee.id, referrals.refereeId))
      .where(eq(referrals.referrerId, uid(req)))
      .orderBy(desc(referrals.createdAt));
    const totalBonus = myReferrals.reduce((s, r) => s + parseFloat(r.bonusAmount as string), 0);
    res.json({
      referralCode: user.referralCode,
      referrals: myReferrals,
      totalBonusEarned: totalBonus.toFixed(2),
      referralCount: myReferrals.length,
    });
  });

  // Apply referral code during / after registration
  app.post("/api/referrals/apply", requireAuth, async (req: Request, res: Response) => {
    try {
      const { code } = z.object({ code: z.string().min(4) }).parse(req.body);
      // Check if user already has a referrer
      const [me] = await db.select().from(users).where(eq(users.id, uid(req)));
      if (me.referredBy) { res.status(409).json({ message: "Referral already applied" }); return; }

      const [referrer] = await db.select().from(users).where(eq(users.referralCode, code.toUpperCase()));
      if (!referrer) { res.status(404).json({ message: "Invalid referral code" }); return; }
      if (referrer.id === uid(req)) { res.status(400).json({ message: "Cannot use your own code" }); return; }

      await db.update(users).set({ referredBy: referrer.id }).where(eq(users.id, uid(req)));

      // Get country for bonus amount
      const country = me.countryId
        ? await db.select().from(countries).where(eq(countries.id, me.countryId)).then(r => r[0])
        : null;
      const bonusAmount = parseFloat(country?.entryAmountDaily as string ?? "5");
      const currency = country?.currency ?? "UAH";

      // Record referral (pending until new user makes first paid entry)
      await db.insert(referrals).values({
        referrerId: referrer.id,
        refereeId: uid(req),
        bonusAmount: bonusAmount.toFixed(2),
        currency,
        status: "pending",
      });

      // Award XP to the referrer non-blocking
      const referrerId = referrer.id;
      awardXp(referrerId, 'referral', db).then(() => checkAndAwardBadges(referrerId, db)).catch(() => {});

      res.json({ ok: true, referrerName: referrer.email ?? referrer.phone });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── Petition ──────────────────────────────────────────────────────────────

  app.post("/api/petition/sign", requireAuth, async (req: Request, res: Response) => {
    try {
      const { firstName, countryCode } = z.object({
        firstName: z.string().min(1),
        countryCode: z.string().length(2),
      }).parse(req.body);
      await db.insert(petitionSignatures).values({
        userId: uid(req),
        firstName,
        countryCode,
      });
      res.json({ ok: true });
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        res.status(409).json({ message: "Already signed" });
      } else {
        res.status(400).json({ message: err.message });
      }
    }
  });

  app.delete("/api/petition/sign", requireAuth, async (req: Request, res: Response) => {
    await db.update(petitionSignatures)
      .set({ revokedAt: new Date() })
      .where(eq(petitionSignatures.userId, uid(req)));
    res.json({ ok: true });
  });

  // ── Admin Auth ─────────────────────────────────────────────────────────────

  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(req.body);
      const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
      if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
        res.status(401).json({ message: "Invalid admin credentials" });
        return;
      }
      if (!admin.isActive) { res.status(403).json({ message: "Admin account disabled" }); return; }
      await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, admin.id));
      const token = signToken({ userId: admin.id, role: "admin" });
      res.json({ token, admin: { id: admin.id, email: admin.email, role: admin.role } });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── Admin: Countries ──────────────────────────────────────────────────────

  app.get("/api/admin/countries", requireAdmin, async (_req: Request, res: Response) => {
    const list = await db.select().from(countries).orderBy(countries.name);
    res.json(list);
  });

  app.post("/api/admin/countries", requireAdmin, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        code: z.string().length(2).toUpperCase(),
        name: z.string().min(1),
        currency: z.string().min(1),
        currencySymbol: z.string().min(1),
        locale: z.string().min(1),
        entryAmountDaily: z.coerce.number().positive(),
        entryAmountWeekly: z.coerce.number().positive(),
        entryAmountMonthly: z.coerce.number().positive(),
        prizePercentage: z.coerce.number().min(1).max(99),
        drawHourUtc: z.coerce.number().int().min(0).max(23),
        isActive: z.boolean().optional().default(true),
      });
      const body = schema.parse(req.body);
      const [country] = await db.insert(countries).values({
        ...body,
        entryAmountDaily: body.entryAmountDaily.toFixed(2),
        entryAmountWeekly: body.entryAmountWeekly.toFixed(2),
        entryAmountMonthly: body.entryAmountMonthly.toFixed(2),
        prizePercentage: body.prizePercentage.toFixed(2),
      }).returning();
      res.status(201).json(country);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/admin/countries/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1).optional(),
        currency: z.string().min(1).optional(),
        currencySymbol: z.string().min(1).optional(),
        locale: z.string().min(1).optional(),
        entryAmountDaily: z.coerce.number().positive().optional(),
        entryAmountWeekly: z.coerce.number().positive().optional(),
        entryAmountMonthly: z.coerce.number().positive().optional(),
        prizePercentage: z.coerce.number().min(1).max(99).optional(),
        drawHourUtc: z.coerce.number().int().min(0).max(23).optional(),
        isActive: z.boolean().optional(),
      });
      const body = schema.parse(req.body);
      const updateData: Record<string, any> = { ...body };
      if (body.entryAmountDaily !== undefined) updateData.entryAmountDaily = body.entryAmountDaily.toFixed(2);
      if (body.entryAmountWeekly !== undefined) updateData.entryAmountWeekly = body.entryAmountWeekly.toFixed(2);
      if (body.entryAmountMonthly !== undefined) updateData.entryAmountMonthly = body.entryAmountMonthly.toFixed(2);
      if (body.prizePercentage !== undefined) updateData.prizePercentage = body.prizePercentage.toFixed(2);
      const [country] = await db.update(countries).set(updateData).where(eq(countries.id, parseInt(req.params.id))).returning();
      if (!country) { res.status(404).json({ message: "Country not found" }); return; }
      res.json(country);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── Admin: Draws ──────────────────────────────────────────────────────────

  app.get("/api/admin/draws", requireAdmin, async (req: Request, res: Response) => {
    const list = await db.select().from(draws).orderBy(desc(draws.createdAt)).limit(50);
    res.json(list);
  });

  app.post("/api/admin/draws", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { countryId, drawDate } = z.object({
        countryId: z.number(),
        drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }).parse(req.body);
      const date = drawDate ?? new Date().toISOString().slice(0, 10);
      const [existing] = await db.select({ id: draws.id }).from(draws)
        .where(and(eq(draws.countryId, countryId), eq(draws.drawDate, date)));
      if (existing) { res.status(409).json({ message: `Draw for ${date} already exists (ID #${existing.id})` }); return; }
      const [draw] = await db.insert(draws).values({ countryId, drawDate: date, status: "open", totalPool: "0" }).returning();
      await db.insert(auditLogs).values({
        adminUserId: adminUid(req), action: "create_draw", entityType: "draw", entityId: draw.id, dataAfter: draw,
      });
      res.status(201).json(draw);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/admin/draws/:id/conduct", requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await conductDraw(parseInt(req.params.id));
      await db.insert(auditLogs).values({
        adminUserId: adminUid(req),
        action: "conduct_draw",
        entityType: "draw",
        entityId: parseInt(req.params.id),
        dataAfter: result,
      });
      broadcast({ type: "draw_completed", ...result });
      // Award win XP non-blocking
      if (result?.winnerUserId) {
        awardXp(result.winnerUserId, 'win', db).then(() => checkAndAwardBadges(result.winnerUserId, db)).catch(() => {});
      }
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── Admin: Users ──────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    const limit = parseInt((req.query.limit as string) || "50");
    const offset = parseInt((req.query.offset as string) || "0");
    const list = await db.select({
      id: users.id, email: users.email, phone: users.phone, status: users.status,
      kycLevel: users.kycLevel, createdAt: users.createdAt, countryId: users.countryId,
    }).from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset);
    res.json(list);
  });

  app.patch("/api/admin/users/:id/status", requireAdmin, async (req: Request, res: Response) => {
    const { status } = z.object({ status: z.enum(["active", "suspended", "banned"]) }).parse(req.body);
    const [user] = await db.update(users).set({ status }).where(eq(users.id, parseInt(req.params.id))).returning();
    await db.insert(auditLogs).values({
      adminUserId: adminUid(req),
      action: "update_user_status",
      entityType: "user",
      entityId: user.id,
      dataAfter: { status },
    });
    res.json(user);
  });

  // ── Admin: Financials ─────────────────────────────────────────────────────

  app.get("/api/admin/transactions", requireAdmin, async (req: Request, res: Response) => {
    const list = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(100);
    res.json(list);
  });

  // Public platform stats for landing page
  app.get("/api/stats", async (_req: Request, res: Response) => {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [drawCount] = await db.select({ count: sql<number>`count(*)` }).from(draws).where(eq(draws.status, "completed"));
    const [totalPrizes] = await db.select({ total: sql<number>`coalesce(sum(amount),0)` })
      .from(transactions).where(eq(transactions.type, "prize_payout"));
    res.json({
      totalUsers: userCount.count,
      completedDraws: drawCount.count,
      totalPrizesPaid: totalPrizes.total,
    });
  });

  app.get("/api/admin/stats", requireAdmin, async (req: Request, res: Response) => {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [drawCount] = await db.select({ count: sql<number>`count(*)` }).from(draws).where(eq(draws.status, "completed"));
    const [totalPrizes] = await db.select({ total: sql<number>`coalesce(sum(amount),0)` })
      .from(transactions).where(eq(transactions.type, "prize_payout"));
    const [totalDeposits] = await db.select({ total: sql<number>`coalesce(sum(amount),0)` })
      .from(transactions).where(eq(transactions.type, "deposit"));
    res.json({
      totalUsers: userCount.count,
      completedDraws: drawCount.count,
      totalPrizesPaid: totalPrizes.total,
      totalDeposits: totalDeposits.total,
    });
  });

  // ── Admin: Petition ───────────────────────────────────────────────────────

  app.get("/api/admin/petition", requireAdmin, async (_req: Request, res: Response) => {
    const signatures = await db.select({
      id: petitionSignatures.id,
      firstName: petitionSignatures.firstName,
      countryCode: petitionSignatures.countryCode,
      agreedAt: petitionSignatures.agreedAt,
      revokedAt: petitionSignatures.revokedAt,
    }).from(petitionSignatures)
      .orderBy(desc(petitionSignatures.agreedAt));

    // Group by country
    const byCountry: Record<string, number> = {};
    const active = signatures.filter(s => !s.revokedAt);
    active.forEach(s => {
      byCountry[s.countryCode] = (byCountry[s.countryCode] ?? 0) + 1;
    });

    res.json({
      total: active.length,
      byCountry,
      signatures: active,
    });
  });

  // Public petition count (no auth needed — for landing page display)
  app.get("/api/petition/count", async (_req: Request, res: Response) => {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(petitionSignatures)
      .where(sql`revoked_at IS NULL`);
    res.json({ count: row.count });
  });

  // ── Admin: Audit Log ──────────────────────────────────────────────────────

  app.get("/api/admin/audit-logs", requireAdmin, async (_req: Request, res: Response) => {
    const list = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
    res.json(list);
  });

  // ── Web Push ─────────────────────────────────────────────────────────────

  // Return VAPID public key so the browser can subscribe
  app.get("/api/push/vapid-key", (_req: Request, res: Response) => {
    if (!VAPID_PUBLIC_KEY) { res.status(503).json({ message: "Push not configured" }); return; }
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  // Store push subscription
  app.post("/api/push/subscribe", requireAuth, async (req: Request, res: Response) => {
    try {
      const { endpoint, keys } = z.object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      }).parse(req.body);
      const userId = uid(req);
      const ua = req.headers["user-agent"] ?? null;
      // Upsert: if endpoint already stored, update keys; otherwise insert
      await db.insert(pushSubscriptions).values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua } });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── KYC initiation ───────────────────────────────────────────────────────

  app.post("/api/kyc/start", requireAuth, async (req: Request, res: Response) => {
    const { level, dateOfBirth, documentType } = z.object({
      level: z.enum(["age", "full"]),
      dateOfBirth: z.string().optional(),
      documentType: z.string().optional(),
    }).parse(req.body);

    const userId = uid(req);
    const [user] = await db.select({ kycLevel: users.kycLevel }).from(users).where(eq(users.id, userId));
    if (!user) { res.status(404).json({ message: "User not found" }); return; }

    if (level === "age") {
      if (user.kycLevel !== "none") { res.status(400).json({ message: "Already verified" }); return; }
      // Validate age — must be 18+
      if (dateOfBirth) {
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) { res.status(400).json({ message: "Invalid date of birth" }); return; }
        const ageMsec = Date.now() - dob.getTime();
        const ageYears = ageMsec / (1000 * 60 * 60 * 24 * 365.25);
        if (ageYears < 18) { res.status(400).json({ message: "You must be 18 or older to participate" }); return; }
      }
      // In production: create Sumsub/Onfido applicant and return redirect URL.
      // For MVP: set age_verified immediately after form submission.
      await db.update(users).set({ kycLevel: "age_verified" }).where(eq(users.id, userId));
      await insertNotification({
        userId, type: "kyc_approved",
        title: "Age verified",
        body: "Your age verification is complete. You can now make deposits.",
        pushUrl: "/wallet",
      });
      res.json({ ok: true, kycLevel: "age_verified" });
    } else {
      if (user.kycLevel !== "age_verified") { res.status(400).json({ message: "Complete age verification first" }); return; }
      // In production: initiate full KYC document review.
      // For MVP: mark as pending (stays age_verified, notification sent, webhook upgrades to full).
      await insertNotification({
        userId, type: "kyc_approved",
        title: "KYC submitted",
        body: "Your documents have been received. Review takes 1-3 business days.",
      });
      res.json({ ok: true, kycLevel: "age_verified", pending: true });
    }
  });

  // ── KYC Webhooks (Sumsub / Onfido) ───────────────────────────────────────

  app.post("/api/webhooks/kyc", async (req: Request, res: Response) => {
    // Verify webhook signature in production (provider-specific HMAC)
    const sig = req.headers["x-sumsub-signature"] ?? req.headers["x-onfido-signature"];

    const { applicantId, reviewResult, externalUserId } = req.body;
    const userId = parseInt(externalUserId ?? "0");

    if (!userId) { res.status(400).json({ message: "Missing externalUserId" }); return; }

    const reviewAnswer = reviewResult?.reviewAnswer;  // "GREEN" | "RED"

    if (reviewAnswer === "GREEN") {
      await db.update(users).set({ kycLevel: "full" }).where(eq(users.id, userId));
      await db.update(userProfiles)
        .set({ kycVerifiedAt: new Date(), kycProviderToken: applicantId })
        .where(eq(userProfiles.userId, userId));
      await insertNotification({
        userId, type: "kyc_approved",
        title: "Identity verified",
        body: "Your KYC verification was approved. You can now withdraw funds.",
        pushUrl: "/wallet",
      });
    } else if (reviewAnswer === "RED") {
      await insertNotification({
        userId, type: "kyc_rejected",
        title: "Verification rejected",
        body: "Your KYC verification was not approved. Please try again or contact support.",
      });
    }

    res.json({ ok: true });
  });

  // ── Payment Webhooks (Stripe) ──────────────────────────────────────────────

  // Raw body needed for Stripe signature verification — mount before JSON middleware
  app.post("/api/webhooks/stripe", async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // In production: verify signature with stripe.webhooks.constructEvent(req.body, sig, secret)
    const event = req.body;

    if (event.type === "payment_intent.payment_failed") {
      const userId = parseInt(event.data?.object?.metadata?.userId ?? "0");
      if (userId) {
        insertNotification({
          userId, type: "payment_failed",
          title: "Payment failed",
          body: "Your payment could not be processed. Please try a different card.",
          pushUrl: "/wallet",
        }).catch(() => {});
      }
    }

    if (event.type === "charge.dispute.created") {
      // Chargeback detected — flag user
      const userId = parseInt(event.data?.object?.metadata?.userId ?? "0");
      if (userId) {
        await db.update(users)
          .set({ status: "suspended" })
          .where(eq(users.id, userId));
        await db.insert(auditLogs).values({
          action: "chargeback_auto_suspend",
          entityType: "user",
          entityId: userId,
          dataAfter: { reason: "chargeback_detected", chargeId: event.data?.object?.id },
        });
      }
    }

    res.json({ received: true });
  });

  // ── Seed initial data (dev only) ──────────────────────────────────────────

  app.post("/api/dev/seed", async (_req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") { res.status(403).json({ message: "Not in production" }); return; }
    try {
      await seedInitialData();
      res.json({ ok: true, message: "Database seeded" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Gamification ──────────────────────────────────────────────────────────

  // GET /api/gamification/me — current user's level, XP and badges
  app.get("/api/gamification/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = await getUserLevel(uid(req), db);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/gamification/award — admin-only: manually award XP to a user
  app.post("/api/gamification/award", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, reason } = z.object({
        userId: z.number().int().positive(),
        reason: z.enum(["entry", "win", "referral", "weekly_sub", "monthly_sub", "deposit"]),
      }).parse(req.body);

      const totalXp = await awardXp(userId, reason, db);
      await checkAndAwardBadges(userId, db);

      await db.insert(auditLogs).values({
        adminUserId: adminUid(req),
        action: "award_xp",
        entityType: "user",
        entityId: userId,
        dataAfter: { reason, xpAwarded: XP[reason], newTotal: totalXp },
      });

      res.json({ ok: true, totalXp });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── Partners ──────────────────────────────────────────────────────────────

  // GET /api/partners — list active partners, optionally filtered by ?countryId
  app.get("/api/partners", async (req: Request, res: Response) => {
    try {
      const countryId = req.query.countryId !== undefined
        ? parseInt(req.query.countryId as string)
        : undefined;

      if (countryId !== undefined && isNaN(countryId)) {
        res.status(400).json({ message: "countryId must be a valid integer" });
        return;
      }

      // Try DB first; fall back to mock data when table is empty
      let dbPartners = await db.select().from(partners).where(eq(partners.isActive, true));
      if (dbPartners.length > 0) {
        if (countryId !== undefined) {
          dbPartners = dbPartners.filter(
            (p) => p.countryId === null || p.countryId === countryId,
          );
        }
        res.json(dbPartners);
      } else {
        const mockPartners = await getPartners(countryId);
        res.json(mockPartners);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/partners/:id — single partner by id
  app.get("/api/partners/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ message: "Invalid partner id" }); return; }

      const partner = await getPartner(id);
      if (!partner) { res.status(404).json({ message: "Partner not found" }); return; }

      res.json(partner);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/partners — create a partner
  app.post("/api/admin/partners", requireAdmin, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        category: z.enum(["food", "retail", "pharmacy", "telecom", "fuel", "entertainment", "electronics", "delivery", "beauty", "fitness", "travel", "finance"]),
        description: z.string().optional(),
        logoUrl: z.string().optional(),
        cashbackPercent: z.number().min(0).max(50),
        countryId: z.number().int().positive().optional(),
        isActive: z.boolean().optional(),
      });
      const body = schema.parse(req.body);

      const [created] = await db.insert(partners).values({
        name: body.name,
        category: body.category,
        description: body.description ?? null,
        logoUrl: body.logoUrl ?? null,
        cashbackPercent: String(body.cashbackPercent),
        countryId: body.countryId ?? null,
        isActive: body.isActive ?? true,
      }).returning();

      await db.insert(auditLogs).values({
        adminUserId: adminUid(req),
        action: "create_partner",
        entityType: "partner",
        entityId: created.id,
        dataAfter: created,
      });

      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // PATCH /api/admin/partners/:id — update partner fields
  app.patch("/api/admin/partners/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ message: "Invalid partner id" }); return; }

      const schema = z.object({
        name: z.string().min(1).optional(),
        category: z.enum(["food", "retail", "pharmacy", "telecom", "fuel", "entertainment", "electronics", "delivery", "beauty", "fitness", "travel", "finance"]).optional(),
        description: z.string().optional(),
        logoUrl: z.string().optional(),
        cashbackPercent: z.number().min(0).max(50).optional(),
        countryId: z.number().int().positive().nullable().optional(),
        isActive: z.boolean().optional(),
      });
      const body = schema.parse(req.body);

      const updateData: Record<string, any> = { ...body };
      if (body.cashbackPercent !== undefined) {
        updateData.cashbackPercent = String(body.cashbackPercent);
      }

      const [updated] = await db.update(partners)
        .set(updateData)
        .where(eq(partners.id, id))
        .returning();

      if (!updated) { res.status(404).json({ message: "Partner not found" }); return; }

      await db.insert(auditLogs).values({
        adminUserId: adminUid(req),
        action: "update_partner",
        entityType: "partner",
        entityId: id,
        dataAfter: updated,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // DELETE /api/admin/partners/:id — soft-delete (set isActive=false)
  app.delete("/api/admin/partners/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ message: "Invalid partner id" }); return; }

      const [deactivated] = await db.update(partners)
        .set({ isActive: false })
        .where(eq(partners.id, id))
        .returning();

      if (!deactivated) { res.status(404).json({ message: "Partner not found" }); return; }

      await db.insert(auditLogs).values({
        adminUserId: adminUid(req),
        action: "deactivate_partner",
        entityType: "partner",
        entityId: id,
        dataAfter: { isActive: false },
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── HTTP + WebSocket server ───────────────────────────────────────────────

  const httpServer = createServer(app);
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "connected", message: "VIONA realtime connected" }));
  });

  return httpServer;
}

// ─── Seed helper ─────────────────────────────────────────────────────────────

async function seedInitialData() {
  const existing = await db.select().from(countries).where(eq(countries.code, "UA"));
  if (existing.length > 0) return;

  await db.insert(countries).values([
    {
      code: "UA", name: "Ukraine", currency: "UAH", currencySymbol: "₴", locale: "uk-UA",
      entryAmountDaily: "5.00", entryAmountWeekly: "35.00", entryAmountMonthly: "150.00",
      prizePercentage: "50", drawHourUtc: 21, isActive: true,
    },
    {
      code: "US", name: "United States", currency: "USD", currencySymbol: "$", locale: "en-US",
      entryAmountDaily: "2.00", entryAmountWeekly: "14.00", entryAmountMonthly: "55.00",
      prizePercentage: "50", drawHourUtc: 23, isActive: true,
    },
    {
      code: "PH", name: "Philippines", currency: "PHP", currencySymbol: "₱", locale: "en-PH",
      entryAmountDaily: "8.00", entryAmountWeekly: "56.00", entryAmountMonthly: "220.00",
      prizePercentage: "50", drawHourUtc: 15, isActive: true,
    },
    {
      code: "IN", name: "India", currency: "INR", currencySymbol: "₹", locale: "en-IN",
      entryAmountDaily: "10.00", entryAmountWeekly: "70.00", entryAmountMonthly: "280.00",
      prizePercentage: "50", drawHourUtc: 17, isActive: true,
    },
    {
      code: "BR", name: "Brazil", currency: "BRL", currencySymbol: "R$", locale: "pt-BR",
      entryAmountDaily: "2.00", entryAmountWeekly: "14.00", entryAmountMonthly: "55.00",
      prizePercentage: "50", drawHourUtc: 22, isActive: true,
    },
  ]);

  // Create default admin
  const adminExists = await db.select().from(adminUsers).where(eq(adminUsers.email, "admin@viona.app"));
  if (!adminExists.length) {
    const passwordHash = await bcrypt.hash("admin123", 12);
    await db.insert(adminUsers).values({
      email: "admin@viona.app",
      passwordHash,
      role: "superadmin",
      isActive: true,
    });
  }

  // Seed demo partners
  const partnersExist = await db.select().from(partners).limit(1);
  if (!partnersExist.length) {
    await db.insert(partners).values([
      {
        name: "ROZETKA", category: "electronics", cashbackPercent: "3.00",
        description: "Ukraine's largest online electronics retailer. Pay with VIONA balance at checkout.",
        isActive: true,
      },
      {
        name: "Nova Poshta", category: "delivery", cashbackPercent: "2.00",
        description: "Send packages across Ukraine and internationally. Pay shipping fees with your balance.",
        isActive: true,
      },
      {
        name: "Silpo", category: "food", cashbackPercent: "1.50",
        description: "Premium supermarket chain. Earn cashback on every grocery purchase.",
        isActive: true,
      },
      {
        name: "OKKO Petrol", category: "fuel", cashbackPercent: "2.50",
        description: "Fill up your tank at OKKO stations and earn cashback with every liter.",
        isActive: true,
      },
      {
        name: "EVA", category: "beauty", cashbackPercent: "4.00",
        description: "Cosmetics and personal care. Earn 4% cashback on all beauty purchases.",
        isActive: true,
      },
      {
        name: "Comfy", category: "electronics", cashbackPercent: "2.00",
        description: "Household appliances and gadgets. Use your VIONA balance online or in-store.",
        isActive: true,
      },
    ]);
  }
}

// ─── Sanitize user for client ─────────────────────────────────────────────────

function sanitizeUser(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}
