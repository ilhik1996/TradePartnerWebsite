/**
 * Sumsub KYC integration.
 *
 * Requires env vars:
 *   SUMSUB_APP_TOKEN  — Application token (from Sumsub dashboard)
 *   SUMSUB_SECRET_KEY — Secret key for HMAC-SHA256 request signing
 *
 * Without these vars the module returns a stub token so dev/demo still works.
 */

import { createHmac } from "crypto";

const BASE_URL = "https://api.sumsub.com";

// ─── Request signing ──────────────────────────────────────────────────────────

function sign(
  secretKey: string,
  timestamp: number,
  method: string,
  path: string,
  body?: string,
): string {
  const msg = `${timestamp}${method.toUpperCase()}${path}${body ?? ""}`;
  return createHmac("sha256", secretKey).update(msg).digest("hex");
}

async function sumsubRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: object,
): Promise<T> {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;

  if (!appToken || !secretKey) {
    throw new Error("Sumsub credentials not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : undefined;

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "X-App-Token": appToken,
    "X-App-Access-Ts": String(timestamp),
    "X-App-Access-Sig": sign(secretKey, timestamp, method, path, bodyStr),
  };
  if (bodyStr) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Sumsub API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create (or return existing) Sumsub applicant for a user.
 * externalUserId ties the applicant to our user ID.
 */
export async function createApplicant(opts: {
  externalUserId: string;
  email?: string;
  dateOfBirth?: string;       // "YYYY-MM-DD"
  levelName?: string;
}): Promise<{ applicantId: string }> {
  const levelName = opts.levelName ?? "basic-kyc-level";
  const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;

  const payload: Record<string, any> = {
    externalUserId: opts.externalUserId,
  };
  if (opts.email) payload.email = opts.email;
  if (opts.dateOfBirth) {
    payload.fixedInfo = { dob: opts.dateOfBirth };
  }

  const data = await sumsubRequest<{ id: string }>("POST", path, payload);
  return { applicantId: data.id };
}

/**
 * Generate a short-lived Sumsub WebSDK access token.
 * The token is passed to the frontend to initialise the Sumsub JS/Flutter SDK.
 */
export async function getSdkToken(opts: {
  externalUserId: string;
  levelName?: string;
  ttlInSecs?: number;
}): Promise<{ token: string; userId: string }> {
  const levelName = opts.levelName ?? "basic-kyc-level";
  const ttl = opts.ttlInSecs ?? 1800;        // 30 minutes default
  const path = `/resources/accessTokens?userId=${encodeURIComponent(opts.externalUserId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=${ttl}`;

  const data = await sumsubRequest<{ token: string; userId: string }>("POST", path);
  return data;
}

/** True when Sumsub credentials are present in env. */
export function sumsubConfigured(): boolean {
  return !!(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY);
}
