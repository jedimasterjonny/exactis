import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { OutcomeMeter } from "./outcome-meter";

const graded = {
  almost: 40,
  barely: 120,
  comfortable: 500,
  early: 0,
  middle: 60,
  surplus: 280,
};

// The bar is hidden from the accessibility tree, so no query is better
// than the slot, and the suggestion to find one is switched off here.
function rest(): HTMLElement | null {
  return screen.queryByText(bySlot("outcome-meter-rest"), { suggest: false });
}

function shares(): HTMLElement[] {
  return screen.getAllByText(bySlot("outcome-meter-share"), { suggest: false });
}

describe("OutcomeMeter", () => {
  it("draws each outcome as long as its share, lasting first, hidden from the tree", () => {
    render(<OutcomeMeter count={1000} outcomes={graded} />);

    expect(
      screen.getByText(bySlot("outcome-meter"), { suggest: false }),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      shares().map((share) => [share.dataset["outcome"], share.style.flexGrow]),
    ).toStrictEqual([
      ["surplus", "280"],
      ["comfortable", "500"],
      ["barely", "120"],
      ["almost", "40"],
      ["middle", "60"],
    ]);
    expect(shares()[0]).toHaveClass("bg-outcome-surplus");
    expect(rest()).not.toBeInTheDocument();
  });

  it("draws the futures still to come as the rest while the run is drawn", () => {
    render(
      <OutcomeMeter
        count={1000}
        outcomes={{ ...graded, comfortable: 100, surplus: 80 }}
      />,
    );

    expect(rest()).toHaveStyle({ flexGrow: "600" });
  });

  it("draws nothing for an arm no future came to", () => {
    render(
      <OutcomeMeter
        count={3}
        outcomes={{
          ...graded,
          almost: 0,
          barely: 1,
          comfortable: 2,
          middle: 0,
          surplus: 0,
        }}
      />,
    );

    expect(shares().map((share) => share.dataset["outcome"])).toStrictEqual([
      "comfortable",
      "barely",
    ]);
  });
});
