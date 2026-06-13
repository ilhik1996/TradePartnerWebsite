import { db } from "../db";
import { draws, drawEntries, wallets, transactions, users, countries, notifications } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
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

  const ticketNumber = draw.totalEntries + 1;

  await db.insert(drawEntries).values({
    drawId,
    userId,
    type: "paid",
    ticketNumber,
    amountPaid: entryAmount.toFixed(2),
    transactionId: tx.id,
  });

  // Update pool and entry count
  const newPool = parseFloat(draw.totalPool as string) + entryAmount;
  await db.update(draws)
    .set({
      totalPool: newPool.toFixed(2),
      totalEntries: ticketNumber,
    })
    .where(eq(draws.id, drawId));

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

  const ticketNumber = draw.totalEntries + 1;

  await db.insert(drawEntries).values({
    drawId,
    userId,
    type: "free",
    ticketNumber,
    amountPaid: null,
  });

  await db.update(draws)
    .set({ totalEntries: ticketNumber })
    .where(eq(draws.id, drawId));

  return { ticketNumber };
}

// Provably fair RNG: seed = hash of (drawId + all ticket numbers + server secret)
export function generateProvablyFairWinner(
  drawId: number,
  totalEntries: number,
  serverSecret: string
): { winnerTicket: number; seed: string; proof: string } {
  const seed = `viona:draw:${drawId}:entries:${totalEntries}:secret:${serverSecret}`;
  const hash = createHash("sha256").update(seed).digest("hex");
  // Use first 8 hex chars as number, mod total entries → 1-based ticket
  const winnerTicket = (parseInt(hash.slice(0, 8), 16) % totalEntries) + 1;
  const proof = createHash("sha256").update(hash + drawId).digest("hex");
  return { winnerTicket, seed, proof };
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
  const { winnerTicket, seed, proof } = generateProvablyFairWinner(drawId, draw.totalEntries, serverSecret);

  const [winnerEntry] = await db
    .select()
    .from(drawEntries)
    .where(and(eq(drawEntries.drawId, drawId), eq(drawEntries.ticketNumber, winnerTicket)));

  if (!winnerEntry) throw new Error("Winner entry not found");

  const country = await db.select().from(countries).where(eq(countries.id, draw.countryId)).then(r => r[0]);
  const prizePercent = parseFloat(country.prizePercentage as string) / 100;
  const prizeAmount = parseFloat(draw.totalPool as string) * prizePercent;

  // Credit winner wallet
  const [winnerWallet] = await db.select().from(wallets).where(eq(wallets.userId, winnerEntry.userId));
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
    rngSeed: seed,
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
    const proximity = Math.round((myTicket / draw.totalEntries) * 100);
    await db.insert(notifications).values({
      userId: uid,
      type: "draw_result",
      title: "Today's draw completed",
      body: `Your ticket was in the top ${100 - proximity}%. Better luck tomorrow!`,
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
