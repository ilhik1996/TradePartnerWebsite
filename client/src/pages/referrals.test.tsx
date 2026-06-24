import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Referrals from "./referrals";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, countryId: 1, referredBy: null } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    referrals: { my: vi.fn(), apply: vi.fn() },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockMy    = vi.mocked(api.referrals.my);
const mockApply = vi.mocked(api.referrals.apply);

const _data = {
  referralCode: "ABCD1234",
  referralCount: 3,
  totalBonusEarned: "15.00",
  referrals: [
    { id: 10, refereeId: 5, email: "friend@example.com", joinedAt: "2026-01-01T00:00:00Z", bonusAmount: "5.00", currency: "₴", status: "paid" },
  ],
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Referrals page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // stub clipboard (navigator.clipboard is read-only in jsdom, must use defineProperty)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("shows spinner while loading", () => {
    mockMy.mockReturnValueOnce(new Promise(() => {}));
    render(<Referrals />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows toast on API failure", async () => {
    mockMy.mockRejectedValueOnce(new Error("Server error"));
    render(<Referrals />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("renders referral code", async () => {
    mockMy.mockResolvedValueOnce(_data);
    render(<Referrals />);
    expect(await screen.findByText("ABCD1234")).toBeInTheDocument();
  });

  it("shows referral count and bonus stats", async () => {
    mockMy.mockResolvedValueOnce(_data);
    render(<Referrals />);
    await screen.findByText("ABCD1234");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("15.00")).toBeInTheDocument();
  });

  it("renders referred friend in list", async () => {
    mockMy.mockResolvedValueOnce(_data);
    render(<Referrals />);
    expect(await screen.findByText("friend@example.com")).toBeInTheDocument();
  });

  it("shows apply-code form when user has no referrer", async () => {
    mockMy.mockResolvedValueOnce(_data);
    render(<Referrals />);
    await screen.findByText("ABCD1234");
    expect(screen.getByPlaceholderText("XXXXXXXX")).toBeInTheDocument();
  });

  it("apply button is disabled when input is empty", async () => {
    mockMy.mockResolvedValueOnce(_data);
    render(<Referrals />);
    await screen.findByText("ABCD1234");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("calls api.referrals.apply with typed code", async () => {
    const user = userEvent.setup();
    mockMy.mockResolvedValueOnce(_data);
    mockApply.mockResolvedValueOnce({});
    render(<Referrals />);
    await screen.findByText("ABCD1234");
    await user.type(screen.getByPlaceholderText("XXXXXXXX"), "FRIEND99");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("FRIEND99")
    );
  });

  it("shows success toast on apply", async () => {
    const user = userEvent.setup();
    mockMy.mockResolvedValueOnce(_data);
    mockApply.mockResolvedValueOnce({});
    render(<Referrals />);
    await screen.findByText("ABCD1234");
    await user.type(screen.getByPlaceholderText("XXXXXXXX"), "FRIEND99");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Referral applied!" })
      )
    );
  });

  it("shows error toast when apply fails", async () => {
    const user = userEvent.setup();
    mockMy.mockResolvedValueOnce(_data);
    mockApply.mockRejectedValueOnce(new Error("Code not found"));
    render(<Referrals />);
    await screen.findByText("ABCD1234");
    await user.type(screen.getByPlaceholderText("XXXXXXXX"), "BADCODE");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("copies referral code to clipboard on copy button click", async () => {
    const user = userEvent.setup();
    // Capture the spy reference directly so we can assert on it later
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    mockMy.mockResolvedValueOnce(_data);
    render(<Referrals />);
    await screen.findByText("ABCD1234");
    const copyBtn = document.querySelector("button.viona-card") as HTMLButtonElement;
    await user.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith("ABCD1234");
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Copied!" })
      )
    );
  });
});
