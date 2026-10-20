// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ProgressPoint } from "./progress";

import { accounts } from "./accounts.fixture";
import { golf, golfLoan } from "./cars.fixture";
import { house, houseLoan } from "./houses.fixture";
import {
  latestYearOf,
  movesOf,
  netWorthOf,
  pointOf,
  sharedBy,
  sumOf,
  yearsOf,
} from "./progress";
import { points } from "./progress.fixture";

// The fixture's first point and its last, March and August 2026.
function ends(): { readonly from: ProgressPoint; readonly to: ProgressPoint } {
  const [from, , , , , to] = points;
  return { from, to };
}

// A point a month, from June 2019, its property worth what is given
// and nothing else held or owed, so its net worth is that figure.
function monthly(worths: readonly number[]): ProgressPoint[] {
  return worths.map((assets, index) => ({
    assets,
    deferred: 0,
    free: 0,
    house: 0,
    loans: 0,
    month: {
      month: (5 + index) % 12,
      year: 2019 + Math.floor((5 + index) / 12),
    },
    unsecured: 0,
  }));
}

describe("latestYearOf", () => {
  // Six points from March to August 2026: the year is read from the
  // earliest, five months back, and is held against no year before it.
  it("reads from the earliest point within the year where the points start later", () => {
    expect(latestYearOf(points)).toStrictEqual({
      before: [],
      from: points[0],
      to: points[5],
    });
  });

  // Thirty-eight months from June 2019 to July 2022, rising £1,000 a
  // month to July 2020, £2,000 a month to July 2021 and £3,000 a month to
  // July 2022.
  it("reads from the point a year before, and the years before it to the same month, nearest first", () => {
    const kept = monthly(
      Array.from({ length: 38 }, (_, index) =>
        Array.from(
          { length: index },
          (_unused, month) => Math.ceil(month / 12) * 1000,
        ).reduce((sum, rise) => sum + rise, 100000),
      ),
    );

    const year = latestYearOf(kept);

    expect(year?.from.month).toStrictEqual({ month: 6, year: 2021 });
    expect(year?.before).toStrictEqual([24000, 12000]);
  });

  // The same months with cash read, £100 a month over the months since
  // June 2019, from July 2020 on: the latest year carries it at both
  // ends, so the year to July 2021 is read with its £1,200 rise and the
  // year to July 2020, July 2019 carrying none, is passed over. With cash
  // read in July 2022 alone, the latest year is read over the five, and
  // so is every year before it.
  it("holds the latest year only against years read with every balance both its ends carry, over those balances", () => {
    const kept = monthly(
      Array.from({ length: 38 }, (_, index) =>
        Array.from(
          { length: index },
          (_unused, month) => Math.ceil(month / 12) * 1000,
        ).reduce((sum, rise) => sum + rise, 100000),
      ),
    );
    const cashFrom = (first: number): ProgressPoint[] =>
      kept.map((point, index) =>
        index < first ? point : { ...point, cash: index * 100 },
      );

    expect(latestYearOf(cashFrom(13))?.before).toStrictEqual([25200]);
    expect(latestYearOf(cashFrom(37))?.before).toStrictEqual([24000, 12000]);
  });

  // The same months with July 2019 not kept, the year from it to July
  // 2020 has no start, and is passed over; with July 2020 not kept, that
  // year has no end and the year after it no start.
  it("passes over a year either end of which was not kept", () => {
    const kept = monthly(Array.from({ length: 38 }, (_, index) => index));

    expect(
      latestYearOf(kept.filter((_point, index) => index !== 1))?.before,
    ).toStrictEqual([12]);
    expect(
      latestYearOf(kept.filter((_point, index) => index !== 13))?.before,
    ).toStrictEqual([]);
  });

  // August 2025 not kept: the year is read from September 2025, eleven
  // months back, and so is held against none.
  it("holds a year that is not twelve months whole against none", () => {
    const kept = monthly(Array.from({ length: 87 }, (_, index) => index));

    expect(
      latestYearOf(kept.filter((_point, index) => index !== 74)),
    ).toMatchObject({ before: [], from: { month: { month: 8, year: 2025 } } });
  });

  it("reads no year off a point alone, or before any is kept", () => {
    expect(latestYearOf(points.slice(0, 1))).toBeUndefined();
    expect(latestYearOf([])).toBeUndefined();
  });
});

describe("movesOf", () => {
  // The fixture's March and August: the debts paid down add, the cards
  // run up take away, and each side sums apart.
  it("reads what each balance moved net worth by, and what each side came to", () => {
    const { from, to } = ends();
    const moves = movesOf(from, to);

    expect(moves).toStrictEqual([
      { key: "deferred", move: 15232 },
      { key: "free", move: 9347 },
      { key: "assets", move: 3322 },
      { key: "loans", move: 7245 },
      { key: "unsecured", move: -540 },
    ]);
    expect(sumOf(moves, 1)).toBe(35146);
    expect(sumOf(moves, -1)).toBe(540);
  });
});

