import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders a button under its slot with the default variant and size", () => {
    render(<Button>Assumptions</Button>);

    const button = screen.getByRole("button", { name: "Assumptions" });

    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveClass("bg-primary", "h-8");
  });
});
