// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ProgressPoint } from "./progress";

import { latestYearOf, movesOf, sumOf } from "./progress";
import { points } from "./progress.fixture";

// The fixture's first point and its last, March and August 2026.
function ends(): { readonly from: ProgressPoint; readonly to: ProgressPoint } {
  const [from] = points;
  const to = points.at(-1);
  if (from === undefined || to === undefined) {
    throw new Error("The fixture keeps points.");
  }
  return { from, to };
}

// A point a month, from June 2019, its property worth what is given
// and nothing else held or owed, so its net worth is that figure.
function monthly(worths: readonly number[]): ProgressPoint[] {
  return worths.map((assets, index) => ({
    assets,
    deferred: 0,
    free: 0,
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
