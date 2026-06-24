import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "./login";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
  useLocation: () => ["", mockNavigate],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderLogin() {
  return render(<Login />);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders VIONA branding", () => {
    renderLogin();
    expect(screen.getByText("VIONA")).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });

  it("renders email/phone and password inputs", () => {
    renderLogin();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your password")).toBeInTheDocument();
  });

  it("renders Sign In button", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  it("shows register link", () => {
    renderLogin();
    expect(screen.getByText("Create one free")).toBeInTheDocument();
  });

  it("shows 18+ disclaimer", () => {
    renderLogin();
    expect(screen.getByText(/18\+ only/)).toBeInTheDocument();
  });

  it("password field is obscured by default", () => {
    renderLogin();
    const pwd = screen.getByPlaceholderText("Your password") as HTMLInputElement;
    expect(pwd.type).toBe("password");
  });

  it("visibility toggle reveals password text", async () => {
    const user = userEvent.setup();
    renderLogin();
    const pwd = screen.getByPlaceholderText("Your password") as HTMLInputElement;
    expect(pwd.type).toBe("password");
    // Eye icon button is the only type="button" on the page initially
    await user.click(screen.getAllByRole("button").find(b => b.getAttribute("type") === "button")!);
    expect(pwd.type).toBe("text");
  });

  it("does not call login when form is submitted empty", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("calls login with identifier and password on submit", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce(undefined);
    renderLogin();
    await user.type(screen.getByPlaceholderText("you@example.com"), "alice@example.com");
    await user.type(screen.getByPlaceholderText("Your password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith("alice@example.com", "secret123")
    );
  });

  it("navigates to /dashboard after successful login", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce(undefined);
    renderLogin();
    await user.type(screen.getByPlaceholderText("you@example.com"), "alice@example.com");
    await user.type(screen.getByPlaceholderText("Your password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows loading text while API call is in progress", async () => {
    const user = userEvent.setup();
    // Never resolves during the test
    mockLogin.mockReturnValueOnce(new Promise(() => {}));
    renderLogin();
    await user.type(screen.getByPlaceholderText("you@example.com"), "alice@example.com");
    await user.type(screen.getByPlaceholderText("Your password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Signing in…")).toBeInTheDocument();
  });

  it("submit button is disabled while loading", async () => {
    const user = userEvent.setup();
    mockLogin.mockReturnValueOnce(new Promise(() => {}));
    renderLogin();
    await user.type(screen.getByPlaceholderText("you@example.com"), "alice@example.com");
    await user.type(screen.getByPlaceholderText("Your password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    const btn = await screen.findByRole("button", { name: "Signing in…" });
    expect(btn).toBeDisabled();
  });

  it("shows toast on failed login", async () => {
    const mockToast = vi.fn();
    const { useToast } = await import("@/hooks/use-toast");
    vi.mocked(useToast).mockReturnValue({ toast: mockToast } as any);

    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));
    renderLogin();
    await user.type(screen.getByPlaceholderText("you@example.com"), "bad@example.com");
    await user.type(screen.getByPlaceholderText("Your password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });
});
