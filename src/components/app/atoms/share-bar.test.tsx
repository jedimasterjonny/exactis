import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { ShareBar } from "./share-bar";

// The bar is hidden from the accessibility tree, so no query is better
// than the slot, and the suggestion to find one is switched off here.
function fill(): HTMLElement {
  return screen.getByText(bySlot("share-bar-fill"), { suggest: false });
}

describe("ShareBar", () => {
  it("fills the share it is given, hidden from the tree", () => {
    render(<ShareBar share={0.25} />);

    expect(
      screen.getByText(bySlot("share-bar"), { suggest: false }),
    ).toHaveAttribute("aria-hidden", "true");
    expect(fill()).toHaveStyle({ width: "25%" });
  });

  // A loan above the value is a share below nothing, and a whole of
  // nothing is no share at all, 0/0 being NaN.
  it("holds the share between nothing and the whole, and draws none of nothing", () => {
    const { rerender } = render(<ShareBar share={-0.5} />);

    expect(fill()).toHaveStyle({ width: "0%" });

    rerender(<ShareBar share={1.5} />);

    expect(fill()).toHaveStyle({ width: "100%" });

    rerender(<ShareBar share={Number.NaN} />);

    expect(fill()).toHaveStyle({ width: "0%" });
  });

  it("is a stub unless the caller's class draws it wider", () => {
    const { rerender } = render(<ShareBar share={1} />);

    expect(
      screen.getByText(bySlot("share-bar"), { suggest: false }),
    ).toHaveClass("w-16");

    rerender(<ShareBar className="w-full" share={1} />);

    const bar = screen.getByText(bySlot("share-bar"), { suggest: false });

    expect(bar).toHaveClass("w-full");
    expect(bar).not.toHaveClass("w-16");
  });
});
