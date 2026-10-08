// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ProgressPoint } from "./progress";

import { latestYearOf, movesOf, sumOf, yearsOf } from "./progress";
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
