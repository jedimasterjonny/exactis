import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { SegmentBar } from "./segment-bar";

const lasting = [
  { key: "surplus", tone: "bg-outcome-surplus", value: 280 },
  { key: "comfortable", tone: "bg-outcome-comfortable", value: 500 },
  { key: "barely", tone: "bg-outcome-barely", value: 120 },
];

const short = [
  { key: "almost", tone: "bg-outcome-almost", value: 40 },
  { key: "middle", tone: "bg-outcome-middle", value: 60 },
  { key: "early", tone: "bg-outcome-early", value: 0 },
];

// The bar is hidden from the accessibility tree, so no query is better
// than the slot, and the suggestion to find one is switched off here.
function parts(): HTMLElement[] {
  return screen.getAllByText(bySlot("segment-bar-part"), { suggest: false });
}

function rest(): HTMLElement | null {
  return screen.queryByText(bySlot("segment-bar-rest"), { suggest: false });
}

describe("SegmentBar", () => {
  it("draws each part as long as its value, group by group, hidden from the tree", () => {
    render(<SegmentBar groups={[lasting, short]} total={1000} />);

    expect(
      screen.getByText(bySlot("segment-bar"), { suggest: false }),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      parts().map((part) => [part.dataset["segment"], part.style.flexGrow]),
    ).toStrictEqual([
      ["surplus", "280"],
      ["comfortable", "500"],
      ["barely", "120"],
      ["almost", "40"],
      ["middle", "60"],
    ]);
    expect(parts()[0]).toHaveClass("bg-outcome-surplus");
    expect(rest()).not.toBeInTheDocument();
  });

  it("draws what is still to come as the rest while the parts fall short of the total", () => {
    render(<SegmentBar groups={[lasting, short]} total={1600} />);

    expect(rest()).toHaveStyle({ flexGrow: "600" });
  });

  it("counts a part below nothing for nothing against the total", () => {
    render(
      <SegmentBar
        groups={[
          [
            { key: "pensions", tone: "bg-chart-2", value: 500 },
            { key: "property", tone: "bg-chart-3", value: -200 },
          ],
        ]}
        total={1000}
      />,
    );

    expect(parts()).toHaveLength(1);
    expect(rest()).toHaveStyle({ flexGrow: "500" });
  });

  it("draws two groups listing the same parts, each holding those on its side", () => {
    const moves = [
      { key: "pensions", tone: "bg-chart-2", value: 900 },
      { key: "property", tone: "bg-chart-3", value: -100 },
    ];
    render(
      <SegmentBar
        groups={[
          moves.map((part) => ({ ...part, value: Math.max(0, part.value) })),
          moves.map((part) => ({ ...part, value: Math.max(0, -part.value) })),
        ]}
      />,
    );

    expect(
      parts().map((part) => [part.dataset["segment"], part.style.flexGrow]),
    ).toStrictEqual([
      ["pensions", "900"],
      ["property", "100"],
    ]);
  });

  it("draws nothing for a group whose parts come to nothing, and no rest without a total", () => {
    render(
      <SegmentBar
        groups={[lasting, short.map((part) => ({ ...part, value: 0 }))]}
      />,
    );

    expect(parts().map((part) => part.dataset["segment"])).toStrictEqual([
      "surplus",
      "comfortable",
      "barely",
    ]);
    expect(rest()).not.toBeInTheDocument();
  });
});
