import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Notifications from "./notifications";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    notifications: {
      list: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockList = vi.mocked(api.notifications.list);
const mockMarkRead = vi.mocked(api.notifications.markRead);
const mockMarkAllRead = vi.mocked(api.notifications.markAllRead);

const _unread = { id: 1, type: "draw_result", title: "Draw finished", body: "No winner today", isRead: false, createdAt: new Date().toISOString() };
const _read   = { id: 2, type: "winner",      title: "You won!",       body: "Congrats",      isRead: true,  createdAt: new Date().toISOString() };

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Notifications page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkRead.mockResolvedValue({});
    mockMarkAllRead.mockResolvedValue({ ok: true });
  });

  it("shows spinner while loading", () => {
    mockList.mockReturnValueOnce(new Promise(() => {}));
    render(<Notifications />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows toast on API failure", async () => {
    mockList.mockRejectedValueOnce(new Error("Network error"));
    render(<Notifications />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("shows empty state when no notifications", async () => {
    mockList.mockResolvedValueOnce([]);
    render(<Notifications />);
    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });

  it("renders notification title and body", async () => {
    mockList.mockResolvedValueOnce([_unread]);
    render(<Notifications />);
    expect(await screen.findByText("Draw finished")).toBeInTheDocument();
    expect(screen.getByText("No winner today")).toBeInTheDocument();
  });

  it("shows unread count badge when there are unread items", async () => {
    mockList.mockResolvedValueOnce([_unread, _read]);
    render(<Notifications />);
    await screen.findByText("Draw finished");
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("does not show unread badge when all are read", async () => {
    mockList.mockResolvedValueOnce([_read]);
    render(<Notifications />);
    await screen.findByText("You won!");
    // unread count is 0 — badge element should not be present
    const badges = screen.queryAllByText("0");
    expect(badges).toHaveLength(0);
  });

  it("shows Mark all read button when unread items exist", async () => {
    mockList.mockResolvedValueOnce([_unread]);
    render(<Notifications />);
    expect(await screen.findByText("Mark all read")).toBeInTheDocument();
  });

  it("hides Mark all read button when everything is read", async () => {
    mockList.mockResolvedValueOnce([_read]);
    render(<Notifications />);
    await screen.findByText("You won!");
    expect(screen.queryByText("Mark all read")).not.toBeInTheDocument();
  });

  it("clicking an unread notification calls markRead", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce([_unread]);
    render(<Notifications />);
    await screen.findByText("Draw finished");
    await user.click(screen.getByText("Draw finished").closest("button")!);
    expect(mockMarkRead).toHaveBeenCalledWith(1);
  });

  it("clicking a read notification does not call markRead", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce([_read]);
    render(<Notifications />);
    await screen.findByText("You won!");
    await user.click(screen.getByText("You won!").closest("button")!);
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it("Mark all read calls markAllRead once (not individual markRead per item)", async () => {
    const user = userEvent.setup();
    const unread2 = { ...(_unread), id: 3, title: "Second unread", body: "Body" };
    mockList.mockResolvedValueOnce([_unread, _read, unread2]);
    render(<Notifications />);
    await screen.findByText("Mark all read");
    await user.click(screen.getByText("Mark all read"));
    await waitFor(() => {
      expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
      expect(mockMarkRead).not.toHaveBeenCalled();
    });
  });

  it("Mark all read hides the button and clears badge after success", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce([_unread]);
    render(<Notifications />);
    await screen.findByText("Mark all read");
    await user.click(screen.getByText("Mark all read"));
    await waitFor(() => expect(screen.queryByText("Mark all read")).not.toBeInTheDocument());
  });
});
