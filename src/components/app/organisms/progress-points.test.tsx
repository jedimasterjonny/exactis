import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProgressPoint } from "@/data/progress";

import { bySlot } from "@/test/dom";

import { ProgressPoints } from "./progress-points";

// Five month-ends from November 2024 to March 2025. 2024 is read from
// November to December, rising £3,500: the pensions add £2,000, the
// ISAs £1,000 and the mortgage paid down £1,000, and the cards run up
// £500. 2025 is read from December to March, rising £7,500: the
// pensions add £6,000, the ISAs £3,000 and the mortgage £3,000, the
// property falls £4,000 and the cards run up £500 more.
const points: readonly ProgressPoint[] = [
  pointOf(10, 2024, [300000, 100000, 50000, -200000, -1000]),
  pointOf(11, 2024, [300000, 102000, 51000, -199000, -1500]),
  pointOf(0, 2025, [298000, 104000, 52000, -198000, -1000]),
  pointOf(1, 2025, [297000, 106000, 53000, -197000, -1000]),
  pointOf(2, 2025, [296000, 108000, 54000, -196000, -2000]),
];

function cellsOf(row: HTMLElement): (null | string)[] {
  return within(row)
    .getAllByRole("cell")
    .slice(1)
    .map(({ textContent }) => textContent);
}

// A month-end's balances, in the order the sheet lists them: the
// property, the pensions, the ISAs, the mortgage and the cards.
function pointOf(
  month: number,
  year: number,
  [assets, deferred, free, loans, unsecured]: readonly [
    number,
    number,
    number,
    number,
    number,
  ],
): ProgressPoint {
  return {
    assets,
    deferred,
    free,
    house: 0,
    loans,
    month: { month, year },
    unsecured,
  };
}

function yearRow(year: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${year}`) });
}

describe("ProgressPoints", () => {
  it("lists a year a row, newest first and open, with its months kept, its move and where it ended", () => {
    render(<ProgressPoints points={points} />);

    const card = screen.getByRole("region", { name: "Year by year" });

    expect(
      within(card)
        .getAllByRole("button")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "20253 months+£7,500£260,000",
      "20242 months+£3,500£252,500",
    ]);
    expect(yearRow("2025")).toHaveAttribute("aria-expanded", "true");
    expect(yearRow("2024")).toHaveAttribute("aria-expanded", "false");

    const table = within(card).getByRole("table");
    const [header, ...rows] = within(table).getAllByRole("row");

    expect(
      within(header ?? table)
        .getAllByRole("columnheader")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Month",
      "Pensions",
      "ISAs",
      "Property & vehicles",
      "Secured loans",
      "Other debts",
      "Net worth",
    ]);
    expect(rows.map((row) => cellsOf(row)[0])).toStrictEqual([
      "Mar 2025",
      "Feb 2025",
      "Jan 2025",
    ]);
    expect(cellsOf(rows[0] ?? table)).toStrictEqual([
      "Mar 2025",
      "£108,000",
      "£54,000",
      "£296,000",
      "−£196,000",
      "−£2,000",
      "£260,000",
    ]);
  });

  it("folds a month to its net worth over its balances for a narrow table", () => {
    render(<ProgressPoints points={points} />);

    const [, first] = within(screen.getByRole("table")).getAllByRole("row");

    expect(
      within(first ?? document.body).getAllByRole("cell")[0],
    ).toHaveTextContent(
      "Mar 2025£260,000Pensions £108,000 · ISAs £54,000 · Property & vehicles £296,000 · Secured loans −£196,000 · Other debts −£2,000",
    );
  });

  it("opens a year to its months, closing the year open before it", () => {
    render(<ProgressPoints points={points} />);

    fireEvent.click(yearRow("2024"));

    expect(yearRow("2024")).toHaveAttribute("aria-expanded", "true");
    expect(yearRow("2025")).toHaveAttribute("aria-expanded", "false");
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1)
        .map((row) => cellsOf(row)[0]),
    ).toStrictEqual(["Dec 2024", "Nov 2024"]);
  });

  // The most any year added is 2025's £12,000 and the most any took
  // away 2025's £4,500, so 2024's £4,000 added runs a third of its side
  // and its £500 taken a ninth of its own.
  it("draws what each year added right of the rule and what it took away left of it, on one scale", () => {
    render(<ProgressPoints points={points} />);

    const parts = within(yearRow("2024")).getAllByText(
      bySlot("segment-bar-part"),
      { suggest: false },
    );

    expect(
      parts.map((part) => [part.dataset["segment"], part.style.flexGrow]),
    ).toStrictEqual([
      ["unsecured", "500"],
      ["deferred", "2000"],
      ["free", "1000"],
      ["loans", "1000"],
    ]);
    expect(
      within(yearRow("2024"))
        .getAllByText(bySlot("move-bar-side"), { suggest: false })
        .map((side) => side.style.width),
    ).toStrictEqual(["11.11111111111111%", "33.33333333333333%"]);
  });

  it("draws what would fill the card before any point is kept", () => {
    render(<ProgressPoints points={[]} />);

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText("No points yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A point is the balances as the Household Finances sheet sums them at the end of a month, loaded into the store.",
      ),
    ).toBeInTheDocument();
  });
});
