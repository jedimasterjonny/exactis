// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { Measured, Milestone } from "@/data/milestones";

import { expenseLines } from "@/data/expenses.fixture";
import { milestones } from "@/data/milestones.fixture";
import { owners, working } from "@/data/owners.fixture";
import { project } from "@/engine/projection";
import { normalsFrom } from "@/lib/random";

import type { Future } from "./futures";

import {
  futureOf,
  futuresOf,
  gradingOf,
  markersIn,
  outcomesOf,
  pathOf,
  reachedBy,
  reachedIn,
  readingOf,
  yearsIn,
} from "./futures";

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

// Years measured as worth what is given, from 34, holding no property,
// owing nothing and spending nothing, so each is as liquid as it is
// worth.
function worthOf(pounds: readonly number[]): Measured[] {
  return pounds.map((worth, offset) => ({
    age: 34 + offset,
    debt: 0,
    expenses: 0,
    liquid: worth,
    worth,
  }));
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

  // Along a glide path stepping from 7% to 5%, a year where nothing
  // strays is the glide path's own.
  it("draws each year about the glide path's rate for it", () => {
    const path = pathOf(
      { ...plan, byYear: [0.07, 0.06, 0.05], years: 3 },
      { inflation: 0, rate: 0 },
      normalsFrom(1),
    );

    expect(path.rate[0]).toBeCloseTo(0.07, 15);
    expect(path.rate[1]).toBeCloseTo(0.06, 15);
    expect(path.rate[2]).toBeCloseTo(0.05, 15);
  });

  // Along a glide path, each year strays by its own spread: the first
  // by none, so it is the plan's 7% exactly, and the second by 14%.
  it("draws each year by the glide path's spread for it", () => {
    const draws = Array.from({ length: 20 }, (_, seed) =>
      pathOf(
        { ...plan, years: 2 },
        { byYear: [0, 0.14], inflation: 0, rate: 0.5 },
        normalsFrom(seed),
      ),
    );

    for (const { rate } of draws) {
      expect(rate[0]).toBeCloseTo(0.07, 15);
    }
    expect(new Set(draws.map(({ rate }) => rate[1])).size).toBe(20);
  });

  it("never draws a year losing everything, however far it strays", () => {
    const path = pathOf(plan, { inflation: 1, rate: 3 }, normalsFrom(7));

    expect(Math.min(...path.rate)).toBeGreaterThan(-1);
    expect(Math.min(...path.inflation)).toBeGreaterThan(-1);
  });
});

