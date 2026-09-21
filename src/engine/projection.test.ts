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
      { age: 36, deferred: 412880, free: 286145, year: 2026 },
      { age: 37, deferred: 461450, free: 320990, year: 2027 },
      { age: 38, deferred: 512449, free: 357577, year: 2028 },
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
      { age: 36, deferred: 0, free: 1000, year: 2026 },
      { age: 37, deferred: 0, free: 2200, year: 2027 },
      { age: 38, deferred: 0, free: 3400, year: 2028 },
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
      { age: 36, deferred: 0, free: 296145, year: 2026 },
      { age: 37, deferred: 0, free: 331190, year: 2027 },
    ]);
  });

  // £8,750 a month is left, of which the ISA takes £1,666.67, a twelfth
  // of its £20,000 allowance, so a year adds £20,000: 306,145, then
  // 326,145.
  it("pays a spare-money account its take of the year's cash flow, every month", () => {
    expect(project([spareIsa], schedule, { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 0, free: 286145, year: 2026 },
      { age: 37, deferred: 0, free: 306145, year: 2027 },
      { age: 38, deferred: 0, free: 326145, year: 2028 },
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
      { age: 36, deferred: 0, free: 0, year: 2026 },
      { age: 37, deferred: 13800, free: 0, year: 2027 },
      { age: 38, deferred: 27600, free: 0, year: 2028 },
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
      { age: 36, deferred: 0, free: 286145, year: 2026 },
      { age: 37, deferred: 0, free: 391145, year: 2027 },
      { age: 38, deferred: 0, free: 527645, year: 2028 },
    ]);
  });

  // Read in September, the first year has four months to run: £1,666.67
  // in each is £6,666.67, then a whole year's £20,000 on top.
  it("carries the first year from the month the plan is read in", () => {
    expect(
      project([spareIsa], schedule, { ...plan, month: 8, years: 2 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 286145, year: 2026 },
      { age: 37, deferred: 0, free: 292812, year: 2027 },
      { age: 38, deferred: 0, free: 312812, year: 2028 },
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
      { age: 36, deferred: 0, free: 286145, year: 2026 },
      { age: 37, deferred: 0, free: 286145, year: 2027 },
    ]);
  });

  it("projects nothing when no account is a wrapper", () => {
    expect(
      project([home, mortgage], funded, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 0, year: 2026 },
      { age: 37, deferred: 0, free: 0, year: 2027 },
    ]);
  });

  it("holds only today's balances over no years", () => {
    expect(
      project([pension, isa], funded, { ...plan, years: 0 }),
    ).toStrictEqual([{ age: 36, deferred: 412880, free: 286145, year: 2026 }]);
  });
});

describe("endYear", () => {
  it("names the last year the plan runs to, which is the last year plotted", () => {
    const [, , last] = project([], funded, { ...plan, years: 2 });

    expect(endYear({ ...plan, years: 2 })).toBe(2028);
    expect(last?.year).toBe(endYear({ ...plan, years: 2 }));
  });
});
