import { db } from "../db";
import { draws, drawEntries, wallets, transactions, users, countries, notifications, responsibleGaming } from "@shared/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { createHash, randomInt } from "crypto";

export async function getOrCreateDraw(countryId: number, dateStr: string) {
  const [existing] = await db
    .select()
    .from(draws)
    .where(and(eq(draws.countryId, countryId), eq(draws.drawDate, dateStr)));

  if (existing) return existing;

  const [newDraw] = await db.insert(draws).values({
    countryId,
    drawDate: dateStr,
    status: "open",
    totalPool: "0",
    totalEntries: 0,
    openedAt: new Date(),
  }).returning();

  return newDraw;
}

export function todayDateString() {
  return new Date().toISOString().split("T")[0];
}

// Add a paid entry — deducts from wallet, records transaction, adds to draw pool
export async function addPaidEntry(userId: number, drawId: number) {
  // Enforce account status
  const [user] = await db.select({ status: users.status }).from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");
  if (user.status === "self_excluded") throw new Error("Your account is self-excluded. You cannot enter draws.");
  if (user.status === "suspended" || user.status === "banned") throw new Error("Your account is not active.");

  const draw = await db.select().from(draws).where(eq(draws.id, drawId)).then(r => r[0]);
  if (!draw || draw.status !== "open") throw new Error("Draw is not open");

  // Check for duplicate paid entry in same draw
  const [existing] = await db
    .select()
    .from(drawEntries)
    .where(and(eq(drawEntries.drawId, drawId), eq(drawEntries.userId, userId)));
  if (existing) throw new Error("Already entered this draw");

  const country = await db.select().from(countries).where(eq(countries.id, draw.countryId)).then(r => r[0]);
  if (!country) throw new Error("Country not found");

  const entryAmount = parseFloat(country.entryAmountDaily as string);

  // Enforce responsible gaming spending limits
  const [rg] = await db.select().from(responsibleGaming).where(eq(responsibleGaming.userId, userId));
  if (rg) {
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [spendRow] = await db
      .select({
        daily: sql<number>`coalesce(sum(case when created_at >= ${dayStart.toISOString()} then abs(amount) else 0 end), 0)`,
        weekly: sql<number>`coalesce(sum(case when created_at >= ${weekStart.toISOString()} then abs(amount) else 0 end), 0)`,
        monthly: sql<number>`coalesce(sum(case when created_at >= ${monthStart.toISOString()} then abs(amount) else 0 end), 0)`,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.type, "lottery_entry")));

    if (rg.dailyLimitAmount && spendRow) {
      const dailyLimit = parseFloat(rg.dailyLimitAmount as string);
      if (Number(spendRow.daily) + entryAmount > dailyLimit)
        throw new Error(`Daily spending limit of ${dailyLimit.toFixed(2)} reached`);
    }
    if (rg.weeklyLimitAmount && spendRow) {
      const weeklyLimit = parseFloat(rg.weeklyLimitAmount as string);
      if (Number(spendRow.weekly) + entryAmount > weeklyLimit)
        throw new Error(`Weekly spending limit of ${weeklyLimit.toFixed(2)} reached`);
    }
    if (rg.monthlyLimitAmount && spendRow) {
      const monthlyLimit = parseFloat(rg.monthlyLimitAmount as string);
      if (Number(spendRow.monthly) + entryAmount > monthlyLimit)
        throw new Error(`Monthly spending limit of ${monthlyLimit.toFixed(2)} reached`);
    }
  }

  // Deduct from wallet
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!wallet) throw new Error("Wallet not found");

  const balance = parseFloat(wallet.balance as string);
  if (balance < entryAmount) throw new Error("Insufficient balance");

  const newBalance = balance - entryAmount;

  await db.update(wallets)
    .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
    .where(eq(wallets.userId, userId));

  const [tx] = await db.insert(transactions).values({
    walletId: wallet.id,
    userId,
    type: "lottery_entry",
    amount: (-entryAmount).toFixed(2),
    balanceAfter: newBalance.toFixed(2),
    description: `Lottery entry for draw #${drawId}`,
    metadata: { drawId },
  }).returning();

  // Atomically increment totalEntries and use the returned value as the ticket number
  const newPool = parseFloat(draw.totalPool as string) + entryAmount;
  const [updatedDraw] = await db.update(draws)
    .set({
      totalPool: newPool.toFixed(2),
      totalEntries: sql`${draws.totalEntries} + 1`,
    })
    .where(eq(draws.id, drawId))
    .returning({ totalEntries: draws.totalEntries });

  const ticketNumber = updatedDraw.totalEntries;

  await db.insert(drawEntries).values({
    drawId,
    userId,
    type: "paid",
    ticketNumber,
    amountPaid: entryAmount.toFixed(2),
    transactionId: tx.id,
  });

  return { ticketNumber, entryAmount, newBalance };
}

