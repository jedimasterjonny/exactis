import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";

import { endYear, project } from "./projection";

const [pension, isa, cash, home, mortgage] = accounts;
const [salary] = incomeLines;
const [household] = expenseLines;

// Read at the start of its first year, so every year is carried whole.
const plan = { born: 1990, from: 2026, month: 0, rate: 0.05 };

// Nothing going out and one line coming in wide enough to cover every
// fixed sum these tests pay, feeding no pension and sacrificing nothing,
// since a fixed sum is paid only out of what the month has: no account
// here takes the spare money, so each is paid its fixed sum whole and
// what the month does not use simply stays.
const funded = {
  expenses: [],
  income: [
    { ...salary, amount: 120000, bonus: 0, feeds: null, rsu: 0, sacrifice: 0 },
  ],
};

// The salary against the household, which leaves £8,750 a month in
// 2026, and the salary alone from 2048, when the household ends.
const schedule = { expenses: [household], income: [salary] };

// The ISA paid the spare money to its allowance, at no growth so what
// lands is what is counted.
const spareIsa: Account = {
  ...isa,
  contribution: { cap: null, kind: "spare" },
  growth: { kind: "fixed", rate: 0 },
};

// Nothing coming in and £1,000 a month going out, so every month of the
// plan is £1,000 short and nothing is ever paid into an account.
const short = { expenses: [{ ...household, amount: 1000 }], income: [] };

// The savings a shortfall is drawn from, at no growth so what each
// gives up is read back exactly: cash, an ISA and a pension.
const pocket: Account = { ...cash, balance: 1200 };

const flatIsa: Account = {
  balance: 20000,
  growth: { kind: "fixed", rate: 0 },
  id: 6,
  kind: "tax-free",
  name: "Flat ISA",
};

const sipp: Account = {
  balance: 12000,
  growth: { kind: "fixed", rate: 0 },
  id: 7,
  kind: "tax-deferred",
  name: "SIPP",
};

