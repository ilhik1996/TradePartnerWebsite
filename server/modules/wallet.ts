import { db } from "../db";
import { wallets, transactions, users } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function getOrCreateWallet(userId: number, currency: string) {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (existing) return existing;

  const [newWallet] = await db.insert(wallets).values({
    userId,
    balance: "0",
    currency,
  }).returning();
  return newWallet;
}

export async function depositFunds(userId: number, amount: number, reference?: string) {
  if (amount <= 0) throw new Error("Amount must be positive");
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!wallet) throw new Error("Wallet not found");

  const newBalance = parseFloat(wallet.balance as string) + amount;

  await db.update(wallets)
    .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
    .where(eq(wallets.userId, userId));

  const [tx] = await db.insert(transactions).values({
    walletId: wallet.id,
    userId,
    type: "deposit",
    amount: amount.toFixed(2),
    balanceAfter: newBalance.toFixed(2),
    status: "completed",
    reference,
    description: `Deposit ${wallet.currency} ${amount.toFixed(2)}`,
  }).returning();

  return { transaction: tx, newBalance };
}

export async function getBalance(userId: number) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  return wallet ? parseFloat(wallet.balance as string) : 0;
}

export async function getTransactionHistory(userId: number, limit = 20, offset = 0) {
  return db.select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(transactions.createdAt)
    .limit(limit)
    .offset(offset);
}
