import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import History from "./history";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, countryId: 1 } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    draws:     { history: vi.fn() },
    countries: { get: vi.fn() },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockHistory = vi.mocked(api.draws.history);
const mockCountry = vi.mocked(api.countries.get);

const _country = { id: 1, currencySymbol: "₴" };

const _winner = {
  id: 10, drawDate: "2026-06-20", status: "completed",
  totalEntries: 100, totalPool: "500.00", prizeAmount: "450.00",
  isWinner: true, myEntry: { ticketNumber: 42 }, winnerTicketNumber: 42,
  rngProof: null,
};
const _loser = {
  id: 11, drawDate: "2026-06-21", status: "completed",
  totalEntries: 80, totalPool: "400.00", prizeAmount: "360.00",
  isWinner: false, myEntry: { ticketNumber: 5 }, winnerTicketNumber: 50,
  rngProof: null,
};
const _pending = {
  id: 12, drawDate: "2026-06-22", status: "pending",
  totalEntries: 0, totalPool: "0.00", prizeAmount: null,
  isWinner: false, myEntry: null, winnerTicketNumber: null,
  rngProof: null,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("History page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountry.mockResolvedValue(_country);
  });

  it("shows spinner while loading", () => {
    mockHistory.mockReturnValueOnce(new Promise(() => {}));
    render(<History />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows toast on API failure", async () => {
    mockHistory.mockRejectedValueOnce(new Error("Network error"));
    render(<History />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("shows empty state when no draws", async () => {
    mockHistory.mockResolvedValueOnce([]);
    render(<History />);
    expect(
      await screen.findByText("No completed draws yet in your market.")
    ).toBeInTheDocument();
  });

  it("renders draw history stats", async () => {
    mockHistory.mockResolvedValueOnce([_winner, _loser]);
    render(<History />);
    await screen.findByText("2026-06-20");
    // Stat labels are unique; verify the associated values via their sibling text
    expect(screen.getByText("Total draws")).toBeInTheDocument();
    expect(screen.getByText("My wins")).toBeInTheDocument();
    // Only one winner, so "My wins" section shows 1
    const statsCards = document.querySelectorAll(".viona-card.p-4.text-center");
    expect(statsCards[2].textContent).toContain("1"); // My wins card
  });

  it("renders draw date", async () => {
    mockHistory.mockResolvedValueOnce([_loser]);
    render(<History />);
    expect(await screen.findByText("2026-06-21")).toBeInTheDocument();
  });

  it("shows Won! badge on a winning draw", async () => {
    mockHistory.mockResolvedValueOnce([_winner]);
    render(<History />);
    expect(await screen.findByText("Won!")).toBeInTheDocument();
  });

  it("shows completed badge on a losing draw", async () => {
    mockHistory.mockResolvedValueOnce([_loser]);
    render(<History />);
    expect(await screen.findByText("completed")).toBeInTheDocument();
  });

  it("shows pending badge on a pending draw", async () => {
    mockHistory.mockResolvedValueOnce([_pending]);
    render(<History />);
    expect(await screen.findByText("pending")).toBeInTheDocument();
  });

  it("shows prize amount for winner", async () => {
    mockHistory.mockResolvedValueOnce([_winner]);
    render(<History />);
    await screen.findByText("Won!");
    expect(screen.getByText("+₴450.00")).toBeInTheDocument();
  });

  it("shows Show proximity button on a losing completed draw", async () => {
    mockHistory.mockResolvedValueOnce([_loser]);
    render(<History />);
    expect(await screen.findByText(/Show proximity/)).toBeInTheDocument();
  });

  it("expanding proximity shows bar details", async () => {
    const user = userEvent.setup();
    mockHistory.mockResolvedValueOnce([_loser]);
    render(<History />);
    await screen.findByText(/Show proximity/);
    await user.click(screen.getByText(/Show proximity/));
    expect(screen.getByText(/Your ticket/)).toBeInTheDocument();
  });

  it("uses currency symbol from country API", async () => {
    mockCountry.mockResolvedValueOnce({ id: 1, currencySymbol: "€" });
    mockHistory.mockResolvedValueOnce([_winner]);
    render(<History />);
    expect(await screen.findByText("+€450.00")).toBeInTheDocument();
  });

  it("passes user countryId to draws.history", async () => {
    mockHistory.mockResolvedValueOnce([]);
    render(<History />);
    await screen.findByText(/No completed draws/);
    expect(mockHistory).toHaveBeenCalledWith(1);
  });
});
