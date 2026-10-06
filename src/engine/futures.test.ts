// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { expenseLines } from "@/data/expenses.fixture";
import { project } from "@/engine/projection";
import { normalsFrom } from "@/lib/random";

import type { Future } from "./futures";

import { futuresOf, pathOf, readingOf, yearIn, yearsIn } from "./futures";

// A plan at 7% and 3% over the years these tests draw.
const plan = { inflation: 0.03, rate: 0.07, years: 40 };

// What a year's figure is as the draw makes it: the logarithm of one
// plus it, which is normal about the logarithm of one plus the plan's.
function logOf(rate: number): number {
  return Math.log1p(rate);
}

function middleOf(values: readonly number[]): number {
  const sorted = values.toSorted((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

describe("pathOf", () => {
  it("draws a return and an inflation for every year the plan carries", () => {
    const path = pathOf(plan, { inflation: 0.02, rate: 0.14 }, normalsFrom(1));

    expect(path.rate).toHaveLength(40);
    expect(path.inflation).toHaveLength(40);
  });

  it("draws the plan's own rates every year where nothing strays", () => {
    const path = pathOf(plan, { inflation: 0, rate: 0 }, normalsFrom(1));

    for (const rate of path.rate) {
      expect(rate).toBeCloseTo(0.07, 15);
    }
    for (const inflation of path.inflation) {
      expect(inflation).toBeCloseTo(0.03, 15);
    }
  });

  // 500 paths of 40 years, 20,000 years each. The middle year's return is
  // the plan's 7% and its inflation the plan's 3%, to within half a
  // point and a tenth of one, some four standard errors of each median;
  // the logarithms stray by the spreads to within about four of theirs;
  // and the average year's return sits above the plan's by about half
  // the spread squared, 1.07 times e to the 0.0098 less one, 8.05%.
  it("draws each year log-normal about the plan's rates, the middle year growing at them", () => {
    const normal = normalsFrom(2026);
    const paths = Array.from({ length: 500 }, () =>
      pathOf(plan, { inflation: 0.02, rate: 0.14 }, normal),
    );
    const rates = paths.flatMap(({ rate }) => rate);
    const inflations = paths.flatMap(({ inflation }) => inflation);
    const spreadOf = (values: readonly number[]): number => {
      const logs = values.map(logOf);
      const mean = logs.reduce((sum, log) => sum + log, 0) / logs.length;
      return Math.sqrt(
        logs.reduce((sum, log) => sum + (log - mean) ** 2, 0) / logs.length,
      );
    };
    const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;

    expect(Math.abs(middleOf(rates) - 0.07)).toBeLessThan(0.005);
    expect(Math.abs(middleOf(inflations) - 0.03)).toBeLessThan(0.001);
    expect(Math.abs(spreadOf(rates) - 0.14)).toBeLessThan(0.003);
    expect(Math.abs(spreadOf(inflations) - 0.02)).toBeLessThan(0.0005);
    expect(Math.abs(average - (1.07 * Math.exp(0.0098) - 1))).toBeLessThan(
      0.005,
    );
  });

  it("never draws a year losing everything, however far it strays", () => {
    const path = pathOf(plan, { inflation: 1, rate: 3 }, normalsFrom(7));

    expect(Math.min(...path.rate)).toBeGreaterThan(-1);
    expect(Math.min(...path.inflation)).toBeGreaterThan(-1);
  });
});

describe("futuresOf", () => {
  // Born in 1990, so 36 when the plan opens in January 2026 and short of
  // the pension age throughout; no inflation, so every figure is the
  // pounds it states.
  const planned = {
    born: 1990,
    from: 2026,
    inflation: 0,
    month: 0,
    rate: 0,
    retires: 90,
    years: 5,
  };

  // £1,000 a month going out and nothing coming in.
  const short = {
    expenses: [
      { ...expenseLines[0], amount: 1000, growth: "nominal" as const },
    ],
    income: [],
  };

  const isa: Account = {
    balance: 30000,
    growth: { kind: "plan" },
    id: 1,
    kind: "tax-free",
    name: "ISA",
    owner: 1,
  };

  const home: Account = {
    balance: 400000,
    growth: { kind: "fixed", rate: 0 },
    id: 2,
    kind: "house",
    name: "Home",
  };

  const nothingStrays = { inflation: 0, rate: 0 };

  function taken(
    accounts: readonly Account[],
    run: Parameters<typeof futuresOf>[2],
    count: number,
  ): readonly Future[] {
    return futuresOf(accounts, short, run).take(count).toArray();
  }

  // £30,000 drawn £12,000 a year holds £18,000 entering 2027 and £6,000
  // entering 2028, which runs out that year; the home is no saving.
  it("runs every future as the plan at its rates where nothing strays", () => {
    const futures = taken(
      [isa, home],
      { plan: planned, spread: nothingStrays },
      3,
    );

    expect(futures).toStrictEqual(
      Array.from({ length: 3 }, () => ({
        fell: 2028,
        ranOut: 2028,
        savings: [30000, 18000, 6000, 0, 0, 0],
      })),
    );
  });

  it("tells a future kept going only by drawing a pension early from one that ran out", () => {
    const pension: Account = { ...isa, balance: 1000000, kind: "tax-deferred" };

    const [future] = taken(
      [pension],
      { plan: planned, spread: nothingStrays },
      1,
    );

    expect(future).toMatchObject({ fell: 2026, ranOut: null });
  });

  it("draws each future from a stream of its own, the same on every run", () => {
    const run = { plan: planned, spread: { inflation: 0.02, rate: 0.15 } };
    const first = taken([isa], run, 3);

    expect(taken([isa], run, 3)).toStrictEqual(first);
    expect(taken([isa], run, 1)).toStrictEqual(first.slice(0, 1));
    expect(new Set(first.map(({ savings }) => savings[2])).size).toBe(3);
  });

  it("draws from any place in the run the futures the run holds there", () => {
    const run = { plan: planned, spread: { inflation: 0.02, rate: 0.15 } };

    expect(
      futuresOf([isa], short, { ...run, from: 2 })
        .take(3)
        .toArray(),
    ).toStrictEqual(taken([isa], run, 5).slice(2));
  });

  // £100,000 at 5% drawn £12,000 a year lasts ten years at its rates with
  // some £12,000 to spare, so some futures straying 15% a year last and
  // some run out.
  it("lasts in some futures and falls short in others where the plan only just lasts", () => {
    const thin = { ...planned, rate: 0.05, years: 10 };
    const saved = { ...isa, balance: 100000 };
    const futures = taken(
      [saved],
      { plan: thin, spread: { inflation: 0.02, rate: 0.15 } },
      40,
    );
    const lasted = futures.filter(({ fell }) => fell === null).length;

    expect(
      project([saved], short, thin).every(({ uncovered }) => uncovered === 0),
    ).toBe(true);
    expect(lasted).toBeGreaterThan(0);
    expect(lasted).toBeLessThan(40);
  });
});

describe("readingOf", () => {
  // A future falling short in the year given, running out in the year
  // given, and holding what is given entering the plan's last year.
  function future(
    fell: null | number,
    ranOut: null | number,
    end: number,
  ): Future {
    return { fell, ranOut, savings: [100000, end] };
  }

  // Ten futures: seven last; one runs out in 2060, one draws a pension
  // early in 2040 and then runs out in 2070, and one only draws early,
  // in 2045. The chance is 70%, give or take Wilson's 1.96 / (1 + 1.96²
  // / 10) × √(0.7 × 0.3 / 10 + 1.96² / 400), 24.8 points; the first ran
  // out in 2060, and so had
  // the lower half of the two; a tenth, one, had fallen short by 2040;
  // and the sixth of the ends in order, the middle one, is £500,000.
  it("counts what lasted, ran out and drew early, and reads when the run turns and what the middle future holds", () => {
    const futures = [
      future(null, null, 500000),
      future(null, null, 300000),
      future(2060, 2060, 0),
      future(2040, 2070, 0),
      future(2045, null, 200000),
      future(null, null, 400000),
      future(null, null, 600000),
      future(null, null, 700000),
      future(null, null, 800000),
      future(null, null, 900000),
    ];

    expect(readingOf(futures)).toStrictEqual({
      chance: 0.7,
      early: 1,
      firstRanOut: 2060,
      halfRanOut: 2060,
      lasted: 7,
      margin:
        (1.96 / (1 + 1.96 ** 2 / 10)) *
        Math.sqrt((0.7 * 0.3) / 10 + 1.96 ** 2 / 400),
      middle: 500000,
      ranOut: 2,
      run: 10,
      tenthFell: 2040,
    });
  });

  // A thousand futures all lasting are not certain to: Wilson's range
  // still runs 0.19 of a point below them.
  it("gives a run that all lasted a range all the same", () => {
    const lasting = Array.from({ length: 1000 }, (): Future => ({
      fell: null,
      ranOut: null,
      savings: [1],
    }));

    expect(readingOf(lasting).margin).toBeCloseTo(0.0019134, 6);
  });

  it("reads a run of none as nothing at all, and a future holding no years as holding nothing", () => {
    expect(readingOf([])).toStrictEqual({
      chance: 0,
      early: 0,
      firstRanOut: null,
      halfRanOut: null,
      lasted: 0,
      margin: 0,
      middle: 0,
      ranOut: 0,
      run: 0,
      tenthFell: null,
    });
    expect(readingOf([{ fell: null, ranOut: null, savings: [] }]).middle).toBe(
      0,
    );
  });
});

describe("yearsIn", () => {
  const span = { from: 2026, years: 2 };

  // Ten futures, the nth holding n thousand pounds entering 2026, twice
  // that entering 2027 and three times entering 2028; the first falls
  // short in 2027 and the second in 2028. So a year is lasting for every
  // future not yet fallen short as it opens, and the poor, middle and
  // good futures are the second, sixth and ninth in order.
  it("lays a run on the plan's years, counting what lasts and falls short and reading the spread of the savings", () => {
    const futures = Array.from({ length: 10 }, (_, nth): Future => ({
      fell: [2027, 2028][nth] ?? null,
      ranOut: null,
      savings: [1000 * nth, 2000 * nth, 3000 * nth],
    }));

    expect(yearsIn(futures, span)).toStrictEqual([
      {
        fell: 0,
        good: 8000,
        lasting: 10,
        middle: 5000,
        poor: 1000,
        year: 2026,
      },
      {
        fell: 1,
        good: 16000,
        lasting: 10,
        middle: 10000,
        poor: 2000,
        year: 2027,
      },
      {
        fell: 1,
        good: 24000,
        lasting: 9,
        middle: 15000,
        poor: 3000,
        year: 2028,
      },
    ]);
  });

  it("reads a run of none as holding nothing in every year, and a future with no point for a year as holding nothing in it", () => {
    expect(
      yearsIn([], span).map(({ middle, year }) => [year, middle]),
    ).toStrictEqual([
      [2026, 0],
      [2027, 0],
      [2028, 0],
    ]);
    expect(
      yearIn([{ fell: null, ranOut: null, savings: [] }], span, 2027).middle,
    ).toBe(0);
  });
});
