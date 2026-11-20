import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Reading } from "@/engine/futures";

import { atAge } from "@/data/milestones";
import { owners } from "@/data/owners.fixture";

import { FuturesCount } from "./futures-count";

// Born in 1992, from 2026 over 57 years, so the plan runs to 91.
const plan = {
  born: 1992,
  from: 2026,
  inflation: 0.02,
  month: 0,
  owners: [...owners],
  rate: 0.05,
  retires: 61,
  years: 57,
};

// A thousand futures: 970 last, 26 run out, the first in 2063 at 71
// and half of them by 2078 at 86, and 4 are kept going only by drawing
// a pension early. Read to the run's 1.06 points either way.
const reading: Reading = {
  chance: 0.97,
  early: 4,
  firstRanOut: 2063,
  halfRanOut: 2078,
  lasted: 970,
  margin: 0.0106,
  middle: 1234567,
  ranOut: 26,
  run: 1000,
  unretired: 0,
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
    const panel = within(card).getByRole("region", { name: "Net worth at 91" });

    expect(within(card).getByText("Sect. II.iv")).toHaveClass("label");
    expect(steps()).toStrictEqual([
      "Futures runAll 1,000 drawn1,000",
      "Ran out of moneyThe first at 71, half by 86−26",
      "Kept going only by drawing a pension early97% if counted as lasting−4",
      "Lasted to 91970",
    ]);
    expect(within(card).getByText("Chance of success")).toHaveClass("label");
    expect(within(card).getByText("97%")).toHaveClass("figure");
    expect(
      within(panel)
        .getAllByRole("term")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Projected", "Middle future"]);
    expect(
      within(panel)
        .getAllByRole("definition")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["£1,300,000", "£1,234,567"]);
  });

  // Retiring on twenty-five years of expenses, 30 of the thousand never
  // retire, and so do not last.
  it("counts the futures whose owner never retired out, for an owner retiring on conditions", () => {
    render(
      <FuturesCount
        count={1000}
        plan={{
          ...plan,
          owners: [
            {
              ...owners[0],
              retirement: [{ measure: "liquid", of: "expenses", times: 25 }],
            },
          ],
        }}
        projected={1300000}
        reading={{ ...reading, chance: 0.94, lasted: 940, unretired: 30 }}
      />,
    );

    expect(steps()).toStrictEqual([
      "Futures runAll 1,000 drawn1,000",
      "Ran out of moneyThe first at 71, half by 86−26",
      "Kept going only by drawing a pension early94% if counted as lasting−4",
      "Never retired−30",
      "Lasted to 91940",
    ]);
  });

  // Retiring on twenty-five years of expenses, or by 60, every future
  // retires before the plan's end, so none is counted as never retiring.
  it("counts no future out as never retired for an owner retiring on conditions or by an age", () => {
    render(
      <FuturesCount
        count={1000}
        plan={{
          ...plan,
          owners: [
            {
              ...owners[0],
              retirement: [
                { measure: "liquid", of: "expenses", times: 25 },
                ...atAge(60),
              ],
            },
          ],
        }}
        projected={1300000}
        reading={reading}
      />,
    );

    expect(steps()).toStrictEqual([
      "Futures runAll 1,000 drawn1,000",
      "Ran out of moneyThe first at 71, half by 86−26",
      "Kept going only by drawing a pension early97% if counted as lasting−4",
      "Lasted to 91970",
    ]);
  });

  it("says none did beside a count of none once the run is whole", () => {
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

    expect(ranOut).toBe("Ran out of moneyNone by 910");
    expect(early).toBe(
      "Kept going only by drawing a pension earlyNone needed to0",
    );
  });

  it("counts the futures drawn so far while the run comes in", () => {
    render(
      <FuturesCount
        count={1000}
        plan={plan}
        projected={1300000}
        reading={{ ...reading, lasted: 342, run: 372 }}
      />,
    );

    expect(steps()[0]).toBe("Futures run372 of 1,000 drawn so far372");
  });

  // 372 drawn so far, every one lasting.
  it("says none has yet beside a count of none while the run comes in", () => {
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
          lasted: 372,
          ranOut: 0,
          run: 372,
        }}
      />,
    );

    const [, ranOut, early] = steps();

    expect(ranOut).toBe("Ran out of moneyNone so far0");
    expect(early).toBe(
      "Kept going only by drawing a pension earlyNone so far0",
    );
  });

  // Before the first futures the card is drawn as it lands, its rows the
  // plan's and its figures to come; the plan at its own rates is known.
  it("draws the ledger in its landed shape before the first futures are in, every figure to come", () => {
    render(
      <FuturesCount
        count={1000}
        plan={plan}
        projected={1300000}
        reading={{
          chance: 0,
          early: 0,
          firstRanOut: null,
          halfRanOut: null,
          lasted: 0,
          margin: 0,
          middle: 0,
          ranOut: 0,
          run: 0,
          unretired: 0,
        }}
      />,
    );

    const card = screen.getByRole("region", { name: "How many futures last" });
    const panel = within(card).getByRole("region", { name: "Net worth at 91" });

    expect(steps()).toStrictEqual([
      "Futures run0 of 1,000 drawn so far…",
      "Ran out of moneyNone so far…",
      "Kept going only by drawing a pension earlyNone so far…",
      "Lasted to 91…",
    ]);
    expect(within(card).getByRole("paragraph")).toHaveTextContent(
      /^Chance of success…$/u,
    );
    expect(
      within(panel)
        .getAllByRole("definition")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["£1,300,000", "…"]);
  });
});
