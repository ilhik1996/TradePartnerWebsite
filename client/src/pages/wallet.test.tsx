import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletPage from "./wallet";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({ user: { id: 1, countryId: 1, kycLevel: "verified" } })),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    wallet: {
      get: vi.fn(),
      transactions: vi.fn(),
      deposit: vi.fn(),
      withdraw: vi.fn(),
    },
    countries: { get: vi.fn() },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockGet          = vi.mocked(api.wallet.get);
const mockTransactions = vi.mocked(api.wallet.transactions);
const mockCountry      = vi.mocked(api.countries.get);
const mockDeposit      = vi.mocked(api.wallet.deposit);
const mockWithdraw     = vi.mocked(api.wallet.withdraw);

const _wallet  = { balance: "250.00", currency: "UAH" };
const _country = { id: 1, currencySymbol: "₴", currency: "UAH", entryAmountDaily: "10.00" };
const _tx = {
  id: 99, type: "deposit", amount: "50.00", balanceAfter: "300.00",
  createdAt: "2026-06-01T10:00:00Z",
};

function stubLoad(wallet = _wallet, txs: any[] = [], country = _country) {
  mockGet.mockResolvedValueOnce(wallet);
  mockTransactions.mockResolvedValue(txs);
  mockCountry.mockResolvedValue(country);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Wallet page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows spinner while loading", () => {
    mockGet.mockReturnValueOnce(new Promise(() => {}));
    mockTransactions.mockReturnValueOnce(new Promise(() => {}));
    mockCountry.mockReturnValueOnce(new Promise(() => {}));
    render(<WalletPage />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows toast on load failure", async () => {
    mockGet.mockRejectedValueOnce(new Error("Network error"));
    mockTransactions.mockRejectedValueOnce(new Error("Network error"));
    mockCountry.mockRejectedValueOnce(new Error("Network error"));
    render(<WalletPage />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("displays balance after load", async () => {
    stubLoad();
    render(<WalletPage />);
    expect(await screen.findByText("₴250.00")).toBeInTheDocument();
  });

  it("shows Deposit tab by default", async () => {
    stubLoad();
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    // "Add funds" is both an h3 and the default button label — check via heading role
    expect(screen.getByRole("heading", { name: "Add funds" })).toBeInTheDocument();
  });

  it("switches to Withdraw tab", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    await user.click(screen.getByText("Withdraw"));
    expect(screen.getByText("Withdraw funds")).toBeInTheDocument();
  });

  it("renders quick-amount buttons computed from daily rate", async () => {
    stubLoad();
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    // Daily=10 → 7*10=70, 30*10=300, 100
    expect(screen.getByText("₴70")).toBeInTheDocument();
    expect(screen.getByText("₴300")).toBeInTheDocument();
    expect(screen.getByText("₴100")).toBeInTheDocument();
  });

  it("clicking a quick amount fills the input", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    await user.click(screen.getByText("₴70"));
    const input = screen.getByPlaceholderText(/Amount in UAH/) as HTMLInputElement;
    expect(input.value).toBe("70");
  });

  it("calls api.wallet.deposit with entered amount", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockDeposit.mockResolvedValueOnce({});
    mockTransactions.mockResolvedValue([]);
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    await user.type(screen.getByPlaceholderText(/Amount in UAH/), "50");
    await user.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() =>
      expect(mockDeposit).toHaveBeenCalledWith(50, "UAH")
    );
  });

  it("shows success toast after deposit", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockDeposit.mockResolvedValueOnce({});
    mockTransactions.mockResolvedValue([]);
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    await user.type(screen.getByPlaceholderText(/Amount in UAH/), "50");
    await user.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Balance topped up!" })
      )
    );
  });

  it("shows toast on deposit failure", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockDeposit.mockRejectedValueOnce(new Error("Card declined"));
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    await user.type(screen.getByPlaceholderText(/Amount in UAH/), "50");
    await user.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Deposit failed" })
      )
    );
  });

  it("calls api.wallet.withdraw on withdraw tab", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockWithdraw.mockResolvedValueOnce({ newBalance: 200 });
    mockTransactions.mockResolvedValue([]);
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    await user.click(screen.getByText("Withdraw"));
    await user.type(screen.getByPlaceholderText(/Amount \(max/), "50");
    await user.click(screen.getByRole("button", { name: "Request withdrawal" }));
    await waitFor(() =>
      expect(mockWithdraw).toHaveBeenCalledWith(50)
    );
  });

  it("shows empty state when no transactions", async () => {
    stubLoad(_wallet, []);
    render(<WalletPage />);
    expect(await screen.findByText("No transactions yet")).toBeInTheDocument();
  });

  it("renders transaction in list", async () => {
    stubLoad(_wallet, [_tx]);
    render(<WalletPage />);
    expect(await screen.findByText("Top up")).toBeInTheDocument();
    expect(screen.getByText("+₴50.00")).toBeInTheDocument();
  });

  it("shows KYC warning and disables deposit button when kycLevel is none", async () => {
    const { useAuth } = await import("@/hooks/use-auth");
    // mockReturnValue (not Once) so ALL re-renders during this test see kycLevel:"none"
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1, countryId: 1, kycLevel: "none" } } as any);
    stubLoad();
    render(<WalletPage />);
    await screen.findByText("₴250.00");
    expect(screen.getByText(/Age verification required/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add/ })).toBeDisabled();
    // Restore default so subsequent tests are unaffected
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1, countryId: 1, kycLevel: "verified" } } as any);
  });
});
