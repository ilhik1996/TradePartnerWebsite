/**
 * Payment provider abstraction layer.
 *
 * MVP uses "mock" provider that always succeeds.
 * Real providers (Stripe, high-risk acquirer) plug in by implementing PaymentProvider.
 *
 * To add Stripe:
 *   npm install stripe
 *   Set STRIPE_SECRET_KEY env var
 *   Implement StripeProvider below and set PAYMENT_PROVIDER=stripe
 */

import { db } from "../db";
import { wallets, transactions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export interface ChargeResult {
  success: boolean;
  transactionId: string;
  providerRef?: string;
  errorCode?: string;
  errorMessage?: string;
  requiresAction?: boolean;   // 3DS challenge needed
  actionUrl?: string;
}

export interface PaymentProvider {
  name: string;
  charge(opts: {
    userId: number;
    amountMinorUnits: number;   // e.g. cents for USD, kopecks for UAH
    currency: string;
    paymentMethodToken: string;
    description: string;
    idempotencyKey: string;
    metadata?: Record<string, any>;
  }): Promise<ChargeResult>;
}

// ── Mock provider (dev / demo) ─────────────────────────────────────────────────

class MockProvider implements PaymentProvider {
  name = "mock";

  async charge(opts: Parameters<PaymentProvider["charge"]>[0]): Promise<ChargeResult> {
    // Simulate 95% success, 5% failure for realistic testing
    const fails = Math.random() < 0.05;
    if (fails) {
      return {
        success: false,
        transactionId: nanoid(),
        errorCode: "card_declined",
        errorMessage: "Card declined (simulated)",
      };
    }
    return {
      success: true,
      transactionId: nanoid(),
      providerRef: `mock_${nanoid(12)}`,
    };
  }
}

// ── Stripe provider skeleton ───────────────────────────────────────────────────

class StripeProvider implements PaymentProvider {
  name = "stripe";
  private stripe: any;  // Stripe instance — import dynamically

  constructor() {
    // Dynamic import so the app doesn't crash if stripe isn't installed
    try {
      const Stripe = require("stripe");
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2023-10-16",
      });
    } catch {
      console.warn("[Payments] Stripe package not found — using mock");
    }
  }

  async charge(opts: Parameters<PaymentProvider["charge"]>[0]): Promise<ChargeResult> {
    if (!this.stripe) {
      return {
        success: false,
        transactionId: nanoid(),
        errorCode: "provider_not_configured",
        errorMessage: "Stripe is not configured — set STRIPE_SECRET_KEY",
      };
    }

    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: opts.amountMinorUnits,
        currency: opts.currency.toLowerCase(),
        payment_method: opts.paymentMethodToken,
        confirm: true,
        description: opts.description,
        metadata: { userId: opts.userId, ...opts.metadata },
        idempotency_key: opts.idempotencyKey,
        // 3DS enforcement
        payment_method_options: {
          card: { request_three_d_secure: "any" },
        },
      });

      if (intent.status === "requires_action") {
        return {
          success: false,
          transactionId: intent.id,
          requiresAction: true,
          actionUrl: intent.next_action?.redirect_to_url?.url,
        };
      }

      return {
        success: intent.status === "succeeded",
        transactionId: intent.id,
        providerRef: intent.id,
      };
    } catch (err: any) {
      return {
        success: false,
        transactionId: nanoid(),
        errorCode: err.code ?? "unknown",
        errorMessage: err.message,
      };
    }
  }
}

// ── Provider factory ───────────────────────────────────────────────────────────

function getProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? "mock";
  switch (name) {
    case "stripe": return new StripeProvider();
    default: return new MockProvider();
  }
}

const provider = getProvider();

// ── Public API ─────────────────────────────────────────────────────────────────

export async function processDeposit(
  userId: number,
  amountDecimal: number,
  currency: string,
  paymentMethodToken: string,
  description: string,
): Promise<{ ok: boolean; message?: string; transactionId?: string; requiresAction?: boolean; actionUrl?: string }> {

  // Convert to minor units (cents/kopecks) — assume 2 decimal places
  const amountMinorUnits = Math.round(amountDecimal * 100);
  const idempotencyKey = `dep:${userId}:${nanoid()}`;

  const result = await provider.charge({
    userId,
    amountMinorUnits,
    currency,
    paymentMethodToken,
    description,
    idempotencyKey,
    metadata: { type: "deposit" },
  });

  if (result.requiresAction) {
    return { ok: false, requiresAction: true, actionUrl: result.actionUrl };
  }

  if (!result.success) {
    return { ok: false, message: result.errorMessage ?? "Payment failed" };
  }

  // Credit wallet atomically
  try {
    await db.transaction(async (tx) => {
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for("update");
      if (!wallet) throw new Error("Wallet not found");

      const newBalance = parseFloat(wallet.balance as string) + amountDecimal;
      await tx.update(wallets)
        .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(wallets.userId, userId));

      await tx.insert(transactions).values({
        walletId: wallet.id,
        userId,
        type: "deposit",
        amount: amountDecimal.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        status: "completed",
        reference: result.providerRef,
        description,
        metadata: { provider: provider.name, providerRef: result.providerRef },
      });
    });
  } catch (err: any) {
    return { ok: false, message: err.message ?? "Wallet credit failed" };
  }

  return { ok: true, transactionId: result.transactionId };
}

// Chargeback risk score (0–100). Plug in real ML model or fraud vendor here.
export function chargebackRiskScore(opts: {
  userId: number;
  ip: string;
  userAgent: string;
  amountUsd: number;
}): number {
  let score = 0;
  if (opts.amountUsd > 500) score += 30;
  if (opts.amountUsd > 1000) score += 30;
  // In production: check velocity, device signals, historical chargebacks
  return Math.min(score, 100);
}
