import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Reading } from "@/engine/futures";

import { FuturesCount } from "./futures-count";

// Born in 1990, from 2026 over 53 years, so the plan runs to 89.
const plan = {
  born: 1990,
  from: 2026,
  inflation: 0.02,
  month: 0,
  rate: 0.05,
  retires: 59,
  years: 53,
};

// A thousand futures: 970 last, 26 run out, the first in 2059 at 69
// and half of them by 2074 at 84, and 4 are kept going only by drawing
// a pension early. Read to the run's 1.06 points either way.
const reading: Reading = {
  chance: 0.97,
  early: 4,
  firstRanOut: 2059,
  halfRanOut: 2074,
  lasted: 970,
  margin: 0.0106,
  middle: 1234567,
  ranOut: 26,
  run: 1000,
};

function steps(): string[] {
  return screen.getAllByRole("listitem").map(({ textContent }) => textContent);
}

describe("FuturesCount", () => {
  it("counts the futures down to those that lasted, beside the plan as projected", () => {
    render(
      <FuturesCount
        count={1000}
        plan={plan}
        projected={1300000}
        reading={reading}
      />,
    );

    const card = screen.getByRole("region", { name: "How many futures last" });
    const panel = within(card).getByRole("region", {
      name: "Net worth against the plan as projected",
    });

    expect(within(card).getByText("Sect. II.i")).toHaveClass("label");
    expect(steps()).toStrictEqual([
      "Futures runEach the plan run again over its own 53 years of returns and inflation1,000",
      "Ran out of moneyA year no account could cover. The first at 69, half of them by 84−26",
      "Kept going only by drawing a pension earlyShort before a pension can be drawn, and carried by the 55% charge, which lasts on paper only. Counted as lasting, the chance would be 97%−4",
      "Lasted to 89Every year covered from the savings, to the plan's end970",
    ]);
    expect(within(card).getByText("Chance of success")).toHaveClass("label");
    expect(within(card).getByText("97%")).toHaveClass("figure");
    expect(
      within(panel)
        .getAllByRole("term")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Projected, at 89", "Middle future, at 89"]);
    expect(
      within(panel)
        .getAllByRole("definition")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["£1,300,000", "£1,234,567"]);
    expect(
      within(card).getByText(/^± 1\.1 points is the run's own: 1,000 futures/),
    ).toBeInTheDocument();
  });

  it("says when no future ran out or needed an early draw", () => {
    render(
      <FuturesCount
        count={1000}
        plan={plan}
        projected={1300000}
        reading={{
          ...reading,
          chance: 1,
          early: 0,
          firstRanOut: null,
          halfRanOut: null,
          lasted: 1000,
          ranOut: 0,
        }}
      />,
    );

    const [, ranOut, early] = steps();

    expect(ranOut).toBe("Ran out of moneyNone ran out0");
    expect(early).toBe(
      "Kept going only by drawing a pension earlyNone needed to0",
    );
  });

  it("counts the futures drawn so far while the run comes in, and says it has none before the first", () => {
    const { rerender } = render(
      <FuturesCount
        count={1000}
        plan={plan}
        projected={1300000}
        reading={{ ...reading, lasted: 342, run: 372 }}
      />,
    );

    expect(steps()[0]).toBe("Futures run372 of 1,000 drawn so far372");
    expect(
      screen.getByText("The chance firms as the rest of the futures come in."),
    ).toBeInTheDocument();

    rerender(
      <FuturesCount
        count={1000}
        plan={plan}
        projected={1300000}
        reading={{ ...reading, run: 0 }}
      />,
    );

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Drawing the first futures…",
    );
  });
});
