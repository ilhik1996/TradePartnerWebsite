import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Subscription from "./subscription";

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
    countries:    { get: vi.fn() },
    subscription: { get: vi.fn(), history: vi.fn(), create: vi.fn(), cancel: vi.fn() },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockCountry      = vi.mocked(api.countries.get);
const mockSubGet       = vi.mocked(api.subscription.get);
const mockSubHistory   = vi.mocked(api.subscription.history);
const mockSubCreate    = vi.mocked(api.subscription.create);
const mockSubCancel    = vi.mocked(api.subscription.cancel);

const _country = {
  id: 1, currencySymbol: "₴", currency: "UAH",
  entryAmountDaily: "10.00", entryAmountWeekly: "60.00", entryAmountMonthly: "200.00",
};
const _activeSub = {
  id: 5, type: "weekly", status: "active",
  startDate: "2026-06-01T00:00:00Z", nextBillingDate: "2026-07-01T00:00:00Z",
  cancelledAt: null, amount: "60.00",
};

function stubLoad(sub: any = null, history: any[] = []) {
  mockCountry.mockResolvedValueOnce(_country);
  mockSubGet.mockResolvedValueOnce(sub);
  mockSubHistory.mockResolvedValueOnce(history);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Subscription page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows spinner while loading", () => {
    mockCountry.mockReturnValueOnce(new Promise(() => {}));
    mockSubGet.mockReturnValueOnce(new Promise(() => {}));
    mockSubHistory.mockReturnValueOnce(new Promise(() => {}));
    render(<Subscription />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows toast on load failure", async () => {
    mockCountry.mockRejectedValueOnce(new Error("Network error"));
    mockSubGet.mockRejectedValueOnce(new Error("Network error"));
    mockSubHistory.mockRejectedValueOnce(new Error("Network error"));
    render(<Subscription />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("renders Weekly and Monthly plan cards", async () => {
    stubLoad();
    render(<Subscription />);
    expect(await screen.findByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
  });

  it("shows plan prices from country data", async () => {
    stubLoad();
    render(<Subscription />);
    await screen.findByText("Weekly");
    expect(screen.getByText("₴60.00")).toBeInTheDocument();
    expect(screen.getByText("₴200.00")).toBeInTheDocument();
  });

  it("shows Subscribe buttons when no active subscription", async () => {
    stubLoad(null);
    render(<Subscription />);
    await screen.findByText("Weekly");
    expect(screen.getByRole("button", { name: /Subscribe.*60/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Subscribe.*200/ })).toBeInTheDocument();
  });

  it("shows Active badge on the currently active plan", async () => {
    stubLoad(_activeSub);
    render(<Subscription />);
    await screen.findByText("Weekly");
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("calls subscription.create on Subscribe click", async () => {
    const user = userEvent.setup();
    stubLoad(null);
    mockSubCreate.mockResolvedValueOnce({});
    // re-stub after create (load() is called again)
    stubLoad(null);
    render(<Subscription />);
    await screen.findByText("Weekly");
    await user.click(screen.getByRole("button", { name: /Subscribe.*60/ }));
    await waitFor(() =>
      expect(mockSubCreate).toHaveBeenCalledWith("weekly")
    );
  });

  it("shows success toast after subscribe", async () => {
    const user = userEvent.setup();
    stubLoad(null);
    mockSubCreate.mockResolvedValueOnce({});
    stubLoad(null);
    render(<Subscription />);
    await screen.findByText("Weekly");
    await user.click(screen.getByRole("button", { name: /Subscribe.*60/ }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Subscription active!" })
      )
    );
  });

  it("clicking the active plan button opens cancel dialog", async () => {
    const user = userEvent.setup();
    stubLoad(_activeSub);
    render(<Subscription />);
    await screen.findByText("Weekly");
    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));
    expect(screen.getByText("Cancel subscription?")).toBeInTheDocument();
  });

  it("Keep it button closes cancel dialog", async () => {
    const user = userEvent.setup();
    stubLoad(_activeSub);
    render(<Subscription />);
    await screen.findByText("Weekly");
    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));
    expect(screen.getByText("Cancel subscription?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByText("Cancel subscription?")).not.toBeInTheDocument();
  });

  it("confirming cancel calls subscription.cancel", async () => {
    const user = userEvent.setup();
    stubLoad(_activeSub);
    mockSubCancel.mockResolvedValueOnce({});
    stubLoad(null);
    render(<Subscription />);
    await screen.findByText("Weekly");
    // Plan card button sets cancelConfirm=true
    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));
    // Wait for the modal heading to appear
    expect(await screen.findByText("Cancel subscription?")).toBeInTheDocument();
    // The modal confirmation button appears after the plan card button; click the last one
    const allCancelBtns = screen.getAllByRole("button", { name: "Cancel subscription" });
    await user.click(allCancelBtns[allCancelBtns.length - 1]);
    await waitFor(() =>
      expect(mockSubCancel).toHaveBeenCalledWith(5)
    );
  });

  it("shows subscription history when present", async () => {
    const hist = [
      { id: 1, type: "weekly", status: "cancelled", startDate: "2026-05-01T00:00:00Z",
        cancelledAt: "2026-05-15T00:00:00Z", amount: "60.00" },
    ];
    stubLoad(null, hist);
    render(<Subscription />);
    await screen.findByText("Weekly");
    expect(await screen.findByText("weekly subscription")).toBeInTheDocument();
  });

  it("does not show history section when history is empty", async () => {
    stubLoad(null, []);
    render(<Subscription />);
    await screen.findByText("Weekly");
    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });
});
