import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";

import { endYear, project } from "./projection";

const [pension, isa, cash, home, mortgage] = accounts;
const [salary] = incomeLines;
const [household] = expenseLines;

const plan = { born: 1990, from: 2026, rate: 0.05 };

// No lines at all, so there is no spare money and every account is paid
// its fixed sum alone.
const nothing = { expenses: [], income: [] };

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
  // The ISA: (286,145 + 20,000) × 1.05 = 321,452.25, then (321,452.25 +
  // 20,000) × 1.05 = 358,524.86, the year's contribution landing first
  // and then the year's growth. The pension the same way: (412,880 +
  // 27,195) × 1.05 = 462,078.75, then (462,078.75 + 27,195) × 1.05 =
  // 513,737.44. The current account, the home and the mortgage are no
  // wrapper and are left out.
  it("pays a year's contribution in, then grows the year at the plan rate, by wrapper", () => {
    expect(project(accounts, nothing, { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 412880, free: 286145, year: 2026 },
      { age: 37, deferred: 462079, free: 321452, year: 2027 },
      { age: 38, deferred: 513737, free: 358525, year: 2028 },
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
      { age: 36, deferred: 0, free: 1000, year: 2026 },
      { age: 37, deferred: 0, free: 2200, year: 2027 },
      { age: 38, deferred: 0, free: 3400, year: 2028 },
    ]);
  });

  // 321,452.25 from the ISA and 10,000 × 1.02 = 10,200 from an account
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
      { age: 36, deferred: 0, free: 296145, year: 2026 },
      { age: 37, deferred: 0, free: 331652, year: 2027 },
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

  // The mortgage's £2,210 a month and the pension's £27,195 a year come
  // out of the month before the spare money does, leaving £4,273.42, and
  // the current account, listed first and uncapped, takes all of it,
  // so the ISA is paid nothing; the pension is still paid its sum.
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
    expect(a?.deferred).toBe(462079);
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

  it("projects nothing when no account is a wrapper", () => {
    expect(
      project([home, mortgage], nothing, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, free: 0, year: 2026 },
      { age: 37, deferred: 0, free: 0, year: 2027 },
    ]);
  });

  it("holds only today's balances over no years", () => {
    expect(
      project([pension, isa], nothing, { ...plan, years: 0 }),
    ).toStrictEqual([{ age: 36, deferred: 412880, free: 286145, year: 2026 }]);
  });
});

describe("endYear", () => {
  it("names the last year the plan runs to, which is the last year plotted", () => {
    const [, , last] = project([], nothing, { ...plan, years: 2 });

    expect(endYear({ ...plan, years: 2 })).toBe(2028);
    expect(last?.year).toBe(endYear({ ...plan, years: 2 }));
  });
});
