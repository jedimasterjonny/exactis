import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it.each([
    { token: "text-caution", tone: "caution" },
    { token: "text-positive", tone: "positive" },
  ] as const)("paints the $tone tone this app adds", ({ token, tone }) => {
    render(<Badge variant={tone}>Tone</Badge>);

    const badge = screen.getByText("Tone");

    expect(badge).toHaveClass(token);
    expect(badge).toHaveAttribute("data-variant", tone);
    // variant={null} means upstream contributes no variant classes, so the
    // default's background cannot be left underneath the tone's.
    expect(badge).not.toHaveClass("bg-primary");
  });

  it("passes an upstream variant through untouched", () => {
    render(<Badge variant="destructive">Debt</Badge>);

    const badge = screen.getByText("Debt");

    expect(badge).toHaveAttribute("data-variant", "destructive");
    expect(badge).toHaveClass("text-destructive");
  });

  it("renders the upstream default when no variant is given", () => {
    render(<Badge className="ml-1">Plain</Badge>);

    const badge = screen.getByText("Plain");

    expect(badge).toHaveAttribute("data-variant", "default");
    expect(badge).toHaveClass("bg-primary", "ml-1");
  });
});
