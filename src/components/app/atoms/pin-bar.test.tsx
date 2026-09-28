import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Plan } from "@/data/plan";

import { bySlot } from "@/test/dom";

import { PinBar } from "./pin-bar";

// Forty years from 2026, so the span ends in 2066 and the shares are round.
const plan: Plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0.05,
  retires: 90,
  years: 40,
};

describe("PinBar", () => {
  it("pins a year in oxide where it begins on the plan's span, hidden from the tree", () => {
    render(<PinBar plan={plan} year={2036} />);

    expect(screen.getByText(bySlot("pin-bar"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText(bySlot("pin-bar-pin"))).toHaveStyle({
      left: "25%",
    });
    expect(screen.getByText(bySlot("pin-bar-pin"))).toHaveClass("bg-brand");
  });

  it("holds a year outside the span to its edge", () => {
    const { rerender } = render(<PinBar plan={plan} year={2000} />);

    expect(screen.getByText(bySlot("pin-bar-pin"))).toHaveStyle({ left: "0%" });

    rerender(<PinBar plan={plan} year={2100} />);

    expect(screen.getByText(bySlot("pin-bar-pin"))).toHaveStyle({
      left: "100%",
    });
  });
});
