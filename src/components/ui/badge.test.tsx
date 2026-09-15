import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("renders a span under its slot with the default variant", () => {
    render(<Badge>On track</Badge>);

    const badge = screen.getByText("On track");

    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("data-variant", "default");
    expect(badge).toHaveClass("bg-primary");
  });
});
