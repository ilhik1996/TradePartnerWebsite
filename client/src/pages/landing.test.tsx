import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Landing from "./landing";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function stubFetch(stats: any = null, todayDraw: any = null) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: url.includes("stats") ? stats !== null : todayDraw !== null,
    json: async () => url.includes("stats") ? stats : todayDraw,
  })));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Landing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows VIONA branding in nav", () => {
    stubFetch();
    render(<Landing />);
    // VIONA appears in both nav and footer — verify at least one instance is present
    expect(screen.getAllByText("VIONA").length).toBeGreaterThan(0);
  });

  it("renders hero headline", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText(/Win every day/)).toBeInTheDocument();
  });

  it("renders Sign In and Get Started nav links", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  it("shows Join the next draw CTA button", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText("Join the next draw")).toBeInTheDocument();
  });

  it("shows Try for free secondary button", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText("Try for free")).toBeInTheDocument();
  });

  it("shows 18+ disclaimer", () => {
    stubFetch();
    render(<Landing />);
    // "18+ only" appears in both hero and footer
    expect(screen.getAllByText(/18\+ only/).length).toBeGreaterThan(0);
  });

  it("shows How VIONA works section", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText("How VIONA works")).toBeInTheDocument();
    expect(screen.getByText("Join the draw")).toBeInTheDocument();
    expect(screen.getByText("Pool grows")).toBeInTheDocument();
    expect(screen.getByText("Winner picked")).toBeInTheDocument();
  });

  it("shows available markets section with country cards", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText("Available markets")).toBeInTheDocument();
    expect(screen.getByText("Ukraine")).toBeInTheDocument();
    expect(screen.getByText("Philippines")).toBeInTheDocument();
  });

  it("shows Provably Fair stat", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText("Provably Fair")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows stats from API when loaded", async () => {
    stubFetch({ totalUsers: 1234, completedDraws: 42 }, null);
    render(<Landing />);
    expect(await screen.findByText("1234+")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows live pool banner when todayDraw has a pool", async () => {
    stubFetch(null, { totalPool: "850.00" });
    render(<Landing />);
    expect(await screen.findByText(/Today's live pool/)).toBeInTheDocument();
    expect(screen.getByText(/₴850\.00/)).toBeInTheDocument();
  });

  it("does not show live pool banner when pool is 0", async () => {
    stubFetch(null, { totalPool: "0.00" });
    render(<Landing />);
    // Wait briefly for fetch promises to resolve
    await new Promise(r => setTimeout(r, 10));
    expect(screen.queryByText(/Today's live pool/)).not.toBeInTheDocument();
  });

  it("shows Start for free CTA in bottom section", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText("Start for free")).toBeInTheDocument();
  });

  it("renders footer with copyright", () => {
    stubFetch();
    render(<Landing />);
    expect(screen.getByText(/© 2025 VIONA/)).toBeInTheDocument();
  });
});
