import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Cabinet from "./cabinet";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockLogout   = vi.fn();
const mockNavigate = vi.fn();
const mockToast    = vi.fn();
const mockRefresh  = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, countryId: 1, email: "user@example.com", kycLevel: "none" },
    logout: mockLogout,
    refresh: mockRefresh,
  })),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/use-push", () => ({
  usePush: () => ({ supported: false, permission: "default", subscribe: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
  useLocation: () => ["", mockNavigate],
}));

vi.mock("@/lib/api", () => ({
  api: {
    profile: {
      get:                  vi.fn(),
      getResponsibleGaming: vi.fn(),
      update:               vi.fn(),
      setResponsibleGaming: vi.fn(),
      selfExclude:          vi.fn(),
    },
    draws:        { history: vi.fn() },
    gamification: { me: vi.fn(), leaderboard: vi.fn() },
    kyc:          { start: vi.fn() },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockProfileGet  = vi.mocked(api.profile.get);
const mockRgGet       = vi.mocked(api.profile.getResponsibleGaming);
const mockHistory     = vi.mocked(api.draws.history);
const mockGamify      = vi.mocked(api.gamification.me);
const mockLeaderboard = vi.mocked(api.gamification.leaderboard);
const mockProfileUpd  = vi.mocked(api.profile.update);
const mockSaveRg      = vi.mocked(api.profile.setResponsibleGaming);
const mockSelfExclude = vi.mocked(api.profile.selfExclude);
const mockKycStart    = vi.mocked(api.kyc.start);

const _profile = { firstName: "Alice", lastName: "Smith" };
const _rg = {
  dailyLimitAmount: "50.00", weeklyLimitAmount: "", monthlyLimitAmount: "",
  spentToday: 10, spentThisWeek: 20, spentThisMonth: 30,
};
const _gamification = {
  level: 3, title: "Pro", xp: 120, currentLevelXp: 100, nextLevelXp: 200,
  badges: ["first_entry"],
};
const _draw = {
  id: 5, drawDate: "2026-06-24", status: "completed",
  totalPool: "500.00", prizeAmount: "250.00", totalEntries: 20, isWinner: true,
};

function stubLoad(profile = _profile, rg: any = _rg, draws: any[] = [], gam: any = null, lb: any[] = []) {
  mockProfileGet.mockResolvedValueOnce(profile);
  mockRgGet.mockResolvedValueOnce(rg);
  mockHistory.mockResolvedValueOnce(draws);
  mockGamify.mockResolvedValueOnce(gam);
  mockLeaderboard.mockResolvedValueOnce(lb);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Cabinet page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows spinner while loading", () => {
    mockProfileGet.mockReturnValueOnce(new Promise(() => {}));
    mockRgGet.mockReturnValueOnce(new Promise(() => {}));
    mockHistory.mockReturnValueOnce(new Promise(() => {}));
    mockGamify.mockReturnValueOnce(new Promise(() => {}));
    render(<Cabinet />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows toast on load failure", async () => {
    mockProfileGet.mockRejectedValueOnce(new Error("Network error"));
    mockRgGet.mockRejectedValueOnce(new Error("Network error"));
    mockHistory.mockRejectedValueOnce(new Error("Network error"));
    mockGamify.mockRejectedValueOnce(new Error("Network error"));
    render(<Cabinet />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("shows My Account header after load", async () => {
    stubLoad();
    render(<Cabinet />);
    expect(await screen.findByText("My Account")).toBeInTheDocument();
  });

  it("Account tab is active by default and shows Personal info", async () => {
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("My Account");
    expect(screen.getByText("Personal info")).toBeInTheDocument();
  });

  it("pre-populates first and last name inputs from profile", async () => {
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("Personal info");
    expect((screen.getByPlaceholderText("First name") as HTMLInputElement).value).toBe("Alice");
    expect((screen.getByPlaceholderText("Last name") as HTMLInputElement).value).toBe("Smith");
  });

  it("Save changes calls api.profile.update with edited values", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockProfileUpd.mockResolvedValueOnce({});
    render(<Cabinet />);
    await screen.findByText("Personal info");
    const firstInput = screen.getByPlaceholderText("First name") as HTMLInputElement;
    await user.clear(firstInput);
    await user.type(firstInput, "Bob");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mockProfileUpd).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: "Bob" })
      )
    );
  });

  it("Save changes shows success toast", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockProfileUpd.mockResolvedValueOnce({});
    render(<Cabinet />);
    await screen.findByText("Personal info");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Profile updated" })
      )
    );
  });

  it("KYC section shows Verify age button when kycLevel is none", async () => {
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("KYC Verification");
    expect(screen.getByRole("button", { name: "Verify age (18+)" })).toBeInTheDocument();
  });

  it("clicking Verify age opens KYC age modal", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("KYC Verification");
    await user.click(screen.getByRole("button", { name: "Verify age (18+)" }));
    expect(screen.getByText("Age verification")).toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
  });

  it("KYC submit button disabled when DOB is empty", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("KYC Verification");
    await user.click(screen.getByRole("button", { name: "Verify age (18+)" }));
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("closing KYC modal removes it", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("KYC Verification");
    await user.click(screen.getByRole("button", { name: "Verify age (18+)" }));
    expect(screen.getByText("Age verification")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Age verification")).not.toBeInTheDocument();
  });

  it("KYC age submit calls api.kyc.start with level and dateOfBirth", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockKycStart.mockResolvedValueOnce({});
    mockRefresh.mockResolvedValueOnce(undefined);
    render(<Cabinet />);
    await screen.findByText("KYC Verification");
    await user.click(screen.getByRole("button", { name: "Verify age (18+)" }));
    await user.type(document.querySelector('input[type="date"]') as HTMLInputElement, "2000-01-01");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(mockKycStart).toHaveBeenCalledWith(
        expect.objectContaining({ level: "age", dateOfBirth: "2000-01-01" })
      )
    );
  });

  it("Sign out button calls logout and navigates to /", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("Sign out");
    await user.click(screen.getByText("Sign out"));
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("switching to Draws tab shows empty state when no draws", async () => {
    const user = userEvent.setup();
    stubLoad(_profile, _rg, []);
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Draws" }));
    expect(screen.getByText("No completed draws yet in your market.")).toBeInTheDocument();
  });

  it("Draws tab renders draw card with date and status", async () => {
    const user = userEvent.setup();
    stubLoad(_profile, _rg, [_draw]);
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Draws" }));
    expect(screen.getByText("2026-06-24")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("You won this draw!")).toBeInTheDocument();
  });

  it("Level tab shows level and title", async () => {
    const user = userEvent.setup();
    stubLoad(_profile, _rg, [], _gamification);
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Level" }));
    expect(screen.getByText(/Level 3.*Pro/)).toBeInTheDocument();
  });

  it("Level tab shows badge earned", async () => {
    const user = userEvent.setup();
    stubLoad(_profile, _rg, [], _gamification);
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Level" }));
    expect(screen.getByText(/First Entry/)).toBeInTheDocument();
  });

  it("Level tab shows no badges message when badges is empty", async () => {
    const user = userEvent.setup();
    stubLoad(_profile, _rg, [], { ..._gamification, badges: [] });
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Level" }));
    expect(screen.getByText("No badges yet — start earning XP!")).toBeInTheDocument();
  });

  it("Level tab shows leaderboard when data is available", async () => {
    const user = userEvent.setup();
    const lb = [
      { rank: 1, userId: 99, displayName: "Top Player", totalXp: 500, level: 5, title: "Expert" },
      { rank: 2, userId: 1,  displayName: "Alice Smith", totalXp: 200, level: 3, title: "Explorer" },
    ];
    stubLoad(_profile, _rg, [], _gamification, lb);
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Level" }));
    expect(screen.getByText("Top Players")).toBeInTheDocument();
    expect(screen.getByText("Top Player")).toBeInTheDocument();
  });

  it("Level tab hides leaderboard when empty", async () => {
    const user = userEvent.setup();
    stubLoad(_profile, _rg, [], _gamification, []);
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Level" }));
    expect(screen.queryByText("Top Players")).not.toBeInTheDocument();
  });

  it("Safety tab shows Spending Limits section", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Safety" }));
    expect(screen.getByText("Spending Limits")).toBeInTheDocument();
  });

  it("Save limits calls api.profile.setResponsibleGaming", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockSaveRg.mockResolvedValueOnce({});
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Safety" }));
    const [dailyInput] = screen.getAllByPlaceholderText("No limit");
    await user.clear(dailyInput);
    await user.type(dailyInput, "100");
    await user.click(screen.getByRole("button", { name: "Save limits" }));
    await waitFor(() =>
      expect(mockSaveRg).toHaveBeenCalled()
    );
  });

  it("Save limits shows success toast", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockSaveRg.mockResolvedValueOnce({});
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Safety" }));
    await user.click(screen.getByRole("button", { name: "Save limits" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Limits saved" })
      )
    );
  });

  it("first self-exclusion click shows confirm warning, not immediate action", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Safety" }));
    const excludeBtn = screen.getByRole("button", { name: /Exclude for/ });
    await user.click(excludeBtn);
    expect(screen.getByText(/This will lock your account/)).toBeInTheDocument();
    expect(mockSelfExclude).not.toHaveBeenCalled();
  });

  it("confirming self-exclusion calls selfExclude, logout, and navigate", async () => {
    const user = userEvent.setup();
    stubLoad();
    mockSelfExclude.mockResolvedValueOnce({});
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Safety" }));
    await user.click(screen.getByRole("button", { name: /Exclude for/ }));
    await screen.findByText(/This will lock your account/);
    await user.click(screen.getByRole("button", { name: "Confirm exclusion" }));
    await waitFor(() => expect(mockSelfExclude).toHaveBeenCalled());
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("Cancel button in self-exclusion hides the confirm warning", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<Cabinet />);
    await screen.findByText("My Account");
    await user.click(screen.getByRole("button", { name: "Safety" }));
    await user.click(screen.getByRole("button", { name: /Exclude for/ }));
    await screen.findByText(/This will lock your account/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/This will lock your account/)).not.toBeInTheDocument();
  });
});
