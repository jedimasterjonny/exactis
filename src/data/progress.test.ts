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

// A point a month, from January 2017, its property worth what is given
// and nothing else held or owed, so its net worth is that figure.
function monthly(worths: readonly number[]): ProgressPoint[] {
  return worths.map((assets, index) => ({
    assets,
    deferred: 0,
    free: 0,
    house: 0,
    loans: 0,
    month: { month: index % 12, year: 2017 + Math.floor(index / 12) },
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

  // Thirty-eight months from January 2017 to February 2020, rising
  // £1,000 a month to February 2018, £2,000 a month to February 2019 and
  // £3,000 a month to February 2020.
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

    expect(year?.from.month).toStrictEqual({ month: 1, year: 2019 });
    expect(year?.before).toStrictEqual([24000, 12000]);
  });

  // The same months with cash read, £100 a month over the months since
  // January 2017, from February 2018 on: the latest year carries it at
  // both ends, so the year to February 2019 is read with its £1,200 rise
  // and the year to February 2018, February 2017 carrying none, is passed
  // over. With cash read in February 2020 alone, the latest year is read
  // over the five, and so is every year before it.
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

  // The same months with February 2017 not kept, the year from it to
  // February 2018 has no start, and is passed over; with February 2018
  // not kept, that year has no end and the year after it no start.
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
    const kept = monthly(Array.from({ length: 116 }, (_, index) => index));

    expect(
      latestYearOf(kept.filter((_point, index) => index !== 103)),
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
      { key: "deferred", move: 28660 },
      { key: "free", move: 20144 },
      { key: "assets", move: 4966 },
      { key: "loans", move: 3572 },
      { key: "unsecured", move: -360 },
    ]);
    expect(sumOf(moves, 1)).toBe(57342);
    expect(sumOf(moves, -1)).toBe(360);
  });
});

describe("netWorthOf", () => {
  // The fixture's August, off the sheet, and the reference accounts read
  // off as August's point.
  it("counts every balance a point was read with, or the balances given", () => {
    const { to } = ends();
    const read = pointOf(accounts, { month: 7, year: 2026 });

    expect(netWorthOf(to)).toBe(930261);
    expect(netWorthOf(read)).toBe(950771);
    expect(netWorthOf(read, sharedBy(to, read))).toBe(932471);
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
      assets: 434386,
      cash: 18300,
      deferred: 412880,
      free: 286145,
      house: 416386,
      loans: -196940,
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
      cash: 20000,
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
      { key: "unsecured", move: 2210 },
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
      { key: "cash", move: 18300 },
    ]);
    expect(movesOf(september, to, ["cash"])).toStrictEqual([
      { key: "cash", move: -18300 },
    ]);
  });
});

describe("yearsOf", () => {
  // Twenty-six months from January 2017, worth their index, with June
  // 2018 not kept: 2017 is read from its own January, 2018 from the
  // December before it, and 2019 has February alone.
  it("groups the points by calendar year, each read from the last point of the year before", () => {
    const kept = monthly(
      Array.from({ length: 26 }, (_, index) => index),
    ).filter((_point, index) => index !== 17);

    expect(
      yearsOf(kept).map(({ from, points: inYear, to, year }) => [
        year,
        from.assets,
        to.assets,
        inYear.length,
      ]),
    ).toStrictEqual([
      [2017, 0, 11, 12],
      [2018, 11, 23, 11],
      [2019, 23, 25, 2],
    ]);
  });

  // Every month of 2017 and of 2019, none of 2018: 2019 is read from its
  // own January rather than across the year not kept.
  it("reads a year after one that kept no point from its own first point", () => {
    const kept = monthly(
      Array.from({ length: 36 }, (_, index) => index),
    ).filter(({ month }) => month.year !== 2018);

    expect(
      yearsOf(kept).map(({ from, year }) => [year, from.assets]),
    ).toStrictEqual([
      [2017, 0],
      [2019, 24],
    ]);
  });

  it("has no year before any point is kept", () => {
    expect(yearsOf([])).toStrictEqual([]);
  });
});
