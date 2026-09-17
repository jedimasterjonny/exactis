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
const plan = { born: 1992, from: 2026, month: 0, rate: 0.05 };

// No lines at all, so there is no spare money and every account is paid
// its fixed sum alone.
const nothing = { expenses: [], income: [] };

// The salary against the household, which leaves £8,650 a month in
// 2026, and the salary alone from 2052, when the household ends.
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
  // then growing at m = 1.05^(1/12) for the months it is in: 271,930 ×
  // 1.05 + 1,666.67 × m(m¹² − 1)/(m − 1) = 285,526.50 + 20,537.63 =
  // 306,064.13, then the same again on that: 341,904.96. The pension
  // the same way with £2,376 a month: 437,707.52, then 486,151.06.
  // The current account, the home and the mortgage are no wrapper and
  // are left out.
  it("pays a year's sum in a twelfth at a time, each month grown at the plan rate, by wrapper", () => {
    expect(project(accounts, nothing, { ...plan, years: 2 })).toStrictEqual([
      { age: 34, deferred: 391640, free: 271930, year: 2026 },
      { age: 35, deferred: 437708, free: 306064, year: 2027 },
      { age: 36, deferred: 486151, free: 341905, year: 2028 },
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

    expect(project([monthly], nothing, { ...plan, years: 2 })).toStrictEqual([
      { age: 34, deferred: 0, free: 1000, year: 2026 },
      { age: 35, deferred: 0, free: 2200, year: 2027 },
      { age: 36, deferred: 0, free: 3400, year: 2028 },
    ]);
  });

  // 306,064.13 from the ISA and 10,000 × 1.02 = 10,200 from an account
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
      project([isa, lifetime], nothing, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 34, deferred: 0, free: 281930, year: 2026 },
      { age: 35, deferred: 0, free: 316264, year: 2027 },
    ]);
  });

  // £8,650 a month is left, of which the ISA takes £1,666.67, a twelfth
  // of its £20,000 allowance, so a year adds £20,000: 291,930, then
  // 311,930.
  it("pays a spare-money account its take of the year's cash flow, every month", () => {
    expect(project([spareIsa], schedule, { ...plan, years: 2 })).toStrictEqual([
      { age: 34, deferred: 0, free: 271930, year: 2026 },
      { age: 35, deferred: 0, free: 291930, year: 2027 },
      { age: 36, deferred: 0, free: 311930, year: 2028 },
    ]);
  });

  // The mortgage's £2,180 a month and the pension's £28,512 a year come
  // out of the month before the spare money does, leaving £4,204.92, and
  // the current account, listed first and uncapped, takes all of it,
  // so the ISA is paid nothing; the pension is still paid its sum, a
  // twelfth a month.
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

    expect(a?.free).toBe(271930);
    expect(b?.free).toBe(271930);
    expect(a?.deferred).toBe(437708);
  });

  // Two ISAs that share an id, which the store never hands out, are
  // each paid their own take and not each other's: £8,650 is left,
  // each takes £1,666.67, and each is £20,000 up on the year.
  it("pays each account its own take, whatever its id", () => {
    const twin: Account = { ...spareIsa, name: "Twin ISA" };
    const [, after] = project([spareIsa, twin], schedule, {
      ...plan,
      years: 1,
    });

    expect(after?.free).toBe(2 * 271930 + 2 * 20000);
  });

  // The household ends in 2051, so from 2052 the whole salary is spare,
  // and the ISA still takes no more than its allowance.
  it("reads each year's cash flow afresh", () => {
    const points = project([spareIsa], schedule, { ...plan, years: 27 });
    const [first, second] = points;
    const last = points.at(-1);

    expect(second?.free).toBe((first?.free ?? 0) + 20000);
    expect(last?.year).toBe(2053);
    expect(last?.free).toBe(271930 + 23 * 20000);
  });

  // Read in September, the first year has four months to run: £1,666.67
  // in each is £6,666.67, then a whole year's £20,000 on top.
  it("carries the first year from the month the plan is read in", () => {
    expect(
      project([spareIsa], schedule, { ...plan, month: 8, years: 2 }),
    ).toStrictEqual([
      { age: 34, deferred: 0, free: 271930, year: 2026 },
      { age: 35, deferred: 0, free: 278597, year: 2027 },
      { age: 36, deferred: 0, free: 298597, year: 2028 },
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
      { age: 34, deferred: 0, free: 271930, year: 2026 },
      { age: 35, deferred: 0, free: 271930, year: 2027 },
    ]);
  });

  it("projects nothing when no account is a wrapper", () => {
    expect(
      project([home, mortgage], nothing, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 34, deferred: 0, free: 0, year: 2026 },
      { age: 35, deferred: 0, free: 0, year: 2027 },
    ]);
  });

  it("holds only today's balances over no years", () => {
    expect(
      project([pension, isa], nothing, { ...plan, years: 0 }),
    ).toStrictEqual([{ age: 34, deferred: 391640, free: 271930, year: 2026 }]);
  });
});

describe("endYear", () => {
  it("names the last year the plan runs to, which is the last year plotted", () => {
    const [, , last] = project([], nothing, { ...plan, years: 2 });

    expect(endYear({ ...plan, years: 2 })).toBe(2028);
    expect(last?.year).toBe(endYear({ ...plan, years: 2 }));
  });
});
