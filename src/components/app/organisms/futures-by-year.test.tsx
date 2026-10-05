import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Future } from "@/engine/futures";

import { FuturesByYear } from "./futures-by-year";

// Born in 1990, from 2026 over two years to 2028, at 38, retiring past
// the plan's end so retirement marks no year of it.
const plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0.05,
  retires: 90,
  years: 2,
};

// Ten futures, the nth holding n thousand pounds entering 2026, twice
// that entering 2027 and three times entering 2028; the first falls
// short in 2027 and the second in 2028.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: [2027, 2028][nth] ?? null,
  ranOut: null,
  savings: [1000 * nth, 2000 * nth, 3000 * nth],
}));

// The plan at its own rates, holding £500, £600 and £700.
const projected: Future = {
  fell: null,
  ranOut: null,
  savings: [500, 600, 700],
};

const milestones = [
  { id: 1, name: "Ada 18", year: 2027 },
  { id: 2, name: "Tom 18", year: 2026 },
];

function lines(): string[] {
  return screen.getAllByRole("listitem").map(({ textContent }) => textContent);
}

function renderYears(): void {
  render(
    <FuturesByYear
      futures={futures}
      milestones={milestones}
      plan={plan}
      projected={projected}
    />,
  );
}

describe("FuturesByYear", () => {
  // Nine futures are lasting as 2028 opens, the second falls short in
  // it and eight last out of it, 80% of the ten; the poor, middle and
  // good futures hold £3,000, £15,000 and £24,000, and the plan £700.
  it("opens on the plan's last year, read as a ledger, with what is still lasting beside the strip", () => {
    renderYears();

    const card = screen.getByRole("region", { name: "Year by year" });

    expect(within(card).getByText("Sect. II.ii")).toHaveClass("label");
    expect(
      within(card).getByText("2028, age 38, in today's money"),
    ).toBeInTheDocument();
    expect(lines()).toStrictEqual([
      "Lasting into the year9",
      "Fell short this yearRan out of money, or drew a pension before it can be drawn−1",
      "Lasting at the year's end80% of the 108",
      "Poor futureA tenth of the futures hold less£3,000",
      "Middle futureHalf hold less, and half more£15,000",
      "Good futureA tenth hold more£24,000",
      "As projectedAt the plan's rates every year, as the dashboard draws it£700",
    ]);
    expect(within(card).getByText("−1")).toHaveClass("text-destructive");
    expect(within(card).getByText("still lasting")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Year" })).toHaveAttribute(
      "aria-valuetext",
      "2028, age 38: 8 futures lasting, the middle one holding £15,000",
    );
    expect(screen.getByRole("button", { name: "Year after" })).toBeDisabled();
  });

  it("steps back a year at a time to the plan's first, and jumps to a milestone", () => {
    renderYears();

    fireEvent.click(screen.getByRole("button", { name: "Year before" }));

    expect(
      screen.getByText("2027, age 37, in today's money · Ada 18"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ada 18 2027" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Year before" }));

    expect(
      screen.getByText("2026, age 36, in today's money · Tom 18"),
    ).toBeInTheDocument();
    expect(lines()[1]).toBe(
      "Fell short this yearRan out of money, or drew a pension before it can be drawn0",
    );
    expect(screen.getByRole("button", { name: "Year before" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Ada 18 2027" }));
    fireEvent.click(screen.getByRole("button", { name: "Year after" }));

    expect(
      screen.getByText("2028, age 38, in today's money"),
    ).toBeInTheDocument();
  });

  it("moves the year along the strip", () => {
    renderYears();

    fireEvent.keyDown(screen.getByRole("slider", { name: "Year" }), {
      key: "Home",
    });

    expect(
      screen.getByText("2026, age 36, in today's money · Tom 18"),
    ).toBeInTheDocument();
  });

  it("lays out no milestones where none falls in the plan's years", () => {
    render(
      <FuturesByYear
        futures={futures}
        milestones={[]}
        plan={plan}
        projected={projected}
      />,
    );

    expect(
      screen.queryByRole("group", { name: "Milestones" }),
    ).not.toBeInTheDocument();
  });
});