describe("futuresOf", () => {
  // Born in 1992, so 34 when the plan opens in January 2026 and short of
  // the pension age throughout; no inflation, so every figure is the
  // pounds it states.
  const planned = {
    born: 1992,
    from: 2026,
    inflation: 0,
    month: 0,
    owners: [working],
    rate: 0,
    retires: 92,
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
  // entering 2028, which runs out that year; the home is no saving, but
  // it is worth £400,000 throughout, so the plan is worth that much
  // more than it is liquid. Nothing is owed, the £1,000 a month going
  // out is £12,000 a year, and the owner is 34 as the plan opens.
  it("runs every future as the plan at its rates where nothing strays", () => {
    const futures = taken(
      [isa, home],
      { plan: planned, spread: nothingStrays },
      3,
    );

    expect(futures).toStrictEqual(
      Array.from({ length: 3 }, () => ({
        fell: 2028,
        measured: [430000, 418000, 406000, 400000, 400000, 400000].map(
          (worth, offset) => ({
            age: 34 + offset,
            debt: 0,
            expenses: 12000,
            liquid: worth - 400000,
            worth,
          }),
        ),
        ranOut: 2028,
        retired: 2084,
      })),
    );
  });

  // Owing £100,000 on a loan nothing pays, charged nothing, the plan is
  // worth £100,000 less than its ISA and its home and the loan is
  // counted as owed; opening in July, the first year's expenses are
  // still a year's, twelve of July's.
  it("measures each year by what is owed and what a year of the lines costs, the first from the plan's month", () => {
    const loan: Account = {
      balance: -100000,
      growth: { kind: "fixed", rate: 0 },
      id: 3,
      kind: "debt",
      name: "Loan",
    };

    const [future] = taken(
      [isa, home, loan],
      { plan: { ...planned, month: 6 }, spread: nothingStrays },
      1,
    );

    expect(future?.measured[0]).toStrictEqual({
      age: 34,
      debt: 100000,
      expenses: 12000,
      liquid: -70000,
      worth: 330000,
    });
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
    expect(new Set(first.map(({ measured }) => measured[2]?.worth)).size).toBe(
      3,
    );
  });

  it("draws other futures from another seed, the same on every run from it", () => {
    const run = { plan: planned, spread: { inflation: 0.02, rate: 0.15 } };
    const unseeded = taken([isa], run, 3);
    const reseeded = taken([isa], { ...run, seed: 7 }, 3);

    expect(taken([isa], { ...run, seed: 7 }, 3)).toStrictEqual(reseeded);
    expect(taken([isa], { ...run, seed: 2026 }, 3)).toStrictEqual(unseeded);
    for (const [index, future] of reseeded.entries()) {
      expect(future).not.toStrictEqual(unseeded[index]);
    }
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

describe("futureOf", () => {
  // From 34 in 2026 over two years, at no growth and no inflation, with
  // £100,000 in an ISA and nothing coming in: £2,000 a month spent
  // until retirement and £1,000 after it, each line tied there.
  const plan = {
    born: 1992,
    from: 2026,
    inflation: 0,
    month: 0,
    owners: [working],
    rate: 0,
    retires: 37,
    years: 2,
  };
  const isa: Account = {
    balance: 100000,
    growth: { kind: "fixed", rate: 0 },
    id: 1,
    kind: "tax-free",
    name: "ISA",
    owner: 1,
  };
  const [line] = expenseLines;
  const lines = {
    expenses: [
      { ...line, amount: 2000, endsAt: "retirement", lastYear: 2028 },
      {
        ...line,
        amount: 1000,
        firstYear: 2029,
        id: 2,
        lastYear: null,
        startsAt: "retirement",
      },
    ],
    income: [],
  } as const;

  // The owner retiring on the plan's net worth.
  function retiringOn(pounds: number): typeof plan {
    return {
      ...plan,
      owners: [
        {
          ...working,
          retirement: [{ measure: "worth", of: "pounds", times: pounds }],
        },
      ],
    };
  }

  function futureFor(planned: typeof plan): Future {
    const run = { accounts: [isa], plan: planned, schedule: lines };
    return futureOf(project([isa], lines, planned), run);
  }

  // Any net worth at all is reached as the plan opens, so the owner
  // retires at once and every year spends what retirement does; ten
  // million never is, and every year spends what work does.
  it("reads the year the owner retired in and measures each year by the lines as the run carried them", () => {
    const retired = futureFor(retiringOn(0));
    const toTheEnd = futureFor(retiringOn(10000000));

    expect(retired.retired).toBe(2026);
    expect(retired.measured.map(({ expenses }) => expenses)).toStrictEqual([
      12000, 12000, 12000,
    ]);
    expect(toTheEnd.retired).toBeNull();
    expect(toTheEnd.measured.map(({ expenses }) => expenses)).toStrictEqual([
      24000, 24000, 24000,
    ]);
    expect(futureFor(plan).retired).toBe(2029);
  });

  // A home worth £400,000 owing £108,000 as 2027 opens moves to one
  // costing £500,000 and £15,000 of duty, borrowing the £223,000 the
  // sale leaves short at £1,858.33 a month: a year's expenses are the
  // old mortgage's £12,000 until then and the new one's £22,300 from
  // the year it is taken out.
  it("measures each year from a move over the mortgage it took out", () => {
    const house: Account = {
      balance: 400000,
      bought: { month: { month: 9, year: 2021 }, price: 380000 },
      growth: { kind: "fixed", rate: 0 },
      id: 2,
      kind: "house",
      move: {
        at: 1,
        mortgage: { loanToValue: 0.9, rate: 0, term: 10 },
        price: 500000,
        year: 2027,
      },
      name: "Home",
    };
    const loan: Account = {
      balance: -120000,
      growth: { kind: "fixed", rate: 0 },
      id: 3,
      kind: "debt",
      name: "Home mortgage",
      secures: house.id,
    };
    const accounts = [isa, house, loan];
    const paying = {
      expenses: [{ ...line, amount: 1000, lastYear: null, pays: loan.id }],
      income: [],
    };
    const future = futureOf(project(accounts, paying, plan), {
      accounts,
      plan,
      schedule: paying,
    });

    expect(future.measured.map(({ expenses }) => expenses)).toStrictEqual([
      12000, 22300, 22300,
    ]);
  });
});

describe("gradingOf", () => {
  // Born in 1970 and retiring at 60, in 2030, the fifth of the plan's
  // years; the plan ends in 2036, so retirement runs six years, its two
  // fifths to 2032.4 and its four to 2034.8.
  const plan = {
    born: 1970,
    from: 2026,
    inflation: 0,
    month: 0,
    owners: [{ ...working, born: 1970, retires: 60 }],
    rate: 0,
    retires: 60,
    years: 10,
  };

  // The plan at its own rates, worth £100,000 as its owner retires and
  // less either side of it.
  const projected: Future = {
    fell: null,
    measured: worthOf([
      50000, 60000, 70000, 80000, 100000, 90000, 80000, 70000, 60000, 50000,
      40000,
    ]),
    ranOut: null,
    retired: 2030,
  };

  // Over fifteen years of retirement the fifths land on whole years, six
  // and twelve in, which fifths taken in fractions of a year would
  // round a year late.
  it("draws the lines at the plan's worth as its owner retires and at fifths of retirement", () => {
    expect(gradingOf(projected, plan)).toStrictEqual({
      almost: 2035,
      comfortable: 50000,
      middle: 2033,
      surplus: 300000,
    });
    expect(gradingOf(projected, { ...plan, years: 19 })).toMatchObject({
      almost: 2042,
      middle: 2036,
    });
  });

  // Retiring at 80, in 2050, is past the plan's end, so its own ten years
  // are divided, two fifths in by 2030 and four by 2034, and its worth
  // read at its last year, £40,000, as they are where its retirement on
  // conditions is never reached at its own rates. Retiring in 2010 is
  // before its start, so retirement counts from 2026, with the same
  // fifths, and its worth is read at its first year, £50,000.
  it("divides the plan's own years where it ends before retiring or never retires, and counts a retirement begun from its start", () => {
    const pastTheEnd = {
      almost: 2034,
      comfortable: 20000,
      middle: 2030,
      surplus: 120000,
    };

    expect(gradingOf({ ...projected, retired: 2050 }, plan)).toStrictEqual(
      pastTheEnd,
    );
    expect(gradingOf({ ...projected, retired: null }, plan)).toStrictEqual(
      pastTheEnd,
    );
    expect(gradingOf({ ...projected, retired: 2010 }, plan)).toStrictEqual({
      almost: 2034,
      comfortable: 25000,
      middle: 2030,
      surplus: 150000,
    });
  });

  // Owing £100,000 at retirement, the plan is graded against the £50,000
  // it is worth today; worth nothing at retirement and owing today, it is
  // graded against nothing rather than the debt, so the lines meet
  // rather than cross.
  it("grades against today's worth where the plan is worth nothing at retirement, and never against less than nothing", () => {
    const owing = (today: number, retiring: number): Future => ({
      ...projected,
      measured: projected.measured.map((each, year) => {
        if (year === 0) {
          return { ...each, worth: today };
        }
        return year === 4 ? { ...each, worth: retiring } : each;
      }),
    });

    expect(gradingOf(owing(50000, -100000), plan)).toMatchObject({
      comfortable: 25000,
      surplus: 150000,
    });
    expect(gradingOf(owing(-10000, 0), plan)).toMatchObject({
      comfortable: 0,
      surplus: 0,
    });
  });

  it("reads a plan holding no years as worth nothing", () => {
    expect(gradingOf({ ...projected, measured: [] }, plan)).toMatchObject({
      comfortable: 0,
      surplus: 0,
    });
  });
});

describe("outcomesOf", () => {
  const grading = {
    almost: 2035,
    comfortable: 50000,
    middle: 2033,
    surplus: 300000,
  };

  function lasting(left: number): Future {
    return {
      fell: null,
      measured: worthOf([0, left]),
      ranOut: null,
      retired: 2030,
    };
  }

  function short(fell: number, ranOut: null | number = fell): Future {
    return { fell, measured: worthOf([0, 0]), ranOut, retired: 2030 };
  }

  // More than £300,000 is a large surplus, £300,000 itself and down to
  // £50,000 comfortable, and under that barely. 2035 and on almost made
  // it, 2033 and 2034 the middle, and before that early. Drawing a
  // pension early in 2035 is graded as falling short then.
  it("grades what lasted by what it leaves and what fell short by when", () => {
    expect(
      outcomesOf(
        [
          lasting(300001),
          lasting(300000),
          lasting(50000),
          lasting(49999),
          short(2035),
          short(2035, null),
          short(2034),
          short(2033),
          short(2032),
          short(2028),
        ],
        grading,
      ),
    ).toStrictEqual({
      almost: 2,
      barely: 1,
      comfortable: 2,
      early: 2,
      middle: 2,
      surplus: 1,
    });
  });

  it("reads a future holding no years as holding nothing", () => {
    expect(
      outcomesOf([{ ...lasting(0), measured: [] }], grading),
    ).toMatchObject({ barely: 1 });
  });

  // Never retiring, a future leaving a large surplus fell short before
  // retirement all the same.
  it("grades a future whose owner never retired as falling short early", () => {
    expect(
      outcomesOf([{ ...lasting(1000000), retired: null }], grading),
    ).toMatchObject({ early: 1, surplus: 0 });
  });
});

describe("readingOf", () => {
  // A future falling short in the year given, running out in the year
  // given, and worth what is given entering the plan's last year.
  function future(
    fell: null | number,
    ranOut: null | number,
    end: number,
  ): Future {
    return { fell, measured: worthOf([100000, end]), ranOut, retired: 2030 };
  }

  // Ten futures: seven last; one runs out in 2060, one draws a pension
  // early in 2040 and then runs out in 2070, and one only draws early,
  // in 2045. The chance is 70%, give or take Wilson's 1.96 / (1 + 1.96²
  // / 10) × √(0.7 × 0.3 / 10 + 1.96² / 400), 24.8 points; the first ran
  // out in 2060, and so had
  // the lower half of the two; and the sixth of the ends in order, the
  // middle one, is £500,000.
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
      unretired: 0,
    });
  });

  // Of four futures, one lasts, one runs out, and two never see their
  // owner retire: one of them working to the end, which is no lasting,
  // and one drawing a pension early first, which is counted as that.
  it("counts a future whose owner never retired apart, as falling short", () => {
    expect(
      readingOf([
        future(null, null, 100000),
        future(2040, 2040, 0),
        { ...future(null, null, 900000), retired: null },
        { ...future(2045, null, 0), retired: null },
      ]),
    ).toMatchObject({
      chance: 0.25,
      early: 1,
      lasted: 1,
      ranOut: 1,
      unretired: 1,
    });
  });

  // A thousand futures all lasting are not certain to: Wilson's range
  // still runs 0.19 of a point below them.
  it("gives a run that all lasted a range all the same", () => {
    const lasting = Array.from({ length: 1000 }, (): Future => ({
      fell: null,
      measured: worthOf([1]),
      ranOut: null,
      retired: 2030,
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
      unretired: 0,
    });
    expect(
      readingOf([{ fell: null, measured: [], ranOut: null, retired: 2030 }])
        .middle,
    ).toBe(0);
  });
});

describe("reachedIn", () => {
  const [, , firstMillion, independence] = milestones;
  const plan = { from: 2026 };

  // Worth £900,000 entering 2026, a million entering 2027 and £1,100,000
  // entering 2028, the first million is reached in 2027; nothing is
  // spent or owed, so independence is reached at once.
  it("reads the first year the goal's conditions all hold, or null where they never do", () => {
    const future: Future = {
      fell: null,
      measured: worthOf([900000, 1000000, 1100000]),
      ranOut: null,
      retired: null,
    };

    expect(reachedIn(future, firstMillion, plan)).toBe(2027);
    expect(reachedIn(future, independence, plan)).toBe(2026);
    expect(
      reachedIn(
        { ...future, measured: worthOf([900000, 950000]) },
        firstMillion,
        plan,
      ),
    ).toBeNull();
  });

  it("reads the first year it holds, whatever the years after it do", () => {
    expect(
      reachedIn(
        {
          fell: null,
          measured: worthOf([0, 1000000, 0]),
          ranOut: null,
          retired: null,
        },
        firstMillion,
        plan,
      ),
    ).toBe(2027);
  });

  // From 34 in 2026, 36 is reached in 2028, whatever the future holds.
  it("reads the year an age is reached in off the future's ages", () => {
    const atAge = (times: number): Milestone => ({
      ...firstMillion,
      conditions: [{ measure: "age", of: "years", times }],
    });
    const future: Future = {
      fell: null,
      measured: worthOf([0, 0, 0]),
      ranOut: null,
      retired: null,
    };

    expect(reachedIn(future, atAge(36), plan)).toBe(2028);
    expect(reachedIn(future, atAge(37), plan)).toBeNull();
  });
});

// Ten futures over twelve years, the nth reaching a million entering
// 2030 + n for the first eight and the last two never: the earliest 5%
// and 10% have by 2030, the first of them; the earliest 25% by 2032,
// the third; half by 2034, the fifth; four in five by 2037, the eighth;
// and nine in ten never have.
const reaching = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: null,
  measured: worthOf(
    Array.from({ length: 12 }, (_, offset) =>
      nth < 8 && offset >= 4 + nth ? 1000000 : 0,
    ),
  ),
  ranOut: null,
  retired: nth < 8 ? 2030 + nth : null,
}));

