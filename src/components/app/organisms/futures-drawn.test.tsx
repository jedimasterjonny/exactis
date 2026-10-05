import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { loggedSpread } from "@/data/plan";

import { FuturesDrawn } from "./futures-drawn";

const plan = {
  born: 1990,
  from: 2026,
  inflation: 0.03,
  month: 0,
  rate: 0.07,
  retires: 59,
  years: 53,
};

describe("FuturesDrawn", () => {
  // At 7% straying 14% a year, 12.92% in logs, a year one in ten comes
  // in under 1.07 × e to the -1.2816 × 0.1292, less one, -9.33%, and
  // over 26.27%; prices at 3% straying 2 points, 1.94% in logs, under
  // 0.47% and over 5.59%.
  it("sets out the rates the futures are drawn about, how far a year strays, and a year one in ten either side", () => {
    render(
      <FuturesDrawn
        count={1000}
        plan={plan}
        spread={{
          inflation: loggedSpread(0.03, 0.02),
          rate: loggedSpread(0.07, 0.14),
        }}
      />,
    );

    const card = screen.getByRole("region", {
      name: "What the futures are drawn from",
    });
    const sheet = within(card).getByRole("table", {
      name: "What the futures are drawn from",
    });

    expect(within(card).getByText("Sect. II.iii")).toHaveClass("label");
    expect(
      within(sheet)
        .getAllByRole("row")
        .map(({ textContent }) => textContent)
        .filter((text) => text.includes("%")),
    ).toStrictEqual([
      "Return, a year7.00%3.00%",
      "Strays by, a year14.00%2.00%",
      "Low year, one in ten−9.33%0.47%",
      "High year, one in ten26.27%5.59%",
    ]);
    expect(
      within(card)
        .getAllByRole("definition")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "1,000, each the plan run again",
      "A year at a time, log-normal, prices apart from returns",
      "The same futures, so a change is the plan's",
      "With no year short, and no pension drawn early",
    ]);
  });
});
