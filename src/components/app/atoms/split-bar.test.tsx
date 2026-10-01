import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { SplitBar } from "./split-bar";

// The bar is hidden from the accessibility tree, so no query is better
// than the slot, and the suggestion to find one is switched off here.
function part(slot: string): HTMLElement {
  return screen.getByText(bySlot(slot), { suggest: false });
}

describe("SplitBar", () => {
  it("draws stocks' share from the left in their colour and bonds after them, hidden from the tree", () => {
    render(<SplitBar share={0.9} />);

    expect(part("split-bar")).toHaveAttribute("aria-hidden", "true");
    expect(part("split-bar-stocks")).toHaveStyle({ width: "90%" });
    expect(part("split-bar-stocks")).toHaveClass("bg-chart-1");
    expect(part("split-bar-bonds")).toHaveClass("flex-1", "bg-chart-2");
  });

  it("holds a share outside the whole to its edge", () => {
    const { rerender } = render(<SplitBar share={1.2} />);

    expect(part("split-bar-stocks")).toHaveStyle({ width: "100%" });

    rerender(<SplitBar share={-0.1} />);

    expect(part("split-bar-stocks")).toHaveStyle({ width: "0%" });
  });
});