describe("project", () => {
  // The ISA's £20,000 a year lands as £1,666.67 a month, each month's
  // then growing at m = 1.05^(1/12) for the months it is in: 286,145 ×
  // 1.05 + 1,666.67 × m(m¹² − 1)/(m − 1) = 300,452.25 + 20,537.63 =
  // 320,989.88, then the same again on that: 357,577.00. The pension
  // the same way with £2,266.25 a month: 461,450.04, then 512,448.58.
  // The current account, the home and the mortgage are no wrapper and
  // are left out.
  it("pays a year's sum in a twelfth at a time, each month grown at the plan rate, by wrapper", () => {
    expect(project(accounts, funded, { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 412880, free: 286145, uncovered: 0, year: 2026 },
      { age: 37, deferred: 461450, free: 320990, uncovered: 0, year: 2027 },
      { age: 38, deferred: 512449, free: 357577, uncovered: 0, year: 2028 },
    ]);
  });

  // 1,000 + 12 × 100 = 2,200, then 3,400, at no growth so each month's
  // hundred is counted and nothing else is.
  it("pays a monthly contribution in every month", () => {
    const monthly: Account = {
      balance: 1000,
      contribution: { amount: 100, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0 },
      id: 6,
      kind: "tax-free",
      name: "Regular saver",
    };

    expect(project([monthly], funded, { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 0, free: 1000, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 2200, uncovered: 0, year: 2027 },
      { age: 38, deferred: 0, free: 3400, uncovered: 0, year: 2028 },
    ]);
  });

  // 320,989.88 from the ISA and 10,000 × 1.02 = 10,200 from an account
  // with nothing paid in.
  it("grows an account on a fixed rate at its own and sums the accounts", () => {
    const lifetime: Account = {
      balance: 10000,
      growth: { kind: "fixed", rate: 0.02 },
      id: 6,
      kind: "tax-free",
      name: "Lifetime ISA",
    };

    expect(
      project([isa, lifetime], funded, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 296145, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 331190, uncovered: 0, year: 2027 },
    ]);
  });

  // £8,750 a month is left, of which the ISA takes £1,666.67, a twelfth
  // of its £20,000 allowance, so a year adds £20,000: 306,145, then
  // 326,145.
  it("pays a spare-money account its take of the year's cash flow, every month", () => {
    expect(project([spareIsa], schedule, { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 0, free: 286145, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 306145, uncovered: 0, year: 2027 },
      { age: 38, deferred: 0, free: 326145, uncovered: 0, year: 2028 },
    ]);
  });

  // The salary's £1,000 a month sacrificed, the mortgage's £2,210 a
  // month and the pension's £27,195 a year come out of the month before
  // the spare money does, leaving £3,273.42, and the current account,
  // listed first and uncapped, takes all of it, so the ISA is paid
  // nothing; the pension is still paid its sum, a twelfth a month, and
  // fed the £1,150 that lands with the NI saved on top: 475,621.
  it("reads the cash flow over every account, in the order they are listed", () => {
    const spareCash: Account = {
      ...cash,
      contribution: { cap: null, kind: "spare" },
    };
    const [, a, b] = project(
      [spareCash, spareIsa, pension, mortgage],
      schedule,
      { ...plan, years: 2 },
    );

    expect(a?.free).toBe(286145);
    expect(b?.free).toBe(286145);
    expect(a?.deferred).toBe(475621);
  });

  // A pension paid nothing of its own and fed the salary's £1,000 a
  // month, at no growth, is £13,800 up on the year: the sacrifice with
  // the employer's fifteen per cent NI saved on it.
  it("pays a salary's sacrifice into the pension it feeds, with the NI saved", () => {
    const fed: Account = {
      balance: 0,
      growth: { kind: "fixed", rate: 0 },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
    };

    expect(
      project([fed], { expenses: [], income: [salary] }, { ...plan, years: 2 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 0, uncovered: 0, year: 2026 },
      { age: 37, deferred: 13800, free: 0, uncovered: 0, year: 2027 },
      { age: 38, deferred: 27600, free: 0, uncovered: 0, year: 2028 },
    ]);
  });

  // A pension is never fed in a month it could be drawn on. £5,000 a
  // month against £5,200 of spending does not cover itself, so the
  // £500 the salary would have sacrificed is earned and spent instead,
  // the SIPP it feeds is fed nothing and stays at the nothing it opens
  // with, and the year is short by the £200 a month the income does not
  // cover, £2,400 over its twelve. Born in 1960, so the SIPP is
  // drawable in every month of the year and has nothing to give.
  it("feeds no pension in a year it is short, and leaves an empty one empty", () => {
    const earner = {
      ...salary,
      amount: 60000,
      bonus: 0,
      feeds: sipp.id,
      rsu: 0,
    };

    expect(
      project(
        [{ ...sipp, balance: 0 }],
        { expenses: [{ ...household, amount: 5200 }], income: [earner] },
        { ...plan, born: 1960, years: 1 },
      ),
    ).toStrictEqual([
      { age: 66, deferred: 0, free: 0, uncovered: 2400, year: 2026 },
      { age: 67, deferred: 0, free: 0, uncovered: 0, year: 2027 },
    ]);
  });

  // The salary ends with 2027, so 2028 is carried with nothing fed and
  // the pension holds what two years landed.
  it("stops paying the sacrifice in when the salary ends", () => {
    const fed: Account = {
      balance: 0,
      growth: { kind: "fixed", rate: 0 },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
    };

    expect(
      project(
        [fed],
        { expenses: [], income: [{ ...salary, lastYear: 2027 }] },
        { ...plan, years: 3 },
      ).map(({ deferred }) => deferred),
    ).toStrictEqual([0, 13800, 27600, 27600]);
  });

  // Two ISAs that share an id, which the store never hands out, are
  // each paid their own take and not each other's: £8,750 is left,
  // each takes £1,666.67, and each is £20,000 up on the year.
  it("pays each account its own take, whatever its id", () => {
    const twin: Account = { ...spareIsa, name: "Twin ISA" };
    const [, after] = project([spareIsa, twin], schedule, {
      ...plan,
      years: 1,
    });

    expect(after?.free).toBe(2 * 286145 + 2 * 20000);
  });

  // The household ends in 2047, so from 2048 the whole salary is spare,
  // and the ISA still takes no more than its allowance.
  it("reads each year's cash flow afresh", () => {
    const points = project([spareIsa], schedule, { ...plan, years: 23 });
    const [first, second] = points;
    const last = points.at(-1);

    expect(second?.free).toBe((first?.free ?? 0) + 20000);
    expect(last?.year).toBe(2049);
    expect(last?.free).toBe(286145 + 23 * 20000);
  });

  // The household ends in March 2027, so an ISA with a cap above the
  // whole month takes the £8,750 left in each of 2026's twelve months
  // and 2027's first three, and the whole £12,250 in the nine after:
  // 105,000 on the year, then 26,250 + 110,250.
  it("pays a line to the month it ends in, reading each month's flow afresh", () => {
    const wide: Account = {
      ...spareIsa,
      contribution: { cap: 240000, kind: "spare" },
    };
    const ending = { ...household, lastMonth: 2, lastYear: 2027 };

    expect(
      project(
        [wide],
        { expenses: [ending], income: [salary] },
        { ...plan, years: 2 },
      ),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 286145, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 391145, uncovered: 0, year: 2027 },
      { age: 38, deferred: 0, free: 527645, uncovered: 0, year: 2028 },
    ]);
  });

  // Read in September, the first year has four months to run: £1,666.67
  // in each is £6,666.67, then a whole year's £20,000 on top.
  it("carries the first year from the month the plan is read in", () => {
    expect(
      project([spareIsa], schedule, { ...plan, month: 8, years: 2 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 286145, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 292812, uncovered: 0, year: 2027 },
      { age: 38, deferred: 0, free: 312812, uncovered: 0, year: 2028 },
    ]);
  });

  // The last year plotted is entered, not carried: a line paid only in
  // that year lands in no point.
  it("carries nothing through the last year, whose point is the balance entering it", () => {
    const lastYearOnly = { ...salary, firstYear: 2027, lastYear: 2027 };

    expect(
      project(
        [spareIsa],
        { expenses: [], income: [lastYearOnly] },
        { ...plan, years: 1 },
      ),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 286145, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 286145, uncovered: 0, year: 2027 },
    ]);
  });

  // Read in December, so 2026 carries one month: the £1,000 going out
  // comes from the £1,200 of cash and the ISA is left whole, which is
  // why 2027 enters on the same £20,000. 2027 carries twelve: the £200
  // of cash left covers a fifth of January and the ISA the £800 after
  // it, then the eleven months of £1,000 each, £11,800 in all, so
  // 20,000 − 11,800 = 8,200. Cash is carried and drawn from but never
  // plotted.
  it("draws a shortfall from cash before the ISA, and from the ISA once cash is empty", () => {
    expect(
      project([pocket, flatIsa], short, { ...plan, month: 11, years: 2 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 20000, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 20000, uncovered: 0, year: 2027 },
      { age: 38, deferred: 0, free: 8200, uncovered: 0, year: 2028 },
    ]);
  });

  // Born in 1970, so 2026 is the year 56 is reached and the pension
  // cannot be touched: the year's twelve £1,000 go uncovered and the
  // £100,000 compounds a whole year to 105,000 all the same.
  it("leaves a pension where it is before the access age, and the months short", () => {
    const growing: Account = {
      ...sipp,
      balance: 100000,
      growth: { kind: "plan" },
    };

    expect(
      project([growing], short, { ...plan, born: 1970, years: 1 }),
    ).toStrictEqual([
      { age: 56, deferred: 100000, free: 0, uncovered: 12000, year: 2026 },
      { age: 57, deferred: 105000, free: 0, uncovered: 0, year: 2027 },
    ]);
  });

  // 57 is reached in 2027, and a pension is drawable in every month of
  // that year rather than from a birthday the plan does not hold: the
  // £12,000 covers 2027's twelve months exactly, where 2026's twelve
  // went uncovered.
  it("draws a pension from the year the access age is reached", () => {
    expect(
      project([sipp], short, { ...plan, born: 1970, years: 2 }),
    ).toStrictEqual([
      { age: 56, deferred: 12000, free: 0, uncovered: 12000, year: 2026 },
      { age: 57, deferred: 12000, free: 0, uncovered: 0, year: 2027 },
      { age: 58, deferred: 0, free: 0, uncovered: 0, year: 2028 },
    ]);
  });

  // £400 of cash covers £400 of January and stops there rather than
  // going below nothing, so the ISA covers the £600 left of it and the
  // eleven whole months after, £11,600 in all: 20,000 − 11,600 = 8,400.
  it("draws an account to nothing and no lower, passing the rest to the next", () => {
    const thin: Account = { ...cash, balance: 400 };

    expect(
      project([thin, flatIsa], short, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 20000, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 8400, uncovered: 0, year: 2027 },
    ]);
  });

  // A month of tenths covers itself to the penny and leaves −5.55e-17
  // in binary, which is a month to draw savings for only if a shortfall
  // that small is one. The ISA holds fifty pence, the one balance where
  // a residue this far below a penny still shows in a figure rounded to
  // the pound: whole it rounds up to £1, and a picopound taken out of
  // it twelve times rounds down to nothing.
  it("draws nothing for a shortfall smaller than a nanopound", () => {
    const tenths = {
      expenses: [
        { ...household, amount: 0.1 },
        { ...household, amount: 0.2, id: 2 },
      ],
      income: [
        {
          ...salary,
          amount: 0.3,
          bonus: 0,
          cadence: "month",
          feeds: null,
          rsu: 0,
          sacrifice: 0,
        },
      ],
    } as const;

    expect(
      project([{ ...flatIsa, balance: 0.5 }], tenths, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 1, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 1, uncovered: 0, year: 2027 },
    ]);
  });

  // The £1,200 of cash covers January whole and £200 of February, so
  // 2026 goes short by 800 + 10 × 1,000 = 10,800 and 2027, with nothing
  // left anywhere, by all twelve of its £1,000. Each is reported on the
  // point whose balances open that year, and the last year is never
  // carried, so its point is short by nothing.
  it("reports what nothing covered on the point of the year it went short", () => {
    expect(project([pocket], short, { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 0, free: 0, uncovered: 10800, year: 2026 },
      { age: 37, deferred: 0, free: 0, uncovered: 12000, year: 2027 },
      { age: 38, deferred: 0, free: 0, uncovered: 0, year: 2028 },
    ]);
  });

  // £1 a year against nothing coming in is 8p a month, and a plan read
  // in September carries four of them: 33p, which rounded to nothing
  // and plotted a year that covered itself, with the chart's mark left
  // to whatever later year missed by more than fifty pence. A year
  // short by anything is short, so the point says £1.
  it("reports a year short by anything as short by a pound at least", () => {
    expect(
      project(
        [],
        {
          expenses: [{ ...household, amount: 1, cadence: "year" }],
          income: [],
        },
        { ...plan, month: 8, years: 1 },
      ),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 0, uncovered: 1, year: 2026 },
      { age: 37, deferred: 0, free: 0, uncovered: 0, year: 2027 },
    ]);
  });

  // Read in December, so one month is carried: the £1,000 leaves before
  // the month grows, so 10,000 − 1,000 = 9,000 grows at 1.05^(1/12) to
  // 9,036.67, and not the 10,040.74 − 1,000 = 9,040.74 that growing
  // first would leave.
  it("draws the month's shortfall out before the month grows", () => {
    const growing: Account = {
      ...flatIsa,
      balance: 10000,
      growth: { kind: "plan" },
    };

    expect(
      project([growing], short, { ...plan, month: 11, years: 1 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 10000, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 9037, uncovered: 0, year: 2027 },
    ]);
  });

  // A rate of minus one carries a balance to nothing in its first
  // month and leaves it there, on the account's own rate and on the
  // plan's alike; one below it takes the twelfth root of a negative, so
  // every balance after it and every figure the year went short by is
  // not a number and the year the money runs out is never marked. A
  // rate that loses nine tenths of a balance a year is left to lose it,
  // 20,000 × 0.1 = 2,000.
  it("refuses a rate that loses more than everything, on either side", () => {
    const rate = (fixed: number): Account => ({
      ...flatIsa,
      growth: { kind: "fixed", rate: fixed },
    });

    expect(
      project([rate(-1)], funded, { ...plan, years: 1 }).at(-1),
    ).toStrictEqual({
      age: 37,
      deferred: 0,
      free: 0,
      uncovered: 0,
      year: 2027,
    });
    expect(
      project([isa], funded, { ...plan, rate: -1, years: 1 }).at(-1)?.free,
    ).toBe(0);
    expect(() => project([rate(-1.5)], funded, { ...plan, years: 1 })).toThrow(
      "A rate loses no more than everything",
    );
    expect(() =>
      project([isa], funded, { ...plan, rate: -1.5, years: 1 }),
    ).toThrow("A rate loses no more than everything");
    expect(
      project([rate(-0.9)], funded, { ...plan, years: 1 }).at(-1),
    ).toStrictEqual({
      age: 37,
      deferred: 0,
      free: 2000,
      uncovered: 0,
      year: 2027,
    });
  });

  it("projects nothing when no account is a wrapper", () => {
    expect(
      project([home, mortgage], funded, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 0, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, free: 0, uncovered: 0, year: 2027 },
    ]);
  });

  it("holds only today's balances over no years", () => {
    expect(
      project([pension, isa], funded, { ...plan, years: 0 }),
    ).toStrictEqual([
      { age: 36, deferred: 412880, free: 286145, uncovered: 0, year: 2026 },
    ]);
  });
});

describe("endYear", () => {
  it("names the last year the plan runs to, which is the last year plotted", () => {
    const [, , last] = project([], funded, { ...plan, years: 2 });

    expect(endYear({ ...plan, years: 2 })).toBe(2028);
    expect(last?.year).toBe(endYear({ ...plan, years: 2 }));
  });
});