describe("reachedBy", () => {
  const [, , firstMillion] = milestones;
  const plan = { from: 2026 };

  it("reads the year by which the share of the run has reached the goal, or null where fewer ever do", () => {
    expect(
      [0.05, 0.1, 0.25, 0.5, 0.8, 0.9].map((share) =>
        reachedBy(reaching, firstMillion, { plan, share }),
      ),
    ).toStrictEqual([2030, 2030, 2032, 2034, 2037, null]);
  });

  it("reaches nothing over a run of none", () => {
    expect(reachedBy([], firstMillion, { plan, share: 0.5 })).toBeNull();
  });
});

describe("markersIn", () => {
  const [kidsLeave, , firstMillion] = milestones;
  // Born in 1992, from 2026 over eleven years and retiring at 61, in
  // 2053, past the plan's end; the children leave home at 48, in 2040,
  // past it too.
  const planned = {
    born: 1992,
    from: 2026,
    inflation: 0,
    month: 0,
    owners: [...owners],
    rate: 0,
    retires: 61,
    years: 11,
  };
  const retirement = { id: "retirement", name: "Retirement", year: 2053 };

  it("places a milestone reached at an age where the plan lays it, and one reached when conditions hold in the year by which half the futures have, in the order their years come", () => {
    expect(
      markersIn(reaching, [kidsLeave, firstMillion], planned),
    ).toStrictEqual([
      { id: 9, name: "First million", year: 2034 },
      { id: 7, name: "Kids leave home", year: 2040 },
      retirement,
    ]);
  });

  it("leaves out one fewer than half the futures ever reach, and every one reached when conditions hold over a run of none", () => {
    const twoMillion: Milestone = {
      ...firstMillion,
      conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
    };

    expect(markersIn(reaching, [twoMillion], planned)).toStrictEqual([
      retirement,
    ]);
    expect(markersIn([], [kidsLeave, firstMillion], planned)).toStrictEqual([
      { id: 7, name: "Kids leave home", year: 2040 },
      retirement,
    ]);
  });

  // Retiring on financial independence, the owner retires in 2030 + n
  // in the nth future for the first eight and never in the last two, so
  // half have by 2034; and over the same futures given another one, a
  // future in which they retire, fewer than half have by any year.
  it("places a retirement on conditions in the year by which half the futures retired, and leaves it out where fewer ever do", () => {
    const [, , , independence] = milestones;
    const onConditions = {
      ...planned,
      owners: [{ ...owners[0], retirement: independence.conditions }],
      retires: 51,
    };

    expect(markersIn(reaching, [kidsLeave], onConditions)).toStrictEqual([
      { ...retirement, year: 2034 },
      { id: 7, name: "Kids leave home", year: 2040 },
    ]);
    expect(
      markersIn(
        reaching.map((future, nth) =>
          nth < 6 ? { ...future, retired: null } : future,
        ),
        [],
        onConditions,
      ),
    ).toStrictEqual([]);
  });
});

