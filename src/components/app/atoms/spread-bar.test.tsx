import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Plan } from "@/data/plan";

import { bySlot } from "@/test/dom";

import { SpreadBar } from "./spread-bar";

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

function bands(): { left: string; width: string }[] {
  return screen
    .getAllByText(bySlot("spread-bar-band"), { suggest: false })
    .map(({ style }) => ({ left: style.left, width: style.width }));
}

describe("SpreadBar", () => {
  it("bands the middle four in five faintly and the middle half over it, with the ends and the median dotted, hidden from the tree", () => {
    render(
      <SpreadBar
        plan={plan}
        spread={{
          ends: [2036, 2066],
          inner: [2046, 2056],
          median: 2046,
          outer: [2036, 2056],
        }}
      />,
    );

    expect(screen.getByText(bySlot("spread-bar"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(bands()).toStrictEqual([
      { left: "25%", width: "50%" },
      { left: "50%", width: "25%" },
    ]);
    expect(
      screen
        .getAllByText(bySlot("spread-bar-band"), { suggest: false })
        .map((band) => band.className.includes("bg-chart-2/20")),
    ).toStrictEqual([true, false]);
    expect(
      screen
        .getAllByText(bySlot("spread-bar-end"), { suggest: false })
        .map(({ style }) => style.left),
    ).toStrictEqual(["25%", "100%"]);
    expect(screen.getByText(bySlot("spread-bar-median"))).toHaveStyle({
      left: "50%",
    });
    expect(screen.getByText(bySlot("spread-bar-median"))).toHaveClass(
      "bg-chart-1",
    );
  });

  // Sixty in a hundred reach it, so the shares past the median never do:
  // each band runs to the median and stops, and neither the latest end
  // nor anything past it is drawn.
  it("stops a band at the last year any share reaches, and draws nothing for a share that never does", () => {
    const { rerender } = render(
      <SpreadBar
        plan={plan}
        spread={{
          ends: [2036, null],
          inner: [2046, null],
          median: 2056,
          outer: [2036, null],
        }}
      />,
    );

    expect(bands()).toStrictEqual([
      { left: "25%", width: "50%" },
      { left: "50%", width: "25%" },
    ]);
    expect(
      screen.getAllByText(bySlot("spread-bar-end"), { suggest: false }),
    ).toHaveLength(1);

    rerender(
      <SpreadBar
        plan={plan}
        spread={{
          ends: [2036, null],
          inner: [null, null],
          median: null,
          outer: [2046, null],
        }}
      />,
    );

    expect(bands()).toStrictEqual([{ left: "50%", width: "0%" }]);
    expect(
      screen.queryByText(bySlot("spread-bar-median"), { suggest: false }),
    ).not.toBeInTheDocument();

    rerender(
      <SpreadBar
        plan={plan}
        spread={{
          ends: [null, null],
          inner: [null, null],
          median: null,
          outer: [null, null],
        }}
      />,
    );

    expect(
      screen.queryByText(bySlot("spread-bar-band"), { suggest: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(bySlot("spread-bar-end"), { suggest: false }),
    ).not.toBeInTheDocument();
  });

  it("rules the milestones' years across the track, and none unless given", () => {
    const spread = {
      ends: [2036, 2066],
      inner: [2046, 2056],
      median: 2046,
      outer: [2036, 2056],
    } as const;
    const { rerender } = render(
      <SpreadBar marks={[2036, 2046]} plan={plan} spread={spread} />,
    );

    expect(
      screen
        .getAllByText(bySlot("spread-bar-mark"), { suggest: false })
        .map((mark) => mark.style.left),
    ).toStrictEqual(["25%", "50%"]);

    rerender(<SpreadBar plan={plan} spread={spread} />);

    expect(
      screen.queryByText(bySlot("spread-bar-mark"), { suggest: false }),
    ).not.toBeInTheDocument();
  });
});
