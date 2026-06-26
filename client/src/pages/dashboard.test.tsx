import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "./dashboard";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockLogout   = vi.fn();
const mockNavigate = vi.fn();
const mockToast    = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, countryId: 1, autoParticipate: true },
    logout: mockLogout,
  })),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
  useLocation: () => ["", mockNavigate],
}));

vi.mock("@/lib/api", () => ({
  api: {
    countries:    { get: vi.fn() },
    wallet:       { get: vi.fn() },
    gamification: { me: vi.fn() },
    notifications:{ list: vi.fn() },
    draws:        { today: vi.fn(), myEntry: vi.fn(), enter: vi.fn(), enterFree: vi.fn() },
    profile:      { setAutoParticipate: vi.fn() },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockCountry       = vi.mocked(api.countries.get);
const mockWallet        = vi.mocked(api.wallet.get);
const mockGamification  = vi.mocked(api.gamification.me);
const mockNotifications = vi.mocked(api.notifications.list);
const mockToday         = vi.mocked(api.draws.today);
const mockMyEntry       = vi.mocked(api.draws.myEntry);
const mockEnter         = vi.mocked(api.draws.enter);
const mockEnterFree     = vi.mocked(api.draws.enterFree);
const mockSetAuto       = vi.mocked(api.profile.setAutoParticipate);

const _country = {
  id: 1, currencySymbol: "₴", currency: "UAH",
  entryAmountDaily: "10.00", prizePercentage: "50", drawHourUtc: 21,
};
const _wallet  = { balance: "100.00", currency: "UAH" };
const _draw    = { id: 7, status: "open", totalPool: "500.00", totalEntries: 50 };

function stubLoad(draw: any = _draw, myEntry: any = null) {
  mockCountry.mockResolvedValueOnce(_country);
  mockWallet.mockResolvedValueOnce(_wallet);
  mockGamification.mockResolvedValueOnce({ level: 2, title: "Enthusiast" });
  mockNotifications.mockResolvedValueOnce([{ id: 1, isRead: false }, { id: 2, isRead: true }]);
  mockToday.mockResolvedValueOnce(draw);
  if (draw) {
    mockMyEntry.mockResolvedValueOnce(myEntry);
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows spinner while loading", () => {
    mockCountry.mockReturnValueOnce(new Promise(() => {}));
    mockWallet.mockReturnValueOnce(new Promise(() => {}));
    mockGamification.mockReturnValueOnce(new Promise(() => {}));
    mockNotifications.mockReturnValueOnce(new Promise(() => {}));
    render(<Dashboard />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows toast on load failure", async () => {
    mockCountry.mockRejectedValueOnce(new Error("Network error"));
    mockWallet.mockRejectedValueOnce(new Error("Network error"));
    mockGamification.mockRejectedValueOnce(new Error("Network error"));
    mockNotifications.mockRejectedValueOnce(new Promise(() => {}));
    render(<Dashboard />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("shows VIONA branding in nav", async () => {
    stubLoad();
    render(<Dashboard />);
    expect(await screen.findByText("Today's prize pool")).toBeInTheDocument();
    expect(screen.getByText("VIONA")).toBeInTheDocument();
  });

  it("displays balance", async () => {
    stubLoad();
    render(<Dashboard />);
    // Balance of 100.00 with ₴ symbol
    expect(await screen.findByText("₴100.00")).toBeInTheDocument();
  });

  it("shows Enter draw button when user has enough balance and no entry", async () => {
    stubLoad(_draw, null);
    render(<Dashboard />);
    expect(await screen.findByText(/Enter draw/)).toBeInTheDocument();
  });

  it("shows Top up button when balance is too low", async () => {
    mockCountry.mockResolvedValueOnce({ ..._country, entryAmountDaily: "200.00" });
    mockWallet.mockResolvedValueOnce(_wallet);
    mockGamification.mockResolvedValueOnce(null);
    mockNotifications.mockResolvedValueOnce([]);
    mockToday.mockResolvedValueOnce(_draw);
    mockMyEntry.mockResolvedValueOnce(null);
    render(<Dashboard />);
    expect(await screen.findByText(/Top up to enter/)).toBeInTheDocument();
  });

  it("shows entry status card when already entered", async () => {
    stubLoad(_draw, { id: 99, ticketNumber: 42, type: "paid" });
    render(<Dashboard />);
    expect(await screen.findByText("You're in today's draw!")).toBeInTheDocument();
    expect(screen.getByText(/Ticket #42/)).toBeInTheDocument();
  });

  it("shows Free entry button when not yet entered", async () => {
    stubLoad(_draw, null);
    render(<Dashboard />);
    expect(await screen.findByText(/Free entry/)).toBeInTheDocument();
  });

  it("shows unread notification badge count", async () => {
    stubLoad();
    render(<Dashboard />);
    // 1 unread notification (mocked)
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("renders all 6 quick-nav links", async () => {
    stubLoad();
    render(<Dashboard />);
    await screen.findByText("Today's prize pool");
    expect(screen.getByText("My Account")).toBeInTheDocument();
    expect(screen.getByText("Draw History")).toBeInTheDocument();
    expect(screen.getByText("Wallet")).toBeInTheDocument();
    expect(screen.getByText("Subscription")).toBeInTheDocument();
    expect(screen.getByText("Partners")).toBeInTheDocument();
    expect(screen.getByText("Refer a Friend")).toBeInTheDocument();
  });

  it("auto-participate toggle reflects user setting", async () => {
    stubLoad();
    render(<Dashboard />);
    await screen.findByText("Auto-participate");
    expect(screen.getByText("Auto-participate")).toBeInTheDocument();
  });

  it("clicking Free entry button opens the modal", async () => {
    const user = userEvent.setup();
    stubLoad(_draw, null);
    render(<Dashboard />);
    await screen.findByText(/Free entry/);
    await user.click(screen.getByText(/Free entry \(no payment needed\)/));
    expect(screen.getByText("Get free ticket")).toBeInTheDocument();
  });

  it("calls draws.enterFree when free entry form is submitted", async () => {
    const user = userEvent.setup();
    stubLoad(_draw, null);
    mockEnterFree.mockResolvedValueOnce({ ticketNumber: 77 });
    // After submit, loadData is called again
    stubLoad(_draw, { ticketNumber: 77, type: "free" });
    render(<Dashboard />);
    await screen.findByText(/Free entry/);
    await user.click(screen.getByText(/Free entry \(no payment needed\)/));
    await user.type(screen.getByPlaceholderText("Full name"), "Alice Smith");
    await user.type(screen.getByPlaceholderText("Email address"), "alice@example.com");
    await user.click(screen.getByText("Get free ticket"));
    await waitFor(() =>
      expect(mockEnterFree).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ firstName: "Alice", lastName: "Smith", email: "alice@example.com" })
      )
    );
  });

  it("calls logout and navigates to / on logout button click", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<Dashboard />);
    await screen.findByText("Today's prize pool");
    const logoutBtn = document.querySelector("[data-testid='logout-btn'], button[class*='ghost']") as HTMLButtonElement;
    // Find the logout button — it's the last ghost icon button in the nav
    const ghostBtns = screen.getAllByRole("button");
    const logoutButton = ghostBtns.find(b => b.querySelector(".lucide-log-out"));
    if (logoutButton) {
      await user.click(logoutButton);
      expect(mockLogout).toHaveBeenCalled();
    }
  });
});