describe("yearsIn", () => {
  const span = { from: 2026, years: 2 };

  // Ten futures, the nth worth n thousand pounds entering 2026, twice
  // that entering 2027 and three times entering 2028, whatever they
  // save; the first runs out in 2027 and the second in 2028, and the
  // third only draws a pension early in 2027. So the bottom tenth and
  // quarter are the second and third in order, the middle the sixth,
  // and the top quarter and tenth the eighth and ninth.
  it("lays a run on the plan's years, reading the spread of its worth and counting what has run out", () => {
    const futures = Array.from({ length: 10 }, (_, nth): Future => ({
      fell: [2027, 2028, 2027][nth] ?? null,
      measured: worthOf([1000 * nth, 2000 * nth, 3000 * nth]),
      ranOut: [2027, 2028][nth] ?? null,
      retired: 2084,
    }));

    expect(yearsIn(futures, span)).toStrictEqual([
      {
        bottomQuarter: 2000,
        bottomTenth: 1000,
        middle: 5000,
        outOfMoney: 0,
        topQuarter: 7000,
        topTenth: 8000,
        year: 2026,
      },
      {
        bottomQuarter: 4000,
        bottomTenth: 2000,
        middle: 10000,
        outOfMoney: 1,
        topQuarter: 14000,
        topTenth: 16000,
        year: 2027,
      },
      {
        bottomQuarter: 6000,
        bottomTenth: 3000,
        middle: 15000,
        outOfMoney: 2,
        topQuarter: 21000,
        topTenth: 24000,
        year: 2028,
      },
    ]);
  });

  it("reads a run of none as worth nothing in every year, and a future with no point for a year as worth nothing in it", () => {
    expect(
      yearsIn([], span).map(({ middle, year }) => [year, middle]),
    ).toStrictEqual([
      [2026, 0],
      [2027, 0],
      [2028, 0],
    ]);
    expect(
      yearsIn(
        [{ fell: null, measured: [], ranOut: null, retired: 2084 }],
        span,
      ).map(({ middle }) => middle),
    ).toStrictEqual([0, 0, 0]);
  });
});
