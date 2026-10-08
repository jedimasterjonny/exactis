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
