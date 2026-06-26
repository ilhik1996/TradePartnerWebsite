import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Partners from "./partners";

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
    partners: { list: vi.fn() },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { api } = await import("@/lib/api");
const mockList = vi.mocked(api.partners.list);

const _twoPartners = [
  { id: 1, name: "Rozetka", category: "retail", cashbackPercent: 10, description: "Electronics store" },
  { id: 2, name: "McDonald's", category: "food", cashbackPercent: 0, description: "Fast food" },
];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Partners page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state while fetching", () => {
    mockList.mockReturnValueOnce(new Promise(() => {}));
    render(<Partners />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders partner cards after successful load", async () => {
    mockList.mockResolvedValueOnce(_twoPartners);
    render(<Partners />);
    expect(await screen.findByText("Rozetka")).toBeInTheDocument();
    expect(await screen.findByText("McDonald's")).toBeInTheDocument();
  });

  it("shows empty state when no partners returned", async () => {
    mockList.mockResolvedValueOnce([]);
    render(<Partners />);
    expect(await screen.findByText("No partners found")).toBeInTheDocument();
  });

  it("shows toast on API failure", async () => {
    mockList.mockRejectedValueOnce(new Error("Server error"));
    render(<Partners />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });

  it("shows cashback badge when cashback > 0", async () => {
    mockList.mockResolvedValueOnce(_twoPartners);
    render(<Partners />);
    await screen.findByText("Rozetka");
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("back")).toBeInTheDocument();
  });

  it("does not show cashback badge when cashback is 0", async () => {
    mockList.mockResolvedValueOnce(_twoPartners);
    render(<Partners />);
    await screen.findByText("McDonald's");
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows category and description", async () => {
    mockList.mockResolvedValueOnce(_twoPartners);
    render(<Partners />);
    expect(await screen.findByText("Electronics store")).toBeInTheDocument();
    expect(screen.getByText(/retail/)).toBeInTheDocument();
  });

  it("filters partners by name when typing in search", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(_twoPartners);
    render(<Partners />);
    await screen.findByText("Rozetka");

    await user.type(screen.getByPlaceholderText("Search partners…"), "Roz");
    expect(screen.getByText("Rozetka")).toBeInTheDocument();
    expect(screen.queryByText("McDonald's")).not.toBeInTheDocument();
  });

  it("filters partners by category", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(_twoPartners);
    render(<Partners />);
    await screen.findByText("Rozetka");

    await user.type(screen.getByPlaceholderText("Search partners…"), "food");
    expect(screen.getByText("McDonald's")).toBeInTheDocument();
    expect(screen.queryByText("Rozetka")).not.toBeInTheDocument();
  });

  it("shows all partners again after clearing search", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(_twoPartners);
    render(<Partners />);
    await screen.findByText("Rozetka");

    const searchInput = screen.getByPlaceholderText("Search partners…");
    await user.type(searchInput, "Roz");
    await user.clear(searchInput);
    expect(screen.getByText("Rozetka")).toBeInTheDocument();
    expect(screen.getByText("McDonald's")).toBeInTheDocument();
  });

  it("shows no-results state when search finds nothing", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(_twoPartners);
    render(<Partners />);
    await screen.findByText("Rozetka");

    await user.type(screen.getByPlaceholderText("Search partners…"), "zzznomatch");
    expect(screen.getByText("No partners found")).toBeInTheDocument();
  });

  it("passes countryId from user to API call", async () => {
    mockList.mockResolvedValueOnce([]);
    render(<Partners />);
    await screen.findByText("No partners found");
    expect(mockList).toHaveBeenCalledWith(1);
  });
});
