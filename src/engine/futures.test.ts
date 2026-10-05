// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { expenseLines } from "@/data/expenses.fixture";
import { project } from "@/engine/projection";
import { normalsFrom } from "@/lib/random";

import type { Future } from "./futures";

import { futuresOf, pathOf } from "./futures";

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
