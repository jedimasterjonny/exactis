import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LatestYear, ProgressPoint } from "@/data/progress";

import { points } from "@/data/progress.fixture";
import { bySlot } from "@/test/dom";

import { ProgressYear } from "./progress-year";

// The fixture's first point and its last, March and August 2026.
function ends(): { readonly from: ProgressPoint; readonly to: ProgressPoint } {
  const [from] = points;
  const to = points.at(-1);
  if (from === undefined || to === undefined) {
    throw new Error("The fixture keeps points.");
  }
  return { from, to };
}

function heading(): null | string {
  return screen.getByRole("heading", { level: 2 }).textContent;
}

function rowsOf(name: string): (null | string)[][] {
  return within(screen.getByRole("table", { name }))
    .queryAllByRole("row")
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .slice(1)
        .map(({ textContent }) => textContent),
    );
}

// The two moved to a year apart: from August 2025 to August 2026, net
// worth rising £56,982.
function yearOf(before: readonly number[]): LatestYear {
  const { from, to } = ends();
  return { before, from: { ...from, month: { month: 7, year: 2025 } }, to };
}

describe("ProgressYear", () => {
  // March to August 2026: the pensions add £28,660, the ISAs £20,144,
  // the property £4,966 and the loans paid down £3,572, and the cards
  // run up £360.
  it("says what the months came to, what each balance added and took away, and where net worth went", () => {
    render(<ProgressYear year={{ ...ends(), before: [] }} />);

    const band = screen.getByRole("region", { name: "What the year came to" });

    expect(
      within(band)
        .getAllByRole("paragraph")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "+£56,982",
      "5 months to Aug 2026",
      "£57,342 added£360 taken away",
      "From £873,279 in Mar 2026 to £930,261 in Aug 2026.",
    ]);
    expect(heading()).toBe("Net worth rose £56,982 in the 5 months to August.");
    expect(rowsOf("Added · £57,342")).toStrictEqual([
      ["Pensions £412,880 now", "+£28,660"],
      ["ISAs £286,145 now", "+£20,144"],
      ["Property & vehicles £416,386 now", "+£4,966"],
      ["Secured loans −£182,940 now", "+£3,572"],
    ]);
    expect(rowsOf("Taken away · £360")).toStrictEqual([
      ["Other debts −£2,210 now", "−£360"],
    ]);
    expect(
      screen
        .getAllByText(bySlot("segment-bar-part"), { suggest: false })
        .map((part) => [part.dataset["segment"], part.style.flexGrow]),
    ).toStrictEqual([
      ["deferred", "28660"],
      ["free", "20144"],
      ["assets", "4966"],
      ["loans", "3572"],
      ["unsecured", "360"],
    ]);
  });

  it("holds a year's rise against the years kept before it, a match beating none", () => {
    const { rerender } = render(<ProgressYear year={yearOf([10000, 20000])} />);

    expect(heading()).toBe(
      "Net worth rose £56,982 in the year to August, more than in any of the 2 earlier years.",
    );

    rerender(<ProgressYear year={yearOf([10000, 60000, 70000])} />);

    expect(heading()).toBe(
      "Net worth rose £56,982 in the year to August, more than in 1 of the 3 earlier years.",
    );

    rerender(<ProgressYear year={yearOf([60000, 70000])} />);

    expect(heading()).toBe(
      "Net worth rose £56,982 in the year to August, less than in any of the 2 earlier years.",
    );

    rerender(<ProgressYear year={yearOf([10000])} />);

    expect(heading()).toBe(
      "Net worth rose £56,982 in the year to August, more than in the earlier year.",
    );

    rerender(<ProgressYear year={yearOf([56982])} />);

    expect(heading()).toBe(
      "Net worth rose £56,982 in the year to August, no more than in the earlier year.",
    );

    rerender(<ProgressYear year={yearOf([56982, 70000])} />);

    expect(heading()).toBe(
      "Net worth rose £56,982 in the year to August, no more than in any of the 2 earlier years.",
    );

    rerender(<ProgressYear year={yearOf([])} />);

    expect(heading()).toBe("Net worth rose £56,982 in the year to August.");
  });

  // The same two points the other way about: net worth falls £56,982,
  // which is held against nothing.
  it("says how far a year fell, against nothing before it", () => {
    const { from, to } = yearOf([10000]);
    render(
      <ProgressYear
        year={{
          before: [10000],
          from: { ...to, month: from.month },
          to: { ...from, month: to.month },
        }}
      />,
    );

    expect(screen.getAllByRole("paragraph")[0]).toHaveTextContent("−£56,982");
    expect(heading()).toBe("Net worth fell £56,982 in the year to August.");
    expect(rowsOf("Added · £360")).toHaveLength(1);
  });

  // August against August a year before, and against July: a month
  // apart, nothing moved.
  it("says net worth held where nothing moved, and names a month alone as the month", () => {
    const { to } = ends();
    render(
      <ProgressYear
        year={{
          before: [10000],
          from: { ...to, month: { month: 6, year: 2026 } },
          to,
        }}
      />,
    );

    expect(screen.getAllByRole("paragraph")[0]).toHaveTextContent("£0");
    expect(screen.getAllByRole("paragraph")[1]).toHaveTextContent(
      "1 month to Aug 2026",
    );
    expect(heading()).toBe(
      "Net worth held where it was in the month to August.",
    );
    expect(rowsOf("Added · £0")).toStrictEqual([]);
  });
});
