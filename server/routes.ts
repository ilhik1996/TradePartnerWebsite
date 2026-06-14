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
import { createApplicant, getSdkToken, sumsubConfigured } from "./modules/kyc";
import { authRateLimit, apiRateLimit, paymentRateLimit, deviceFingerprint, detectSuspicious, verifyStripeSignature, verifyKycSignature, securityHeaders } from "./middleware/security";
import {
  users, userProfiles, countries, draws, drawEntries, wallets, transactions,
  responsibleGaming, notifications, adminUsers, auditLogs, petitionSignatures,
  subscriptions, referrals, partners, pushSubscriptions,
  insertUserSchema, loginSchema, freeEntrySchema,
} from "@shared/schema";
import { eq, desc, and, sql, inArray, count, gte, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIntParam(value: string, res: Response): number | null {
  const n = parseInt(value, 10);
  if (isNaN(n)) { res.status(400).json({ message: "Invalid numeric parameter" }); return null; }
  return n;
}

// Wrap async route handlers so unhandled rejections return 500 instead of crashing.
// ZodError (validation failure) maps to 400; all other errors map to 500.
function ar(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response) =>
    fn(req, res).catch((err: any) => {
      if (!res.headersSent) {
        const isZod = err?.name === "ZodError";
        res.status(isZod ? 400 : 500).json({ message: isZod ? (err.errors?.[0]?.message ?? err.message) : err.message });
      }
    });
}

