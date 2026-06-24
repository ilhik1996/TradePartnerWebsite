import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Admin from "./admin";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
  useLocation: () => ["", vi.fn()],
}));

vi.mock("@/lib/api", () => ({
  api: {
    admin: {
      login:              vi.fn(),
      stats:              vi.fn(),
      transactions:       vi.fn(),
      draws:              vi.fn(),
      countries:          vi.fn(),
      users:              vi.fn(),
      auditLogs:          vi.fn(),
      petition:           vi.fn(),
      conductDraw:        vi.fn(),
      createDraw:         vi.fn(),
      updateUserStatus:   vi.fn(),
      updateCountry:      vi.fn(),
      createCountry:      vi.fn(),
      createPartner:      vi.fn(),
      deletePartner:      vi.fn(),
      withdrawals:        vi.fn(),
      approveWithdrawal:  vi.fn(),
      rejectWithdrawal:   vi.fn(),
    },
    partners: { list: vi.fn() },
  },
  saveToken:  vi.fn(),
  clearToken: vi.fn(),
}));

// Recharts uses getBoundingClientRect + ResizeObserver inside ResponsiveContainer;
// replace with thin stubs so tests don't fail on DOM measurement
vi.mock("recharts", () => ({
  AreaChart:         ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area:              () => null,
  BarChart:          ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar:               () => null,
  XAxis:             () => null,
  YAxis:             () => null,
  CartesianGrid:     () => null,
  Tooltip:           () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockLogin            = vi.mocked(api.admin.login);
const mockStats            = vi.mocked(api.admin.stats);
const mockAdminTxs         = vi.mocked(api.admin.transactions);
const mockDraws            = vi.mocked(api.admin.draws);
const mockAdminCountries   = vi.mocked(api.admin.countries);
const mockUsers            = vi.mocked(api.admin.users);
const mockAuditLogs        = vi.mocked(api.admin.auditLogs);
const mockPetition         = vi.mocked(api.admin.petition);
const mockConductDraw      = vi.mocked(api.admin.conductDraw);
const mockUpdateUserStatus = vi.mocked(api.admin.updateUserStatus);
const mockWithdrawals      = vi.mocked(api.admin.withdrawals);
const mockApprove          = vi.mocked(api.admin.approveWithdrawal);
const mockPartnersList     = vi.mocked(api.partners.list);

const _stats = { totalUsers: 42, completedDraws: 7, totalDeposits: "1000.00", totalPrizesPaid: "500.00" };
const _draw  = { id: 1, drawDate: "2026-06-24", status: "open", totalPool: "300.00", prizeAmount: null, totalEntries: 10 };
const _user  = { id: 5, email: "alice@example.com", status: "active", kycLevel: "none", countryId: 1, createdAt: "2026-01-01T00:00:00Z" };

function stubOverview() {
  mockStats.mockResolvedValueOnce(_stats);
  mockAdminTxs.mockResolvedValueOnce([]);
}

function logIn() {
  localStorage.setItem("viona_admin_token", "tok");
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Admin page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
  });

  // ── Login form ──

  it("shows login form when no admin token in localStorage", () => {
    render(<Admin />);
    expect(screen.getByText("VIONA Admin")).toBeInTheDocument();
    expect(screen.getByText("Management Console")).toBeInTheDocument();
  });

  it("login form has email and password inputs", () => {
    render(<Admin />);
    expect(screen.getByPlaceholderText("Admin email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
  });

  it("login form has Sign in button", () => {
    render(<Admin />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("submitting login form calls api.admin.login with credentials", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({ token: "admin-token" });
    stubOverview();
    render(<Admin />);
    await user.type(screen.getByPlaceholderText("Admin email"), "admin@viona.app");
    await user.type(screen.getByPlaceholderText("Password"), "admin123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith("admin@viona.app", "admin123")
    );
  });

  it("successful login saves token and shows admin panel", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({ token: "admin-token" });
    stubOverview();
    render(<Admin />);
    await user.type(screen.getByPlaceholderText("Admin email"), "admin@viona.app");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    // Admin sidebar heading appears after login
    expect(await screen.findByText("VIONA Admin", { selector: "span" })).toBeInTheDocument();
  });

  it("shows error message on login failure", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));
    render(<Admin />);
    await user.type(screen.getByPlaceholderText("Admin email"), "bad@viona.app");
    await user.type(screen.getByPlaceholderText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  // ── Admin panel (logged in) ──

  it("shows VIONA Admin in sidebar when logged in", async () => {
    logIn();
    stubOverview();
    render(<Admin />);
    // Wait for overview to render stat cards, then check sidebar label
    expect(await screen.findByText("Total users")).toBeInTheDocument();
    expect(screen.getAllByText("VIONA Admin").length).toBeGreaterThan(0);
  });

  it("renders all 9 navigation sections in sidebar", async () => {
    logIn();
    stubOverview();
    render(<Admin />);
    expect(await screen.findByText("Total users")).toBeInTheDocument();
    for (const label of ["Overview", "Draws", "Users", "Markets", "Finance", "Withdrawals", "Partners", "Audit", "Petition"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("defaults to Overview section heading", async () => {
    logIn();
    stubOverview();
    render(<Admin />);
    expect(await screen.findByRole("heading", { name: /overview/i })).toBeInTheDocument();
  });

  it("Overview shows Total users stat after load", async () => {
    logIn();
    stubOverview();
    render(<Admin />);
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("Total users")).toBeInTheDocument();
  });

  it("Overview shows Completed draws stat", async () => {
    logIn();
    stubOverview();
    render(<Admin />);
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText("Completed draws")).toBeInTheDocument();
  });

  // ── Navigation ──

  it("clicking Draws nav loads DrawsPanel", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockDraws.mockResolvedValueOnce([]);
    render(<Admin />);
    await screen.findByText("Total users");
    // Click in sidebar (desktop nav)
    const drawsBtns = screen.getAllByText("Draws");
    await user.click(drawsBtns[0]);
    // h2 = main section heading (lowercase "draws" via capitalize CSS); check it appears
    expect(await screen.findByRole("heading", { name: /draws/i, level: 2 })).toBeInTheDocument();
  });

  it("DrawsPanel shows draw card", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockDraws.mockResolvedValueOnce([_draw]);
    render(<Admin />);
    await screen.findByText("Total users");
    const drawsBtns = screen.getAllByText("Draws");
    await user.click(drawsBtns[0]);
    expect(await screen.findByText("#1 · 2026-06-24")).toBeInTheDocument();
  });

  it("DrawsPanel: Conduct button calls api.admin.conductDraw", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockDraws.mockResolvedValueOnce([_draw]);
    mockConductDraw.mockResolvedValueOnce({ winnerUserId: 99 });
    mockDraws.mockResolvedValueOnce([{ ..._draw, status: "completed" }]);
    render(<Admin />);
    await screen.findByText("Total users");
    const drawsBtns = screen.getAllByText("Draws");
    await user.click(drawsBtns[0]);
    expect(await screen.findByRole("button", { name: /Conduct/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Conduct/ }));
    await waitFor(() => expect(mockConductDraw).toHaveBeenCalledWith(1));
  });

  it("clicking Users nav loads UsersPanel with search input", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockUsers.mockResolvedValueOnce([]);
    render(<Admin />);
    await screen.findByText("Total users");
    const userBtns = screen.getAllByText("Users");
    await user.click(userBtns[0]);
    expect(await screen.findByPlaceholderText("Search by email, name…")).toBeInTheDocument();
  });

  it("UsersPanel shows user in list", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockUsers.mockResolvedValueOnce([_user]);
    render(<Admin />);
    await screen.findByText("Total users");
    const userBtns = screen.getAllByText("Users");
    await user.click(userBtns[0]);
    expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
  });

  it("UsersPanel Ban button calls api.admin.updateUserStatus", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockUsers.mockResolvedValueOnce([_user]);
    mockUpdateUserStatus.mockResolvedValueOnce({});
    render(<Admin />);
    await screen.findByText("Total users");
    const userBtns = screen.getAllByText("Users");
    await user.click(userBtns[0]);
    await screen.findByText("alice@example.com");
    await user.click(screen.getByText("Ban"));
    await waitFor(() =>
      expect(mockUpdateUserStatus).toHaveBeenCalledWith(5, "banned")
    );
  });

  it("clicking Withdrawals nav shows empty state when no pending", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockWithdrawals.mockResolvedValueOnce([]);
    render(<Admin />);
    await screen.findByText("Total users");
    const wBtns = screen.getAllByText("Withdrawals");
    await user.click(wBtns[0]);
    expect(await screen.findByText("No pending withdrawals")).toBeInTheDocument();
  });

  it("Withdrawals Approve button calls api.admin.approveWithdrawal", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockWithdrawals.mockResolvedValueOnce([{ id: 3, userId: 5, amount: "-50.00", email: "alice@example.com", createdAt: "2026-06-24T00:00:00Z" }]);
    mockApprove.mockResolvedValueOnce({});
    mockWithdrawals.mockResolvedValueOnce([]);
    render(<Admin />);
    await screen.findByText("Total users");
    const wBtns = screen.getAllByText("Withdrawals");
    await user.click(wBtns[0]);
    await screen.findByRole("button", { name: /Approve/ });
    await user.click(screen.getByRole("button", { name: /Approve/ }));
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(3));
  });

  it("clicking Audit nav shows empty state", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockAuditLogs.mockResolvedValueOnce([]);
    render(<Admin />);
    await screen.findByText("Total users");
    const auditBtns = screen.getAllByText("Audit");
    await user.click(auditBtns[0]);
    expect(await screen.findByText("No audit events yet")).toBeInTheDocument();
  });

  it("clicking Audit nav shows log entry when present", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockAuditLogs.mockResolvedValueOnce([{
      id: 1, action: "draw.conduct", entityType: "draw", entityId: 1,
      adminUserId: 1, dataAfter: null, createdAt: "2026-06-24T10:00:00Z",
    }]);
    render(<Admin />);
    await screen.findByText("Total users");
    const auditBtns = screen.getAllByText("Audit");
    await user.click(auditBtns[0]);
    expect(await screen.findByText("draw.conduct")).toBeInTheDocument();
  });

  it("clicking Partners nav shows empty state when no partners", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockPartnersList.mockResolvedValueOnce([]);
    render(<Admin />);
    await screen.findByText("Total users");
    const partnerBtns = screen.getAllByText("Partners");
    await user.click(partnerBtns[0]);
    expect(await screen.findByText("No partners configured")).toBeInTheDocument();
  });

  it("clicking Petition nav shows total signatures count", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    mockPetition.mockResolvedValueOnce({
      total: 123,
      byCountry: { UA: 100, PH: 23 },
      signatures: [],
    });
    render(<Admin />);
    await screen.findByText("Total users");
    const petitionBtns = screen.getAllByText("Petition");
    await user.click(petitionBtns[0]);
    expect(await screen.findByText("123")).toBeInTheDocument();
    expect(screen.getByText("Total active signatures")).toBeInTheDocument();
  });

  it("Sign out clears localStorage and returns to login form", async () => {
    const user = userEvent.setup();
    logIn();
    stubOverview();
    render(<Admin />);
    await screen.findByText("Total users");
    await user.click(screen.getByText("Sign out"));
    expect(localStorage.getItem("viona_admin_token")).toBeNull();
    expect(await screen.findByText("Management Console")).toBeInTheDocument();
  });
});