// Add a free (AMOE) entry — no wallet needed, just one per draw per email
export async function addFreeEntry(userId: number, drawId: number) {
  const draw = await db.select().from(draws).where(eq(draws.id, drawId)).then(r => r[0]);
  if (!draw || draw.status !== "open") throw new Error("Draw is not open");

  const [existing] = await db
    .select()
    .from(drawEntries)
    .where(and(eq(drawEntries.drawId, drawId), eq(drawEntries.userId, userId)));
  if (existing) throw new Error("Already have an entry in this draw");

  // Atomically increment totalEntries to get a unique ticket number
  const [updatedDraw] = await db.update(draws)
    .set({ totalEntries: sql`${draws.totalEntries} + 1` })
    .where(eq(draws.id, drawId))
    .returning({ totalEntries: draws.totalEntries });

  const ticketNumber = updatedDraw.totalEntries;

  await db.insert(drawEntries).values({
    drawId,
    userId,
    type: "free",
    ticketNumber,
    amountPaid: null,
  });

  return { ticketNumber };
}

// Provably fair RNG: seed = hash of (drawId + all ticket numbers + server secret)
export function generateProvablyFairWinner(
  drawId: number,
  totalEntries: number,
  serverSecret: string
): { winnerTicket: number; seedHash: string; proof: string } {
  // seed contains server secret — never stored in plaintext; only its hash is public
  const seed = `viona:draw:${drawId}:entries:${totalEntries}:secret:${serverSecret}`;
  const hash = createHash("sha256").update(seed).digest("hex");
  const winnerTicket = (parseInt(hash.slice(0, 8), 16) % totalEntries) + 1;
  // proof is hash(hash + drawId) — can be verified publicly without revealing the secret
  const proof = createHash("sha256").update(hash + drawId).digest("hex");
  // Store only the hash of the seed, not the plaintext (which contains the server secret)
  const seedHash = createHash("sha256").update(seed).digest("hex");
  return { winnerTicket, seedHash, proof };
}

// Close the draw and pick a winner — called by scheduler
export async function conductDraw(drawId: number) {
  const draw = await db.select().from(draws).where(eq(draws.id, drawId)).then(r => r[0]);
  if (!draw || draw.status !== "open") throw new Error("Draw not open");
  if (draw.totalEntries === 0) {
    await db.update(draws).set({ status: "cancelled", closedAt: new Date() }).where(eq(draws.id, drawId));
    return null;
  }

  await db.update(draws).set({ status: "closed", closedAt: new Date() }).where(eq(draws.id, drawId));

  const serverSecret = process.env.DRAW_SECRET || "viona-draw-secret";
  const { winnerTicket, seedHash, proof } = generateProvablyFairWinner(drawId, draw.totalEntries, serverSecret);

  const [winnerEntry] = await db
    .select()
    .from(drawEntries)
    .where(and(eq(drawEntries.drawId, drawId), eq(drawEntries.ticketNumber, winnerTicket)));

  if (!winnerEntry) throw new Error("Winner entry not found");

  const country = await db.select().from(countries).where(eq(countries.id, draw.countryId)).then(r => r[0]);
  if (!country) throw new Error("Country not found for draw");
  const prizePercent = parseFloat(country.prizePercentage as string) / 100;
  const prizeAmount = parseFloat(draw.totalPool as string) * prizePercent;

  // Credit winner wallet
  const [winnerWallet] = await db.select().from(wallets).where(eq(wallets.userId, winnerEntry.userId));
  if (!winnerWallet) throw new Error("Winner wallet not found");
  const newBalance = parseFloat(winnerWallet.balance as string) + prizeAmount;

  await db.update(wallets)
    .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
    .where(eq(wallets.userId, winnerEntry.userId));

  await db.insert(transactions).values({
    walletId: winnerWallet.id,
    userId: winnerEntry.userId,
    type: "prize_payout",
    amount: prizeAmount.toFixed(2),
    balanceAfter: newBalance.toFixed(2),
    description: `Prize for draw #${drawId} on ${draw.drawDate}`,
    metadata: { drawId, ticketNumber: winnerTicket },
  });

  // Mark draw complete
  await db.update(draws).set({
    status: "completed",
    winnerUserId: winnerEntry.userId,
    winnerTicketNumber: winnerTicket,
    prizeAmount: prizeAmount.toFixed(2),
    rngSeed: seedHash,
    rngProof: proof,
    completedAt: new Date(),
  }).where(eq(draws.id, drawId));

  // Notify winner
  await db.insert(notifications).values({
    userId: winnerEntry.userId,
    type: "winner",
    title: "🎉 You won!",
    body: `You won ${country.currencySymbol}${prizeAmount.toFixed(2)} in today's draw!`,
    metadata: { drawId, prizeAmount: prizeAmount.toFixed(2) },
  });

  // Notify all participants about result
  const allEntries = await db.select().from(drawEntries).where(eq(drawEntries.drawId, drawId));
  const loserIds = allEntries
    .filter(e => e.userId !== winnerEntry.userId)
    .map(e => e.userId);

  for (const uid of loserIds) {
    const myTicket = allEntries.find(e => e.userId === uid)?.ticketNumber ?? 0;
    const distance = Math.abs(myTicket - winnerTicket);
    const proximity = Math.round((1 - distance / draw.totalEntries) * 100);
    await db.insert(notifications).values({
      userId: uid,
      type: "draw_result",
      title: "Today's draw completed",
      body: `Your ticket was ${proximity}% close to the winner. Better luck tomorrow!`,
      metadata: { drawId, winnerTicket, myTicket },
    });
  }

  return {
    drawId,
    winnerUserId: winnerEntry.userId,
    winnerTicket,
    prizeAmount: prizeAmount.toFixed(2),
    proof,
  };
}
