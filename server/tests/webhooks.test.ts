import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyStripeSignature, verifyKycSignature } from "../middleware/security";

// ─── Stripe signature tests ───────────────────────────────────────────────────

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";
  const body = Buffer.from('{"type":"payment_intent.succeeded"}');

  function makeHeader(timestamp: number, body: Buffer, secret: string): string {
    const signed = `${timestamp}.${body.toString("utf8")}`;
    const sig = createHmac("sha256", secret).update(signed).digest("hex");
    return `t=${timestamp},v1=${sig}`;
  }

  it("accepts a valid signature", () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = makeHeader(ts, body, secret);
    expect(verifyStripeSignature(body, header, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = makeHeader(ts, body, secret);
    const tampered = Buffer.from('{"type":"charge.dispute.created"}');
    expect(verifyStripeSignature(tampered, header, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = makeHeader(ts, body, secret);
    expect(verifyStripeSignature(body, header, "wrong_secret")).toBe(false);
  });

  it("rejects a replay older than 5 minutes", () => {
    const ts = Math.floor(Date.now() / 1000) - 301;
    const header = makeHeader(ts, body, secret);
    expect(verifyStripeSignature(body, header, secret)).toBe(false);
  });

  it("rejects a malformed header", () => {
    expect(verifyStripeSignature(body, "not-a-header", secret)).toBe(false);
  });

  it("rejects an empty header string", () => {
    expect(verifyStripeSignature(body, "", secret)).toBe(false);
  });
});

// ─── Sumsub KYC signature tests ───────────────────────────────────────────────

describe("verifyKycSignature", () => {
  const secret = "sumsub_test_secret";
  const body = Buffer.from('{"applicantId":"abc123","reviewResult":{"reviewAnswer":"GREEN"}}');

  function makeKycHeader(body: Buffer, secret: string): string {
    return createHmac("sha1", secret).update(body).digest("hex");
  }

  it("accepts a valid Sumsub signature", () => {
    const header = makeKycHeader(body, secret);
    expect(verifyKycSignature(body, header, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = makeKycHeader(body, secret);
    const tampered = Buffer.from('{"applicantId":"abc123","reviewResult":{"reviewAnswer":"RED"}}');
    expect(verifyKycSignature(tampered, header, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const header = makeKycHeader(body, secret);
    expect(verifyKycSignature(body, header, "wrong_secret")).toBe(false);
  });

  it("handles uppercase hex in header (case-insensitive)", () => {
    const header = makeKycHeader(body, secret).toUpperCase();
    expect(verifyKycSignature(body, header, secret)).toBe(true);
  });

  it("rejects an invalid hex header", () => {
    expect(verifyKycSignature(body, "not-hex!", secret)).toBe(false);
  });
});
