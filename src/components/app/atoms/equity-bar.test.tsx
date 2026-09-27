import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { EquityBar } from "./equity-bar";

// The bar is hidden from the accessibility tree, so no query is better
// than the slot, and the suggestion to find one is switched off here.
function fill(): HTMLElement {
  return screen.getByText(bySlot("equity-bar-fill"), { suggest: false });
}

describe("EquityBar", () => {
  it("fills the share of the value the equity is, hidden from the tree", () => {
    render(<EquityBar share={0.25} />);

    expect(
      screen.getByText(bySlot("equity-bar"), { suggest: false }),
    ).toHaveAttribute("aria-hidden", "true");
    expect(fill()).toHaveStyle({ width: "25%" });
  });

  // A loan above the value is a share below nothing, and a value of
  // nothing is no share at all, 0/0 being NaN.
  it("holds the share between nothing and the whole, and draws none for no value", () => {
    const { rerender } = render(<EquityBar share={-0.5} />);

    expect(fill()).toHaveStyle({ width: "0%" });

    rerender(<EquityBar share={1.5} />);

    expect(fill()).toHaveStyle({ width: "100%" });

    rerender(<EquityBar share={Number.NaN} />);

    expect(fill()).toHaveStyle({ width: "0%" });
  });

  it("is a stub unless the caller's class draws it wider", () => {
    const { rerender } = render(<EquityBar share={1} />);

    expect(
      screen.getByText(bySlot("equity-bar"), { suggest: false }),
    ).toHaveClass("w-16");

    rerender(<EquityBar className="w-full" share={1} />);

    const bar = screen.getByText(bySlot("equity-bar"), { suggest: false });

    expect(bar).toHaveClass("w-full");
    expect(bar).not.toHaveClass("w-16");
  });
});
