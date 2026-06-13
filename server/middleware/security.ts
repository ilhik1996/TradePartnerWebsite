import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { createHash, createHmac, timingSafeEqual } from "crypto";

// ─── Security headers ─────────────────────────────────────────────────────────

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  next();
}

// ─── Blocked jurisdictions (sanctions + no-license markets) ──────────────────

const BLOCKED_COUNTRY_CODES = new Set([
  "RU", "BY", "KP", "IR", "SY", "CU", "VE", "MM",  // Sanctioned
  "CN",                                               // Excluded at launch
]);

// Known VPN/datacenter ASN prefixes (simplified list — extend via MaxMind in prod)
const DATACENTER_AS_PREFIXES = ["AS14061", "AS16509", "AS15169", "AS8075"];

export function geoBlock(req: Request, res: Response, next: NextFunction) {
  // Skip in development
  if (process.env.NODE_ENV !== "production") { next(); return; }

  try {
    // Dynamically import to avoid issues when geoip data isn't loaded
    const geoip = require("geoip-lite");
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim()
      ?? req.socket.remoteAddress
      ?? "";
    const geo = geoip.lookup(ip);

    if (geo && BLOCKED_COUNTRY_CODES.has(geo.country)) {
      res.status(451).json({
        message: "Service not available in your region",
        code: "GEO_BLOCKED",
      });
      return;
    }
  } catch {
    // If geoip fails, allow — don't block legitimate users on lookup errors
  }
  next();
}

// ─── Rate limiters ────────────────────────────────────────────────────────────

// Strict limit for auth endpoints (login / register)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again in 15 minutes" },
});

// General API limit
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests" },
});

// Strict limit for payment/withdrawal endpoints
export const paymentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many payment requests, please wait before retrying" },
});

// ─── Device fingerprint ───────────────────────────────────────────────────────

export function deviceFingerprint(req: Request, _res: Response, next: NextFunction) {
  const ua = req.headers["user-agent"] ?? "";
  const lang = req.headers["accept-language"] ?? "";
  const ip = req.socket.remoteAddress ?? "";
  const raw = `${ua}|${lang}|${ip}`;
  (req as any).deviceFingerprint = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  next();
}

// ─── Suspicious activity detector ────────────────────────────────────────────
// Simple in-process store — replace with Redis in production

const recentActions = new Map<string, { count: number; firstAt: number }>();

export function detectSuspicious(action: string, key: string, maxPerMinute = 5): boolean {
  const mapKey = `${action}:${key}`;
  const now = Date.now();
  const existing = recentActions.get(mapKey);

  if (!existing || now - existing.firstAt > 60_000) {
    recentActions.set(mapKey, { count: 1, firstAt: now });
    return false;
  }

  existing.count++;
  if (existing.count > maxPerMinute) {
    return true;  // suspicious
  }
  return false;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  recentActions.forEach((val, key) => {
    if (val.firstAt < cutoff) recentActions.delete(key);
  });
}, 5 * 60_000);

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify Stripe webhook HMAC-SHA256 signature.
 * Header format: "t=<timestamp>,v1=<hex_signature>"
 * Signed payload: "<timestamp>.<rawBody>"
 * Rejects replays older than 5 minutes.
 */
export function verifyStripeSignature(
  rawBody: Buffer,
  header: string,
  secret: string,
): boolean {
  const parts: Record<string, string[]> = {};
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx);
    const val = part.slice(idx + 1);
    (parts[key] ??= []).push(val);
  }

  const timestamp = parts["t"]?.[0];
  const signatures = parts["v1"] ?? [];
  if (!timestamp || signatures.length === 0) return false;

  // Reject replays older than 5 minutes
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
  if (ageSeconds > 300) return false;

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expectedHex = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  return signatures.some((sig) => {
    try {
      const sigBuf = Buffer.from(sig, "hex");
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

/**
 * Verify Sumsub KYC webhook HMAC-SHA1 signature.
 * Sumsub computes: HMAC-SHA1(secretKey, rawBody), hex-encoded.
 * Header: x-payload-digest
 */
export function verifyKycSignature(
  rawBody: Buffer,
  header: string,
  secret: string,
): boolean {
  try {
    const expectedHex = createHmac("sha1", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");
    const headerBuf = Buffer.from(header.toLowerCase(), "hex");
    return headerBuf.length === expectedBuf.length && timingSafeEqual(headerBuf, expectedBuf);
  } catch {
    return false;
  }
}
