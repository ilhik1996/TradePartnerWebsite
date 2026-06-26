import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound page", () => {
  it("shows 404 heading", () => {
    render(<NotFound />);
    expect(screen.getByText("404 Page Not Found")).toBeInTheDocument();
  });

  it("shows router hint text", () => {
    render(<NotFound />);
    expect(screen.getByText(/Did you forget to add the page/)).toBeInTheDocument();
  });
});