// Credit the referrer's wallet on the referee's first successful deposit.
// Safe to call multiple times — the referral row's status guards against double-payment.
async function creditReferralBonus(refereeId: number): Promise<void> {
  const [referee] = await db
    .select({ referredBy: users.referredBy, currency: countries.currency, currencySymbol: countries.currencySymbol })
    .from(users)
    .leftJoin(countries, eq(countries.id, users.countryId))
    .where(eq(users.id, refereeId));
  if (!referee?.referredBy) return;

  // Find the pending referral record for this referee
  const [ref] = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.refereeId, refereeId), eq(referrals.status, "pending")));
  if (!ref) return;

  // Check this is the referee's FIRST completed deposit
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(transactions)
    .where(and(eq(transactions.userId, refereeId), eq(transactions.type, "deposit"), eq(transactions.status, "completed")));
  if (Number(cnt) !== 1) return;   // not the first deposit

  const bonus = parseFloat(ref.bonusAmount as string);

  await db.transaction(async (tx) => {
    // Mark referral as paid first (idempotency guard)
    const [claimed] = await tx
      .update(referrals)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(referrals.id, ref.id), eq(referrals.status, "pending")))
      .returning({ id: referrals.id });
    if (!claimed) return;   // already processed by a concurrent call

    // Credit referrer wallet
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, ref.referrerId))
      .for("update");
    if (!wallet) return;

    const newBalance = parseFloat(wallet.balance as string) + bonus;
    await tx.update(wallets)
      .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
      .where(eq(wallets.userId, ref.referrerId));

    await tx.insert(transactions).values({
      walletId: wallet.id,
      userId: ref.referrerId,
      type: "referral_bonus",
      amount: bonus.toFixed(2),
      balanceAfter: newBalance.toFixed(2),
      description: `Referral bonus for inviting user #${refereeId}`,
      status: "completed",
      metadata: { referralId: ref.id, refereeId },
    });
  });

  insertNotification({
    userId: ref.referrerId,
    type: "referral_bonus",
    title: "Referral bonus credited!",
    body: `${referee.currencySymbol ?? ""}${bonus.toFixed(2)} added to your balance — your friend made their first deposit.`,
    pushUrl: "/wallet",
  }).catch(() => {});

  // Broadcast so the referrer's wallet page refreshes in real-time if open
  broadcast({ type: "referral_bonus" });
}

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

  // Security headers on every response
  app.use(securityHeaders);

  // Apply device fingerprint to every request
  app.use(deviceFingerprint);

  // General API rate limit
  app.use("/api", apiRateLimit);

  // ── Health check ─────────────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", authRateLimit, ar(async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const { password, email, phone, countryId } = data;
      const autoParticipate = req.body.autoParticipate !== false;

      // Check uniqueness — but allow upgrading a guest account created by free-entry (AMOE)
      if (email) {
        const [ex] = await db.select().from(users).where(eq(users.email, email));
        if (ex) {
          if (!ex.isGuest) { res.status(409).json({ message: "Email already registered" }); return; }

          // Upgrade guest → real account: set a real password, opt-in to autoParticipate, clear guest flag
          const passwordHash = await bcrypt.hash(password, 12);
          const country = countryId
            ? await db.select().from(countries).where(eq(countries.id, countryId)).then(r => r[0])
            : await db.select().from(countries).where(eq(countries.code, "UA")).then(r => r[0]);

          const [upgraded] = await db.update(users).set({
            passwordHash,
            countryId: country?.id ?? ex.countryId,
            autoParticipate,
            isGuest: false,
          }).where(and(eq(users.id, ex.id), eq(users.isGuest, true))).returning();

          if (!upgraded) { res.status(409).json({ message: "Email already registered" }); return; }

          // Ensure wallet & responsible gaming rows exist (may already exist from free-entry)
          if (country) await getOrCreateWallet(upgraded.id, country.currency);
          const [rgRow] = await db.select().from(responsibleGaming).where(eq(responsibleGaming.userId, upgraded.id));
          if (!rgRow) await db.insert(responsibleGaming).values({ userId: upgraded.id, notificationFrequencyHours: 24 });

          const token = signToken({ userId: upgraded.id });
          if (upgraded.email) sendWelcomeEmail(upgraded.email).catch(() => {});
          res.status(201).json({ token, user: sanitizeUser(upgraded) });
          return;
        }
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
  }));

  app.post("/api/auth/login", authRateLimit, ar(async (req: Request, res: Response) => {
    try {
      const { identifier, password } = loginSchema.parse(req.body);
      let [user] = await db.select().from(users).where(
        identifier.includes("@") ? eq(users.email, identifier) : eq(users.phone, identifier)
      );
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }
      if (user.status === "banned") {
        res.status(403).json({ message: "Account permanently suspended" });
        return;
      }
      if (user.status === "suspended") {
        res.status(403).json({ message: "Account suspended" });
        return;
      }
      if (user.status === "self_excluded") {
        // Check whether the exclusion period has expired
        const [rg] = await db.select({ selfExcludedUntil: responsibleGaming.selfExcludedUntil })
          .from(responsibleGaming).where(eq(responsibleGaming.userId, user.id));
        const until = rg?.selfExcludedUntil ? new Date(rg.selfExcludedUntil) : null;
        if (!until || until > new Date()) {
          const untilStr = until ? until.toLocaleDateString() : "an indefinite period";
          res.status(403).json({ message: `You have self-excluded until ${untilStr}. Contact support to appeal.` });
          return;
        }
        // Exclusion has expired — automatically reinstate the account
        await db.update(users).set({ status: "active" }).where(eq(users.id, user.id));
        user = { ...user, status: "active" as const };
      }
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      const token = signToken({ userId: user.id });
      res.json({ token, user: sanitizeUser(user) });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }));

  app.get("/api/auth/me", requireAuth, ar(async (req: Request, res: Response) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, uid(req)));
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      res.json(sanitizeUser(user));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  }));

  // ── Countries ─────────────────────────────────────────────────────────────

  app.get("/api/countries", ar(async (_req: Request, res: Response) => {
    try {
      const list = await db.select().from(countries).where(eq(countries.isActive, true));
      res.json(list);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  }));

  app.get("/api/countries/:id", ar(async (req: Request, res: Response) => {
    try {
      const id = parseIntParam(req.params.id, res); if (id === null) return;
      const [country] = await db.select().from(countries).where(eq(countries.id, id));
      if (!country) { res.status(404).json({ message: "Country not found" }); return; }
      res.json(country);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  }));

  // ── Draws ─────────────────────────────────────────────────────────────────

  // Today's draw for a country
  app.get("/api/draws/today/:countryId", ar(async (req: Request, res: Response) => {
    try {
      const countryId = parseIntParam(req.params.countryId, res); if (countryId === null) return;
      const draw = await getOrCreateDraw(countryId, todayDateString());
      const entries = await db.select().from(drawEntries).where(eq(drawEntries.drawId, draw.id));
      // winnerUserId must never be sent to clients — only expose the ticket number
      const { winnerUserId: _omit, ...publicDraw } = draw;
      res.json({ ...publicDraw, entriesCount: entries.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }));

  // List past draws for a country (winnerUserId is never sent — only boolean isWinner for the requesting user)
  app.get("/api/draws/history/:countryId", ar(async (req: Request, res: Response) => {
    const countryId = parseIntParam(req.params.countryId, res); if (countryId === null) return;
    const list = await db.select({
      id: draws.id,
      countryId: draws.countryId,
      drawDate: draws.drawDate,
      status: draws.status,
      totalPool: draws.totalPool,
      prizeAmount: draws.prizeAmount,
      winnerTicketNumber: draws.winnerTicketNumber,
      totalEntries: draws.totalEntries,
      rngSeed: draws.rngSeed,
      rngProof: draws.rngProof,
      completedAt: draws.completedAt,
      createdAt: draws.createdAt,
    }).from(draws)
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
          const [entries, rawDraws] = await Promise.all([
            db.select().from(drawEntries)
              .where(and(eq(drawEntries.userId, userId), inArray(drawEntries.drawId, drawIds))),
            db.select({ id: draws.id, winnerUserId: draws.winnerUserId })
              .from(draws).where(inArray(draws.id, drawIds)),
          ]);
          const entryMap = Object.fromEntries(entries.map(e => [e.drawId, e]));
          const winnerMap = Object.fromEntries(rawDraws.map(d => [d.id, d.winnerUserId]));
          return res.json(list.map(d => ({
            ...d,
            myEntry: entryMap[d.id] ?? null,
            isWinner: winnerMap[d.id] === userId,
          })));
        }
      } catch {}
    }

    res.json(list);
  }));

  // Public provably-fair RNG verification — no auth required
  // Anyone can re-compute the winner from the published proof without knowing the server secret.
  app.get("/api/draws/:drawId/verify", ar(async (req: Request, res: Response) => {
    const drawId = parseIntParam(req.params.drawId, res); if (drawId === null) return;
    const [draw] = await db
      .select({
        id: draws.id,
        drawDate: draws.drawDate,
        status: draws.status,
        totalEntries: draws.totalEntries,
        totalPool: draws.totalPool,
        prizeAmount: draws.prizeAmount,
        winnerTicketNumber: draws.winnerTicketNumber,
        rngSeed: draws.rngSeed,
        rngProof: draws.rngProof,
        completedAt: draws.completedAt,
        countryId: draws.countryId,
      })
      .from(draws)
      .where(eq(draws.id, drawId));

    if (!draw) { res.status(404).json({ message: "Draw not found" }); return; }
    if (draw.status !== "completed") {
      res.json({ drawId, status: draw.status, message: "Draw not yet completed — no proof available" });
      return;
    }

    // Explain how to independently verify:
    // 1. Compute SHA-256( "viona:draw:{id}:entries:{total}:secret:{DRAW_SECRET}" ) → seedHash
    // 2. Verify seedHash === rngSeed
    // 3. winnerTicket = (parseInt(seedHash.slice(0,8), 16) % totalEntries) + 1
    // 4. Compute SHA-256( seedHash + drawId ) → should equal rngProof
    res.json({
      drawId: draw.id,
      drawDate: draw.drawDate,
      totalEntries: draw.totalEntries,
      totalPool: draw.totalPool,
      prizeAmount: draw.prizeAmount,
      winnerTicket: draw.winnerTicketNumber,
      rngSeed: draw.rngSeed,
      rngProof: draw.rngProof,
      completedAt: draw.completedAt,
      verificationInstructions: {
        step1: "Compute SHA-256('viona:draw:{id}:entries:{totalEntries}:secret:{DRAW_SECRET}') — the result must equal rngSeed",
        step2: "Compute SHA-256(rngSeed + drawId) — the result must equal rngProof (verifiable without the server secret)",
        step3: "winnerTicket = (parseInt(rngSeed.slice(0,8), 16) % totalEntries) + 1",
        note: "rngProof can be verified publicly. rngSeed verification requires DRAW_SECRET which is published after each draw period ends.",
      },
    });
  }));

  // Paid entry
  app.post("/api/draws/:drawId/enter", requireAuth, ar(async (req: Request, res: Response) => {
    try {
      const drawId = parseIntParam(req.params.drawId, res); if (drawId === null) return;
      const result = await addPaidEntry(uid(req), drawId);
      const draw = await db.select().from(draws).where(eq(draws.id, drawId)).then(r => r[0]);
      broadcast({ type: "draw_pool_update", drawId: draw.id, totalPool: draw.totalPool, totalEntries: draw.totalEntries });
      // Award XP non-blocking
      awardXp(uid(req), 'entry', db).then(() => checkAndAwardBadges(uid(req), db)).catch(() => {});
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }));

  // Free entry (AMOE) — for users without account or without funds
  app.post("/api/draws/:drawId/enter-free", ar(async (req: Request, res: Response) => {
    try {
      const drawId = parseIntParam(req.params.drawId, res); if (drawId === null) return;
      const body = freeEntrySchema.parse({ ...req.body, drawId });
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
          isGuest: true,
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
  }));

  // Check my entry for today's draw
  app.get("/api/draws/:drawId/my-entry", requireAuth, ar(async (req: Request, res: Response) => {
    const drawId = parseIntParam(req.params.drawId, res); if (drawId === null) return;
    const [entry] = await db.select().from(drawEntries)
      .where(and(eq(drawEntries.drawId, drawId), eq(drawEntries.userId, uid(req))));
    res.json(entry ?? null);
  }));

  // ── Wallet ────────────────────────────────────────────────────────────────

  app.get("/api/wallet", requireAuth, ar(async (req: Request, res: Response) => {
    try {
      const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, uid(req)));
      res.json(wallet ?? null);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  }));

  app.get("/api/wallet/transactions", requireAuth, ar(async (req: Request, res: Response) => {
    try {
      const limit = parseInt((req.query.limit as string) || "20");
      const offset = parseInt((req.query.offset as string) || "0");
      const txs = await getTransactionHistory(uid(req), limit, offset);
      res.json(txs);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  }));

  // Deposit via payment provider (Stripe / mock in dev)
  app.post("/api/wallet/deposit", requireAuth, paymentRateLimit, ar(async (req: Request, res: Response) => {
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

      // Responsible gaming: enforce deposit limits
      const [rg] = await db.select({
        dailyLimit: responsibleGaming.dailyLimitAmount,
        weeklyLimit: responsibleGaming.weeklyLimitAmount,
        monthlyLimit: responsibleGaming.monthlyLimitAmount,
      }).from(responsibleGaming).where(eq(responsibleGaming.userId, uid(req)));

      if (rg) {
        const now = new Date();

        const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
        const startOfWeek = new Date(now);
        startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay()); startOfWeek.setUTCHours(0, 0, 0, 0);
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

        const periodChecks: Array<{ limit: string | null; since: Date; label: string }> = [
          { limit: rg.dailyLimit as string | null, since: startOfDay, label: "daily" },
          { limit: rg.weeklyLimit as string | null, since: startOfWeek, label: "weekly" },
          { limit: rg.monthlyLimit as string | null, since: startOfMonth, label: "monthly" },
        ];

        for (const { limit, since, label } of periodChecks) {
          if (!limit) continue;
          const maxAmt = parseFloat(limit);
          const [{ spent }] = await db
            .select({ spent: sum(transactions.amount) })
            .from(transactions)
            .where(and(
              eq(transactions.userId, uid(req)),
              eq(transactions.type, "deposit"),
              eq(transactions.status, "completed"),
              gte(transactions.createdAt, since),
            ));
          const spentSoFar = parseFloat(spent ?? "0");
          if (spentSoFar + amount > maxAmt) {
            res.status(403).json({
              message: `This deposit would exceed your ${label} spending limit of ${maxAmt.toFixed(2)}. Spent so far: ${spentSoFar.toFixed(2)}.`,
              code: "RG_LIMIT_EXCEEDED",
            });
            return;
          }
        }
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

      // Non-blocking post-deposit side-effects
      const depositUserId = uid(req);
      awardXp(depositUserId, 'deposit', db).then(() => checkAndAwardBadges(depositUserId, db)).catch(() => {});
      creditReferralBonus(depositUserId).catch(() => {});

      res.json({ ok: true, transactionId: result.transactionId });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }));

  // Withdrawal request
  app.post("/api/wallet/withdraw", requireAuth, ar(async (req: Request, res: Response) => {
    try {
      const { amount } = z.object({ amount: z.number().positive().max(50000) }).parse(req.body);

      const [user] = await db.select({ kycLevel: users.kycLevel, email: users.email })
        .from(users).where(eq(users.id, uid(req)));
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      if (user.kycLevel !== "full") {
        res.status(403).json({ message: "Full KYC required to withdraw funds" });
        return;
      }

      const { tx, newBalance, currency } = await db.transaction(async (txn) => {
        const [wallet] = await txn.select().from(wallets).where(eq(wallets.userId, uid(req))).for("update");
        if (!wallet) throw new Error("Wallet not found");

        const balance = parseFloat(wallet.balance as string);
        if (balance < amount) throw new Error("Insufficient balance");

        const newBalance = balance - amount;
        await txn.update(wallets)
          .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
          .where(eq(wallets.userId, uid(req)));

        const [tx] = await txn.insert(transactions).values({
          walletId: wallet.id,
          userId: uid(req),
          type: "withdrawal",
          amount: (-amount).toFixed(2),
          balanceAfter: newBalance.toFixed(2),
          status: "pending",
          description: `Withdrawal request ${wallet.currency} ${amount.toFixed(2)}`,
        }).returning();

        return { tx, newBalance, currency: wallet.currency };
      });

      if (user.email) {
        sendWithdrawalConfirmationEmail(user.email, amount.toFixed(2), currency).catch(() => {});
      }

      res.json({ transaction: tx, newBalance });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }));

  // ── User Profile & Settings ───────────────────────────────────────────────

  app.get("/api/profile", requireAuth, ar(async (req, res) => {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, uid(req)));
    res.json(profile ?? null);
  }));

  app.patch("/api/profile", requireAuth, ar(async (req, res) => {
    const { firstName, lastName } = z.object({
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
    }).parse(req.body);
    await db.update(userProfiles).set({ firstName, lastName }).where(eq(userProfiles.userId, uid(req)));
    res.json({ ok: true });
  }));

  // Toggle auto-participate
  app.patch("/api/settings/auto-participate", requireAuth, ar(async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await db.update(users).set({ autoParticipate: enabled }).where(eq(users.id, uid(req)));
    res.json({ autoParticipate: enabled });
  }));

  // Responsible gaming settings — includes current period spending totals
  app.get("/api/settings/responsible-gaming", requireAuth, ar(async (req, res) => {
    const [rg] = await db.select().from(responsibleGaming).where(eq(responsibleGaming.userId, uid(req)));
    if (!rg) { res.json(null); return; }

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay()); startOfWeek.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [daily, weekly, monthly] = await Promise.all([
      db.select({ spent: sum(transactions.amount) }).from(transactions)
        .where(and(eq(transactions.userId, uid(req)), eq(transactions.type, "deposit"), eq(transactions.status, "completed"), gte(transactions.createdAt, startOfDay))),
      db.select({ spent: sum(transactions.amount) }).from(transactions)
        .where(and(eq(transactions.userId, uid(req)), eq(transactions.type, "deposit"), eq(transactions.status, "completed"), gte(transactions.createdAt, startOfWeek))),
      db.select({ spent: sum(transactions.amount) }).from(transactions)
        .where(and(eq(transactions.userId, uid(req)), eq(transactions.type, "deposit"), eq(transactions.status, "completed"), gte(transactions.createdAt, startOfMonth))),
    ]);

    res.json({
      ...rg,
      spentToday: parseFloat(daily[0]?.spent ?? "0"),
      spentThisWeek: parseFloat(weekly[0]?.spent ?? "0"),
      spentThisMonth: parseFloat(monthly[0]?.spent ?? "0"),
    });
  }));

  app.patch("/api/settings/responsible-gaming", requireAuth, ar(async (req, res) => {
    const data = z.object({
      dailyLimitAmount: z.number().positive().nullable().optional(),
      weeklyLimitAmount: z.number().positive().nullable().optional(),
      monthlyLimitAmount: z.number().positive().nullable().optional(),
    }).parse(req.body);
    await db.update(responsibleGaming).set({
      dailyLimitAmount: data.dailyLimitAmount?.toFixed(2) ?? null,
      weeklyLimitAmount: data.weeklyLimitAmount?.toFixed(2) ?? null,
      monthlyLimitAmount: data.monthlyLimitAmount?.toFixed(2) ?? null,
      updatedAt: new Date(),
    }).where(eq(responsibleGaming.userId, uid(req)));
    res.json({ ok: true });
  }));

  // Self-exclusion
  app.post("/api/settings/self-exclude", requireAuth, ar(async (req, res) => {
    const { days } = z.object({ days: z.number().int().min(1).max(365) }).parse(req.body);
    const until = new Date();
    until.setDate(until.getDate() + days);
    await db.update(responsibleGaming)
      .set({ selfExcludedUntil: until, updatedAt: new Date() })
      .where(eq(responsibleGaming.userId, uid(req)));
    await db.update(users).set({ status: "self_excluded" }).where(eq(users.id, uid(req)));
    res.json({ selfExcludedUntil: until });
  }));

  // ── Notifications ─────────────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth, ar(async (req, res) => {
    const list = await db.select().from(notifications)
      .where(eq(notifications.userId, uid(req)))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
    res.json(list);
  }));

  app.patch("/api/notifications/:id/read", requireAuth, ar(async (req, res) => {
    const id = parseIntParam(req.params.id, res); if (id === null) return;
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, uid(req))));
    res.json({ ok: true });
  }));

  // ── Subscriptions ─────────────────────────────────────────────────────────

  app.get("/api/subscription", requireAuth, ar(async (req, res) => {
    const sub = await getActiveSubscription(uid(req));
    res.json(sub);
  }));

  app.post("/api/subscription", requireAuth, paymentRateLimit, ar(async (req: Request, res: Response) => {
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
  }));

  app.delete("/api/subscription/:id", requireAuth, ar(async (req: Request, res: Response) => {
    try {
      const id = parseIntParam(req.params.id, res); if (id === null) return;
      const result = await cancelSubscription(uid(req), id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }));

  // Subscription history
  app.get("/api/subscription/history", requireAuth, ar(async (req, res) => {
    const list = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, uid(req)))
      .orderBy(desc(subscriptions.createdAt))
      .limit(20);
    res.json(list);
  }));

  // ── Referrals ──────────────────────────────────────────────────────────────

  // Get my referral code + stats
  app.get("/api/referrals/my", requireAuth, ar(async (req, res) => {
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
  }));

  // Apply referral code during / after registration
  app.post("/api/referrals/apply", requireAuth, ar(async (req: Request, res: Response) => {
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
  }));

  // ── Petition ──────────────────────────────────────────────────────────────

  app.post("/api/petition/sign", requireAuth, ar(async (req: Request, res: Response) => {
    try {
      const { firstName, countryCode } = z.object({
        firstName: z.string().min(1).max(100),
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
  }));

  app.delete("/api/petition/sign", requireAuth, ar(async (req: Request, res: Response) => {
    await db.update(petitionSignatures)
      .set({ revokedAt: new Date() })
      .where(eq(petitionSignatures.userId, uid(req)));
    res.json({ ok: true });
  }));

  // ── Admin Auth ─────────────────────────────────────────────────────────────

  app.post("/api/admin/login", authRateLimit, ar(async (req: Request, res: Response) => {
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
  }));

  // ── Admin: Countries ──────────────────────────────────────────────────────

  app.get("/api/admin/countries", requireAdmin, ar(async (_req, res) => {
    const list = await db.select().from(countries).orderBy(countries.name);
    res.json(list);
  }));

  app.post("/api/admin/countries", requireAdmin, ar(async (req: Request, res: Response) => {
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
  }));

  app.patch("/api/admin/countries/:id", requireAdmin, ar(async (req: Request, res: Response) => {
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
      const countryParamId = parseIntParam(req.params.id, res); if (countryParamId === null) return;
      const [country] = await db.update(countries).set(updateData).where(eq(countries.id, countryParamId)).returning();
      if (!country) { res.status(404).json({ message: "Country not found" }); return; }
      res.json(country);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }));

  // ── Admin: Draws ──────────────────────────────────────────────────────────

  app.get("/api/admin/draws", requireAdmin, ar(async (req: Request, res: Response) => {
    const list = await db.select().from(draws).orderBy(desc(draws.createdAt)).limit(50);
    res.json(list);
  }));

  app.post("/api/admin/draws", requireAdmin, ar(async (req: Request, res: Response) => {
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
  }));

  app.post("/api/admin/draws/:id/conduct", requireAdmin, ar(async (req: Request, res: Response) => {
    try {
      const drawParamId = parseIntParam(req.params.id, res); if (drawParamId === null) return;
      const result = await conductDraw(drawParamId);
      await db.insert(auditLogs).values({
        adminUserId: adminUid(req),
        action: "conduct_draw",
        entityType: "draw",
        entityId: drawParamId,
        dataAfter: result,
      });
      if (result) {
        broadcast({ type: "draw_completed", drawId: result.drawId, prizeAmount: result.prizeAmount });
        if (result.winnerUserId) {
          awardXp(result.winnerUserId, 'win', db).then(() => checkAndAwardBadges(result.winnerUserId, db)).catch(() => {});
        }
      }
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }));

  // ── Admin: Users ──────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireAdmin, ar(async (req, res) => {
    const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
    const offset = parseInt((req.query.offset as string) || "0");
    const search = (req.query.search as string)?.trim() ?? "";
    const kycFilter = req.query.kyc as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [];
    if (kycFilter) conditions.push(eq(users.kycLevel, kycFilter as any));
    if (statusFilter) conditions.push(eq(users.status, statusFilter as any));

    const base = db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        status: users.status,
        kycLevel: users.kycLevel,
        isGuest: users.isGuest,
        createdAt: users.createdAt,
        countryId: users.countryId,
        referralCode: users.referralCode,
        balance: wallets.balance,
        currency: wallets.currency,
        firstName: userProfiles.firstName,
        lastName: userProfiles.lastName,
      })
      .from(users)
      .leftJoin(wallets, eq(wallets.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id));

    const filtered = conditions.length
      ? base.where(and(...conditions))
      : base;

    let list = await filtered.orderBy(desc(users.createdAt)).limit(limit).offset(offset);

    // Client-side search filter on email / phone / name (avoids complex SQL LIKE across providers)
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.email?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q) ||
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q)
      );
    }

    res.json(list);
  }));

  app.patch("/api/admin/users/:id/status", requireAdmin, ar(async (req, res) => {
    const userParamId = parseIntParam(req.params.id, res); if (userParamId === null) return;
    const { status } = z.object({ status: z.enum(["active", "suspended", "banned"]) }).parse(req.body);
    const [user] = await db.update(users).set({ status }).where(eq(users.id, userParamId)).returning();
    await db.insert(auditLogs).values({
      adminUserId: adminUid(req),
      action: "update_user_status",
      entityType: "user",
      entityId: user.id,
      dataAfter: { status },
    });
    res.json(user);
  }));

  // ── Admin: Financials ─────────────────────────────────────────────────────

  app.get("/api/admin/transactions", requireAdmin, ar(async (req, res) => {
    const list = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(100);
    res.json(list);
  }));

  // ── Admin: Withdrawals ────────────────────────────────────────────────────

  app.get("/api/admin/withdrawals", requireAdmin, ar(async (_req, res) => {
    const pending = await db.select({
      id: transactions.id,
      userId: transactions.userId,
      amount: transactions.amount,
      status: transactions.status,
      description: transactions.description,
      createdAt: transactions.createdAt,
      email: users.email,
    })
      .from(transactions)
      .leftJoin(users, eq(users.id, transactions.userId))
      .where(and(eq(transactions.type, "withdrawal"), eq(transactions.status, "pending")))
      .orderBy(desc(transactions.createdAt));
    res.json(pending);
  }));

  app.post("/api/admin/withdrawals/:id/approve", requireAdmin, ar(async (req: Request, res: Response) => {
    const txId = parseIntParam(req.params.id, res); if (txId === null) return;
    const [tx] = await db.select().from(transactions)
      .where(and(eq(transactions.id, txId), eq(transactions.type, "withdrawal"), eq(transactions.status, "pending")));
    if (!tx) { res.status(404).json({ message: "Pending withdrawal not found" }); return; }

    await db.update(transactions).set({ status: "completed" }).where(eq(transactions.id, txId));
    await db.insert(auditLogs).values({
      adminUserId: adminUid(req),
      action: "withdrawal_approved",
      entityType: "transaction",
      entityId: txId,
      dataAfter: { amount: tx.amount },
    });
    await insertNotification({
      userId: tx.userId!,
      type: "withdrawal_processed",
      title: "Withdrawal processed",
      body: `Your withdrawal of ${Math.abs(parseFloat(tx.amount as string)).toFixed(2)} has been sent to your bank account.`,
      pushUrl: "/wallet",
    }).catch(() => {});
    res.json({ ok: true });
  }));

  app.post("/api/admin/withdrawals/:id/reject", requireAdmin, ar(async (req: Request, res: Response) => {
    const txId = parseIntParam(req.params.id, res); if (txId === null) return;
    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body);
    const [tx] = await db.select().from(transactions)
      .where(and(eq(transactions.id, txId), eq(transactions.type, "withdrawal"), eq(transactions.status, "pending")));
    if (!tx) { res.status(404).json({ message: "Pending withdrawal not found" }); return; }

    // Refund balance atomically
    await db.transaction(async (txn) => {
      const [wallet] = await txn.select().from(wallets).where(eq(wallets.userId, tx.userId!)).for("update");
      if (wallet) {
        const refundAmount = Math.abs(parseFloat(tx.amount as string));
        const newBalance = parseFloat(wallet.balance as string) + refundAmount;
        await txn.update(wallets).set({ balance: newBalance.toFixed(2), updatedAt: new Date() }).where(eq(wallets.id, wallet.id));
        await txn.insert(transactions).values({
          walletId: wallet.id,
          userId: tx.userId!,
          type: "refund",
          amount: refundAmount.toFixed(2),
          balanceAfter: newBalance.toFixed(2),
          status: "completed",
          description: `Withdrawal refund: ${reason ?? "rejected by admin"}`,
          metadata: { originalTxId: txId },
        });
      }
      await txn.update(transactions).set({ status: "failed" }).where(eq(transactions.id, txId));
    });

    await db.insert(auditLogs).values({
      adminUserId: adminUid(req),
      action: "withdrawal_rejected",
      entityType: "transaction",
      entityId: txId,
      dataAfter: { reason: reason ?? "no reason given" },
    });
    await insertNotification({
      userId: tx.userId!,
      type: "withdrawal_rejected",
      title: "Withdrawal rejected",
      body: `Your withdrawal could not be processed${reason ? `: ${reason}` : ". Your balance has been refunded."}`,
      pushUrl: "/wallet",
    }).catch(() => {});
    res.json({ ok: true });
  }));

  // Public platform stats for landing page
  app.get("/api/stats", ar(async (_req: Request, res: Response) => {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [drawCount] = await db.select({ count: sql<number>`count(*)` }).from(draws).where(eq(draws.status, "completed"));
    const [totalPrizes] = await db.select({ total: sql<number>`coalesce(sum(amount),0)` })
      .from(transactions).where(eq(transactions.type, "prize_payout"));
    res.json({
      totalUsers: userCount.count,
      completedDraws: drawCount.count,
      totalPrizesPaid: totalPrizes.total,
    });
  }));

  app.get("/api/admin/stats", requireAdmin, ar(async (_req, res) => {
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
  }));

  // ── Admin: Petition ───────────────────────────────────────────────────────

  app.get("/api/admin/petition", requireAdmin, ar(async (_req, res) => {
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
  }));

  // Public petition count (no auth needed — for landing page display)
  app.get("/api/petition/count", ar(async (_req, res) => {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(petitionSignatures)
      .where(sql`revoked_at IS NULL`);
    res.json({ count: row.count });
  }));

  // ── Admin: Audit Log ──────────────────────────────────────────────────────

  app.get("/api/admin/audit-logs", requireAdmin, ar(async (_req, res) => {
    const list = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
    res.json(list);
  }));

  // ── Web Push ─────────────────────────────────────────────────────────────

  // Return VAPID public key so the browser can subscribe
  app.get("/api/push/vapid-key", (_req: Request, res: Response) => {
    if (!VAPID_PUBLIC_KEY) { res.status(503).json({ message: "Push not configured" }); return; }
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  // Store push subscription
  app.post("/api/push/subscribe", requireAuth, ar(async (req: Request, res: Response) => {
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
  }));

  // ── KYC initiation ───────────────────────────────────────────────────────

  app.post("/api/kyc/start", requireAuth, ar(async (req: Request, res: Response) => {
    const { level, dateOfBirth } = z.object({
      level: z.enum(["age", "full"]),
      dateOfBirth: z.string().optional(),
    }).parse(req.body);

    const userId = uid(req);
    const [user] = await db
      .select({ kycLevel: users.kycLevel, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) { res.status(404).json({ message: "User not found" }); return; }

    if (level === "age") {
      if (user.kycLevel !== "none") { res.status(400).json({ message: "Already verified" }); return; }

      if (dateOfBirth) {
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) { res.status(400).json({ message: "Invalid date of birth" }); return; }
        const ageYears = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (ageYears < 18) { res.status(400).json({ message: "You must be 18 or older to participate" }); return; }
      }

      if (sumsubConfigured()) {
        // Real flow: create applicant + return short-lived SDK token
        const externalUserId = String(userId);
        await createApplicant({ externalUserId, email: user.email ?? undefined, dateOfBirth, levelName: "age-kyc-level" });
        const { token } = await getSdkToken({ externalUserId, levelName: "age-kyc-level" });
        // kycLevel stays "none" until the webhook confirms approval
        res.json({ ok: true, sdkToken: token, mode: "sumsub" });
      } else {
        // Dev/demo: auto-approve without real KYC provider
        await db.update(users).set({ kycLevel: "age_verified" }).where(eq(users.id, userId));
        await insertNotification({
          userId, type: "kyc_approved",
          title: "Age verified",
          body: "Your age verification is complete. You can now make deposits.",
          pushUrl: "/wallet",
        });
        res.json({ ok: true, kycLevel: "age_verified", mode: "mock" });
      }
    } else {
      if (user.kycLevel !== "age_verified") { res.status(400).json({ message: "Complete age verification first" }); return; }

      if (sumsubConfigured()) {
        const externalUserId = String(userId);
        // Applicant may already exist; getSdkToken works regardless
        const { token } = await getSdkToken({ externalUserId, levelName: "basic-kyc-level" });
        res.json({ ok: true, sdkToken: token, mode: "sumsub" });
      } else {
        await insertNotification({
          userId, type: "kyc_approved",
          title: "KYC submitted",
          body: "Your documents have been received. Review takes 1-3 business days.",
        });
        res.json({ ok: true, kycLevel: "age_verified", pending: true, mode: "mock" });
      }
    }
  }));

  // ── KYC Webhooks (Sumsub / Onfido) ───────────────────────────────────────

  app.post("/api/webhooks/kyc", ar(async (req: Request, res: Response) => {
    const sig = (req.headers["x-payload-digest"] ?? req.headers["x-sumsub-signature"]) as string | undefined;
    const secret = process.env.SUMSUB_SECRET_KEY;
    const rawBody: Buffer | undefined = (req as any).rawBody;

    if (secret) {
      if (!sig || !rawBody) {
        res.status(400).json({ message: "Missing webhook signature" });
        return;
      }
      if (!verifyKycSignature(rawBody, sig, secret)) {
        res.status(400).json({ message: "Invalid webhook signature" });
        return;
      }
    }

    const { applicantId, reviewResult, externalUserId, levelName, type: eventType } = req.body;
    const userId = parseInt(externalUserId ?? "0");

    if (!userId) { res.status(400).json({ message: "Missing externalUserId" }); return; }

    // Only process applicantReviewed events; ignore others (applicantCreated, etc.)
    if (eventType && eventType !== "applicantReviewed") { res.json({ ok: true }); return; }

    const reviewAnswer = reviewResult?.reviewAnswer;  // "GREEN" | "RED"

    if (reviewAnswer === "GREEN") {
      // Map Sumsub level name → our kycLevel enum
      // age-kyc-level → age_verified; basic-kyc-level (or any other) → full
      const isAgeLevel = typeof levelName === "string" && levelName.toLowerCase().includes("age");
      const newKycLevel = isAgeLevel ? "age_verified" : "full";

      const [currentUser] = await db.select({ kycLevel: users.kycLevel }).from(users).where(eq(users.id, userId));

      // Only upgrade, never downgrade (e.g. ignore a second age webhook if user is already full)
      const shouldUpgrade = (
        (newKycLevel === "age_verified" && currentUser?.kycLevel === "none") ||
        (newKycLevel === "full" && (currentUser?.kycLevel === "none" || currentUser?.kycLevel === "age_verified"))
      );

      if (shouldUpgrade) {
        await db.update(users).set({ kycLevel: newKycLevel }).where(eq(users.id, userId));
        await db.update(userProfiles)
          .set({ kycVerifiedAt: new Date(), kycProviderToken: applicantId })
          .where(eq(userProfiles.userId, userId));
        await insertNotification({
          userId, type: "kyc_approved",
          title: isAgeLevel ? "Age verified" : "Identity verified",
          body: isAgeLevel
            ? "Your age verification is complete. You can now make deposits."
            : "Your KYC verification was approved. You can now withdraw funds.",
          pushUrl: isAgeLevel ? "/wallet" : "/wallet",
        });
      }
    } else if (reviewAnswer === "RED") {
      await insertNotification({
        userId, type: "kyc_rejected",
        title: "Verification rejected",
        body: "Your KYC verification was not approved. Please try again or contact support.",
      });
    }

    res.json({ ok: true });
  }));

  // ── Payment Webhooks (Stripe) ──────────────────────────────────────────────

  app.post("/api/webhooks/stripe", ar(async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const rawBody: Buffer | undefined = (req as any).rawBody;

    if (webhookSecret) {
      if (!sig || !rawBody) {
        res.status(400).json({ message: "Missing Stripe signature header" });
        return;
      }
      if (!verifyStripeSignature(rawBody, sig, webhookSecret)) {
        res.status(400).json({ message: "Invalid Stripe webhook signature" });
        return;
      }
    }

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
  }));

  // ── Seed initial data (dev only) ──────────────────────────────────────────

  app.post("/api/dev/seed", ar(async (_req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") { res.status(403).json({ message: "Not in production" }); return; }
    try {
      await seedInitialData();
      res.json({ ok: true, message: "Database seeded" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }));

  // ── Gamification ──────────────────────────────────────────────────────────

  // GET /api/gamification/me — current user's level, XP and badges
  app.get("/api/gamification/me", requireAuth, ar(async (req: Request, res: Response) => {
    try {
      const data = await getUserLevel(uid(req), db);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }));

  // POST /api/gamification/award — admin-only: manually award XP to a user
  app.post("/api/gamification/award", requireAdmin, ar(async (req: Request, res: Response) => {
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
  }));

  // ── Partners ──────────────────────────────────────────────────────────────

  // GET /api/partners — list active partners, optionally filtered by ?countryId
  app.get("/api/partners", ar(async (req: Request, res: Response) => {
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
  }));

  // GET /api/partners/:id — single partner by id
  app.get("/api/partners/:id", ar(async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ message: "Invalid partner id" }); return; }

      const partner = await getPartner(id);
      if (!partner) { res.status(404).json({ message: "Partner not found" }); return; }

      res.json(partner);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }));

  // POST /api/admin/partners — create a partner
  app.post("/api/admin/partners", requireAdmin, ar(async (req: Request, res: Response) => {
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
  }));

  // PATCH /api/admin/partners/:id — update partner fields
  app.patch("/api/admin/partners/:id", requireAdmin, ar(async (req: Request, res: Response) => {
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
  }));

  // DELETE /api/admin/partners/:id — soft-delete (set isActive=false)
  app.delete("/api/admin/partners/:id", requireAdmin, ar(async (req: Request, res: Response) => {
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
  }));

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
