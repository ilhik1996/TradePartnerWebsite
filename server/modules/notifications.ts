import { db } from "../db";
import { notifications } from "@shared/schema";
import { sendPushToUser } from "./push";

type NotificationType =
  | "winner" | "draw_result" | "kyc_approved" | "kyc_rejected"
  | "payment_failed" | "subscription_created" | "subscription_renewal_failed"
  | "balance_low";

export async function insertNotification(opts: {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  pushUrl?: string;
}): Promise<void> {
  const [row] = await db.insert(notifications).values({
    userId: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    metadata: opts.metadata,
  }).returning({ id: notifications.id });

  // Fire push non-blocking — never let push failure affect the main flow
  sendPushToUser(opts.userId, {
    title: opts.title,
    body: opts.body,
    tag: `${opts.type}-${row?.id ?? Date.now()}`,
    url: opts.pushUrl ?? "/notifications",
  }).catch(() => {});
}
