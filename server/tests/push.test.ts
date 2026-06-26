import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock web-push before module import so setVapidDetails is a no-op
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

// Mock db — push.ts uses select() and delete()
vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

// Set VAPID env vars before the dynamic import so vapidReady = true inside push.ts
process.env.VAPID_PUBLIC_KEY = "BAAAATestPublicKey";
process.env.VAPID_PRIVATE_KEY = "TestPrivateKey";

const { sendPushToUser } = await import("../modules/push");
const { db } = await import("../db");
const webpushMod = await import("web-push");
const webpush = webpushMod.default as any;
const mockedDb = db as any;

function makeSelectChain(rows: any[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

function makeDeleteChain(fail = false) {
  return {
    where: () => (fail ? Promise.reject(new Error("DB error")) : Promise.resolve([])),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── No subscriptions ──────────────────────────────────────────────────────────

describe("sendPushToUser — no subscriptions", () => {
  it("returns without calling sendNotification when user has no push subscriptions", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([]));
    await sendPushToUser(1, { title: "Test", body: "Body" });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

// ── Successful delivery ───────────────────────────────────────────────────────

describe("sendPushToUser — successful delivery", () => {
  it("calls sendNotification once per subscription", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 1, endpoint: "https://push.example.com/1", p256dh: "key1", auth: "auth1" },
      { id: 2, endpoint: "https://push.example.com/2", p256dh: "key2", auth: "auth2" },
    ]));
    webpush.sendNotification.mockResolvedValue({});
    await sendPushToUser(1, { title: "Hi", body: "Hello" });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("passes correct endpoint and keys to sendNotification", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 1, endpoint: "https://push.example.com/sub", p256dh: "p256dhKey", auth: "authKey" },
    ]));
    webpush.sendNotification.mockResolvedValue({});
    await sendPushToUser(1, { title: "X", body: "Y" });
    const [subArg] = webpush.sendNotification.mock.calls[0];
    expect(subArg.endpoint).toBe("https://push.example.com/sub");
    expect(subArg.keys.p256dh).toBe("p256dhKey");
    expect(subArg.keys.auth).toBe("authKey");
  });

  it("payload JSON includes title, body, tag and url", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 1, endpoint: "https://push.example.com/1", p256dh: "k", auth: "a" },
    ]));
    webpush.sendNotification.mockResolvedValue({});
    await sendPushToUser(1, { title: "Win!", body: "You won", tag: "winner-42", url: "/history" });
    const [, payloadStr] = webpush.sendNotification.mock.calls[0];
    const payload = JSON.parse(payloadStr as string);
    expect(payload.title).toBe("Win!");
    expect(payload.body).toBe("You won");
    expect(payload.tag).toBe("winner-42");
    expect(payload.url).toBe("/history");
  });

  it("uses default icon, badge, tag and url when not provided", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 1, endpoint: "https://push.example.com/1", p256dh: "k", auth: "a" },
    ]));
    webpush.sendNotification.mockResolvedValue({});
    await sendPushToUser(1, { title: "T", body: "B" });
    const [, payloadStr] = webpush.sendNotification.mock.calls[0];
    const payload = JSON.parse(payloadStr as string);
    expect(payload.icon).toBe("/icons/icon-192x192.png");
    expect(payload.badge).toBe("/icons/badge-72x72.png");
    expect(payload.tag).toBe("viona-notification");
    expect(payload.url).toBe("/dashboard");
  });
});

// ── Stale endpoint cleanup ────────────────────────────────────────────────────

describe("sendPushToUser — stale endpoint cleanup", () => {
  it("deletes subscription when sendNotification returns 410 (Gone)", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 7, endpoint: "https://push.example.com/gone", p256dh: "k", auth: "a" },
    ]));
    const err = Object.assign(new Error("Gone"), { statusCode: 410 });
    webpush.sendNotification.mockRejectedValue(err);
    mockedDb.delete.mockReturnValue(makeDeleteChain());
    await sendPushToUser(1, { title: "X", body: "Y" });
    expect(mockedDb.delete).toHaveBeenCalled();
  });

  it("deletes subscription when sendNotification returns 404 (Not Found)", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 8, endpoint: "https://push.example.com/missing", p256dh: "k", auth: "a" },
    ]));
    const err = Object.assign(new Error("Not Found"), { statusCode: 404 });
    webpush.sendNotification.mockRejectedValue(err);
    mockedDb.delete.mockReturnValue(makeDeleteChain());
    await sendPushToUser(1, { title: "X", body: "Y" });
    expect(mockedDb.delete).toHaveBeenCalled();
  });

  it("does NOT delete subscription when sendNotification fails with 5xx", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 9, endpoint: "https://push.example.com/err", p256dh: "k", auth: "a" },
    ]));
    const err = Object.assign(new Error("Server Error"), { statusCode: 500 });
    webpush.sendNotification.mockRejectedValue(err);
    mockedDb.delete.mockReturnValue(makeDeleteChain());
    await sendPushToUser(1, { title: "X", body: "Y" });
    expect(mockedDb.delete).not.toHaveBeenCalled();
  });

  it("resolves even when stale-endpoint DB delete itself fails", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 10, endpoint: "https://push.example.com/stale", p256dh: "k", auth: "a" },
    ]));
    const err = Object.assign(new Error("Gone"), { statusCode: 410 });
    webpush.sendNotification.mockRejectedValue(err);
    mockedDb.delete.mockReturnValue(makeDeleteChain(true)); // delete throws
    await expect(sendPushToUser(1, { title: "X", body: "Y" })).resolves.toBeUndefined();
  });

  it("deletes only stale subscriptions, not healthy ones", async () => {
    mockedDb.select.mockReturnValue(makeSelectChain([
      { id: 11, endpoint: "https://push.example.com/ok", p256dh: "k1", auth: "a1" },
      { id: 12, endpoint: "https://push.example.com/gone", p256dh: "k2", auth: "a2" },
    ]));
    webpush.sendNotification
      .mockResolvedValueOnce({})                                          // sub 11: success
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 })); // sub 12: stale
    mockedDb.delete.mockReturnValue(makeDeleteChain());
    await sendPushToUser(1, { title: "T", body: "B" });
    expect(mockedDb.delete).toHaveBeenCalledTimes(1);
  });
});
