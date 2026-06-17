import { db } from "../db";
import { wallets, transactions, users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export async function getOrCreateWallet(userId: number, currency: string) {
  await db.insert(wallets).values({
    userId,
    balance: "0",
    currency,
  }).onConflictDoNothing();

  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!wallet) throw new Error(`Wallet not found for user ${userId}`);
  return wallet;
}

export async function depositFunds(userId: number, amount: number, reference?: string) {
  if (amount <= 0) throw new Error("Amount must be positive");

  return db.transaction(async (tx) => {
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for("update");
    if (!wallet) throw new Error("Wallet not found");

    const newBalance = parseFloat(wallet.balance as string) + amount;
    if (newBalance > 9_999_999.99) throw new Error("Deposit would exceed maximum account balance");

    await tx.update(wallets)
      .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
      .where(eq(wallets.userId, userId));

    const [txRecord] = await tx.insert(transactions).values({
      walletId: wallet.id,
      userId,
      type: "deposit",
      amount: amount.toFixed(2),
      balanceAfter: newBalance.toFixed(2),
      status: "completed",
      reference,
      description: `Deposit ${wallet.currency} ${amount.toFixed(2)}`,
    }).returning();

    return { transaction: txRecord, newBalance };
  });
}

export async function getBalance(userId: number) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  return wallet ? parseFloat(wallet.balance as string) : 0;
}

export async function getTransactionHistory(userId: number, limit = 20, offset = 0) {
  return db.select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
    .offset(offset);
}
