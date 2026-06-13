/**
 * Web Push module — sends browser push notifications via VAPID.
 *
 * To enable:
 *   npx web-push generate-vapid-keys
 *   Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:admin@viona.app
 *
 * Without keys: logs to console (dev mode).
 */

import webpush from "web-push";
import { db } from "../db";
import { pushSubscriptions } from "@shared/schema";
import { eq } from "drizzle-orm";

let vapidReady = false;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@viona.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  vapidReady = true;
} else {
  console.log("[Push] VAPID keys not set — push notifications disabled (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
}

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? null;

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!vapidReady) return;

  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/icons/icon-192x192.png",
    badge: payload.badge ?? "/icons/badge-72x72.png",
    tag: payload.tag ?? "viona-notification",
    url: payload.url ?? "/dashboard",
  });

  const staleEndpoints: number[] = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        data,
      );
    } catch (err: any) {
      // 410 Gone or 404 = subscription expired, clean up
      if (err.statusCode === 410 || err.statusCode === 404) {
        staleEndpoints.push(sub.id);
      }
    }
  }));

  if (staleEndpoints.length > 0) {
    // Remove expired subscriptions non-blocking
    Promise.all(
      staleEndpoints.map(id =>
        db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)).catch(() => {})
      )
    ).catch(() => {});
  }
}