describe("netWorthOf", () => {
  // The fixture's August, off the sheet, and the reference accounts read
  // off as August's point.
  it("counts every balance a point was read with, or the balances given", () => {
    const { to } = ends();
    const read = pointOf(accounts, { month: 7, year: 2026 });

    expect(netWorthOf(to)).toBe(882382);
    expect(netWorthOf(read)).toBe(901462);
    expect(netWorthOf(read, sharedBy(to, read))).toBe(884562);
  });
});

describe("pointOf", () => {
  // The reference pension, ISA and current account, its home as the
  // house it is with the mortgage secured on it, the Golf with its loan,
  // a GIA and a credit card secured on nothing.
  it("sums every account into the balance that holds it, and the house's own accounts alone into the house", () => {
    const [pension, isa, current] = accounts;

    expect(
      pointOf(
        [
          pension,
          isa,
          current,
          house,
          houseLoan,
          golf,
          golfLoan,
          { ...current, balance: 5500, id: 30, kind: "taxable", name: "GIA" },
          { ...current, balance: -1250, id: 31, kind: "debt", name: "Cards" },
        ],
        { month: 7, year: 2026 },
      ),
    ).toStrictEqual({
      assets: 415512,
      cash: 16900,
      deferred: 391640,
      free: 271930,
      house: 397512,
      loans: -190520,
      month: { month: 7, year: 2026 },
      taxable: 5500,
      unsecured: -1250,
    });
  });

  it("reads nothing of a balance no account is held in, rather than leaving it out", () => {
    expect(pointOf([], { month: 0, year: 2026 })).toStrictEqual({
      assets: 0,
      cash: 0,
      deferred: 0,
      free: 0,
      house: 0,
      loans: 0,
      month: { month: 0, year: 2026 },
      taxable: 0,
      unsecured: 0,
    });
  });
});

describe("sharedBy and movesOf", () => {
  // The fixture's August, off the sheet, against the reference accounts
  // read off as September's point, the home the house it is with the
  // mortgage secured on it and the cards cleared; then September against
  // October with £1,700 more cash.
  it("reads a move between a point off the sheet and one off the accounts over the five both carry, and between two off the accounts over all seven", () => {
    const { to } = ends();
    const [pension, isa, current] = accounts;
    const september = pointOf([pension, isa, current, house, houseLoan], {
      month: 8,
      year: 2026,
    });
    const october = {
      ...september,
      cash: 18600,
      month: { month: 9, year: 2026 },
    };

    expect(sharedBy(to, september)).toStrictEqual([
      "deferred",
      "free",
      "assets",
      "loans",
      "unsecured",
    ]);
    expect(movesOf(to, september)).toStrictEqual([
      { key: "deferred", move: 0 },
      { key: "free", move: 0 },
      { key: "assets", move: 0 },
      { key: "loans", move: 0 },
      { key: "unsecured", move: 2180 },
    ]);
    expect(movesOf(september, october)).toStrictEqual([
      { key: "deferred", move: 0 },
      { key: "free", move: 0 },
      { key: "taxable", move: 0 },
      { key: "cash", move: 1700 },
      { key: "assets", move: 0 },
      { key: "loans", move: 0 },
      { key: "unsecured", move: 0 },
    ]);
  });

  // August off the sheet and September off the accounts, over the cash
  // and the GIAs given: the point not read with one reads nothing for
  // it, either way about.
  it("reads a balance given that a point was not read with as nothing at that point", () => {
    const { to } = ends();
    const september = pointOf(accounts, { month: 8, year: 2026 });

    expect(movesOf(to, september, ["taxable", "cash"])).toStrictEqual([
      { key: "taxable", move: 0 },
      { key: "cash", move: 16900 },
    ]);
    expect(movesOf(september, to, ["cash"])).toStrictEqual([
      { key: "cash", move: -16900 },
    ]);
  });
});

describe("yearsOf", () => {
  // Twenty-one months from June 2019, worth their index, with June 2020
  // not kept: 2019 is read from its own June, 2020 from the December
  // before it, and 2021 has January and February alone.
  it("groups the points by calendar year, each read from the last point of the year before", () => {
    const kept = monthly(
      Array.from({ length: 21 }, (_, index) => index),
    ).filter((_point, index) => index !== 12);

    expect(
      yearsOf(kept).map(({ from, points: inYear, to, year }) => [
        year,
        from.assets,
        to.assets,
        inYear.length,
      ]),
    ).toStrictEqual([
      [2019, 0, 6, 7],
      [2020, 6, 18, 11],
      [2021, 18, 20, 2],
    ]);
  });

  // Every month from June 2019 to May 2022 but those of 2020: 2021 is
  // read from its own January rather than across the year not kept.
  it("reads a year after one that kept no point from its own first point", () => {
    const kept = monthly(
      Array.from({ length: 36 }, (_, index) => index),
    ).filter(({ month }) => month.year !== 2020);

    expect(
      yearsOf(kept).map(({ from, year }) => [year, from.assets]),
    ).toStrictEqual([
      [2019, 0],
      [2021, 19],
      [2022, 30],
    ]);
  });

  it("has no year before any point is kept", () => {
    expect(yearsOf([])).toStrictEqual([]);
  });
});
