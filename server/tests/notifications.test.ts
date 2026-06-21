import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: { insert: vi.fn() },
}));

vi.mock("../modules/push", () => ({
  sendPushToUser: vi.fn(),
}));

const { insertNotification } = await import("../modules/notifications");
const { db } = await import("../db");
const { sendPushToUser } = await import("../modules/push");

const mockedDb = db as any;
const mockedPush = sendPushToUser as ReturnType<typeof vi.fn>;

function makeInsertChain(row: { id: number } = { id: 42 }) {
  return {
    values: () => ({
      returning: () => Promise.resolve([row]),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── insertNotification — DB write ─────────────────────────────────────────────

describe("insertNotification — DB write", () => {
  it("calls db.insert with the notifications table", async () => {
    mockedDb.insert.mockReturnValue(makeInsertChain());
    mockedPush.mockResolvedValue(undefined);
    await insertNotification({ userId: 5, type: "winner", title: "You won!", body: "Congrats" });
    expect(mockedDb.insert).toHaveBeenCalledOnce();
  });

  it("rejects when db.insert fails", async () => {
    mockedDb.insert.mockReturnValue({
      values: () => ({
        returning: () => Promise.reject(new Error("DB error")),
      }),
    });
    await expect(
      insertNotification({ userId: 1, type: "winner", title: "X", body: "Y" })
    ).rejects.toThrow("DB error");
  });
});

// ── insertNotification — push dispatch ───────────────────────────────────────

describe("insertNotification — push dispatch", () => {
  it("calls sendPushToUser with matching userId, title and body", async () => {
    mockedDb.insert.mockReturnValue(makeInsertChain({ id: 7 }));
    mockedPush.mockResolvedValue(undefined);
    await insertNotification({ userId: 3, type: "kyc_approved", title: "KYC passed", body: "Verified" });
    // Push is fire-and-forget; flush microtasks
    await Promise.resolve();
    expect(mockedPush).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ title: "KYC passed", body: "Verified" }),
    );
  });

  it("push tag includes the notification type", async () => {
    mockedDb.insert.mockReturnValue(makeInsertChain({ id: 99 }));
    mockedPush.mockResolvedValue(undefined);
    await insertNotification({ userId: 2, type: "withdrawal_processed", title: "Paid", body: "Done" });
    await Promise.resolve();
    const [, payload] = mockedPush.mock.calls[0];
    expect((payload as any).tag).toContain("withdrawal_processed");
  });

  it("push url defaults to /notifications when no pushUrl provided", async () => {
    mockedDb.insert.mockReturnValue(makeInsertChain({ id: 1 }));
    mockedPush.mockResolvedValue(undefined);
    await insertNotification({ userId: 1, type: "draw_result", title: "Results", body: "Check them" });
    await Promise.resolve();
    const [, payload] = mockedPush.mock.calls[0];
    expect((payload as any).url).toBe("/notifications");
  });

  it("push url uses provided pushUrl", async () => {
    mockedDb.insert.mockReturnValue(makeInsertChain({ id: 5 }));
    mockedPush.mockResolvedValue(undefined);
    await insertNotification({ userId: 1, type: "winner", title: "Win", body: "!", pushUrl: "/history" });
    await Promise.resolve();
    const [, payload] = mockedPush.mock.calls[0];
    expect((payload as any).url).toBe("/history");
  });
});

// ── insertNotification — push failure isolation ───────────────────────────────

describe("insertNotification — push failure is isolated", () => {
  it("resolves successfully even when sendPushToUser rejects", async () => {
    mockedDb.insert.mockReturnValue(makeInsertChain({ id: 20 }));
    mockedPush.mockRejectedValue(new Error("VAPID error"));
    await expect(
      insertNotification({ userId: 1, type: "payment_failed", title: "Fail", body: "Card declined" })
    ).resolves.toBeUndefined();
  });
});
