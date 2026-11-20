import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProgressPoint } from "@/data/progress";

import { bySlot, styled } from "@/test/dom";

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
      "GIAs",
      "Cash",
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
      "—",
      "—",
      "£296,000",
      "−£196,000",
      "−£2,000",
      "£260,000",
    ]);
  });

  it("folds a month to its move and net worth for a narrow table, a tap opening it to its balances a line apiece", () => {
    render(<ProgressPoints points={points} />);

    const [first] = within(screen.getByRole("table")).getAllByRole("group");
    const month = first ?? document.body;

    expect(month).toHaveTextContent(/^Mar 2025\+£2,000£260,000/v);
    expect(month).not.toHaveAttribute("open");

    fireEvent.click(within(month).getByText("Mar 2025"));

    expect(month).toHaveAttribute("open");
    expect(
      within(month)
        .getAllByRole("listitem")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Pensions£108,000",
      "ISAs£54,000",
      "GIAs—",
      "Cash—",
      "Property & vehicles£296,000",
      "Secured loans−£196,000",
      "Other debts−£2,000",
    ]);
    // jsdom forces no colours, so the class that keeps each dot's fill is
    // what is read.
    for (const item of within(month).getAllByRole("listitem")) {
      // eslint-disable-next-line testing-library/no-node-access -- the dot is hidden from the tree and has no text, so it is reached from the line it opens
      expect(item.firstElementChild).toHaveClass("forced-color-adjust-none");
    }
  });

  // Five month-ends in a row; then four, February 2025 not kept.
  it("captions the card with how many months the points span and how many between were not kept", () => {
    const { rerender } = render(<ProgressPoints points={points} />);

    const card = screen.getByRole("region", { name: "Year by year" });

    expect(
      within(card).getByText(
        "5 month-ends from Nov 2024 to Mar 2025. Added right of the rule, taken away left.",
      ),
    ).toBeInTheDocument();

    rerender(<ProgressPoints points={points.toSpliced(3, 1)} />);

    // The count is held to its word by a no-break space, which a text
    // query and toHaveTextContent read as any other, so the caption's
    // own text is read whole.
    const { textContent: caption } = within(card).getByText(/^4 month-ends/v);

    expect(caption).toBe(
      "4 month-ends from Nov 2024 to Mar 2025 · 1\u00a0missing. Added right of the rule, taken away left.",
    );
  });

  // January 2025 is read from December 2024, the year before's last,
  // and November 2024 is the first point kept, so it has nothing before
  // it to move from.
  it("moves a folded month on from the point before it, the year's first from the year before's last", () => {
    render(<ProgressPoints points={points} />);

    const movesOfTable = (): (null | string)[] =>
      within(screen.getByRole("table"))
        .getAllByRole("group")
        .map(
          (month) =>
            within(month).getByText(/^\w{3} \d{4}$/v).parentElement
              ?.textContent ?? null,
        );

    expect(movesOfTable()).toStrictEqual([
      "Mar 2025+£2,000£260,000",
      "Feb 2025+£3,000£258,000",
      "Jan 2025+£2,500£255,000",
    ]);

    fireEvent.click(yearRow("2024"));

    expect(movesOfTable()).toStrictEqual([
      "Dec 2024+£3,500£252,500",
      "Nov 2024£249,000",
    ]);
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
    ).toStrictEqual(
      ["11.11111111111111%", "33.33333333333333%"].map((width) =>
        styled("width", width),
      ),
    );
  });

  // April and May 2025 read off the accounts, with £8,000 and then
  // £9,000 of cash and £3,000 in GIAs: the year is read from December,
  // which the sheet gave, over the five balances it carries, £14,500,
  // and so is each month in it, April £4,000 and May £3,000, the cash's
  // £1,000 left out, so the months add up to the year; each ends where
  // its own balances come to.
  it("reads a year and its months over the balances both ends of the year carry, and ends each at every balance its point was read with", () => {
    render(
      <ProgressPoints
        points={[
          ...points,
          {
            ...pointOf(3, 2025, [296000, 110000, 55000, -195000, -2000]),
            cash: 8000,
            taxable: 3000,
          },
          {
            ...pointOf(4, 2025, [296000, 111000, 56000, -194000, -2000]),
            cash: 9000,
            taxable: 3000,
          },
        ]}
      />,
    );

    expect(yearRow("2025")).toHaveTextContent(
      /^20255 months\+£14,500£279,000$/v,
    );
    expect(
      within(yearRow("2025"))
        .getAllByText(bySlot("segment-bar-part"), { suggest: false })
        .map((part) => part.dataset["segment"]),
    ).toStrictEqual(["assets", "unsecured", "deferred", "free", "loans"]);

    const [, may] = within(screen.getByRole("table")).getAllByRole("row");

    expect(cellsOf(may ?? document.body)).toStrictEqual([
      "May 2025",
      "£111,000",
      "£56,000",
      "£3,000",
      "£9,000",
      "£296,000",
      "−£194,000",
      "−£2,000",
      "£279,000",
    ]);
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("group")
        .slice(0, 2)
        .map(
          (month) =>
            within(month).getByText(/^\w{3} \d{4}$/v).parentElement
              ?.textContent,
        ),
    ).toStrictEqual(["May 2025+£3,000£279,000", "Apr 2025+£4,000£275,000"]);
  });

  // February's close kept an invented note and March's an unbroken one,
  // and January's none. Each note is a row of its own beneath its month,
  // in the one table both forms draw, read as a row rather than hidden,
  // the month's rule dropped, spanning every column and held to their
  // width rather than sizing any.
  it("reads each month's note back on a row of its own beneath the month, and draws none for a month without one", () => {
    const unbroken = "x".repeat(200);
    render(
      <ProgressPoints
        points={points.map((point, index) => {
          if (index === 3) {
            return { ...point, note: "Car serviced from savings" };
          }
          return index === 4 ? { ...point, note: unbroken } : point;
        })}
      />,
    );

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const [march, marchNote, february, februaryNote, january] = rows;

    expect(
      rows.map((row) => within(row).getAllByRole("cell").length),
    ).toStrictEqual([10, 1, 10, 1, 10]);
    expect(
      [marchNote, februaryNote].map((row) => row?.textContent),
    ).toStrictEqual([
      `Your note\u00a0${unbroken}`,
      "Your note\u00a0Car serviced from savings",
    ]);
    expect(march).toHaveClass("border-b-0");
    expect(february).toHaveClass("border-b-0");
    expect(january).not.toHaveClass("border-b-0");
    expect(
      within(februaryNote ?? document.body).getByRole("cell"),
    ).toHaveAttribute("colspan", "9");
    expect(
      within(februaryNote ?? document.body).getByRole("paragraph"),
    ).toHaveClass("w-0", "min-w-full");
  });

  it("draws what would fill the card before any point is kept", () => {
    render(<ProgressPoints points={[]} />);

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText("No points yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Closing a month on the accounts screen records its point.",
      ),
    ).toBeInTheDocument();
  });
});
