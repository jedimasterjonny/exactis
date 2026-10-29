// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Drawdown, Plan } from "@/data/plan";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { atAge, retiringAt, timed } from "@/data/milestones";
import { sam, working } from "@/data/owners.fixture";
import { endYear } from "@/data/plan";
import { statePensionLines } from "@/data/state-pension";
import { drawFor, drawOf, lumpSumAllowance } from "@/lib/tax";

import type { Schedule } from "./cash-flow";
import type { ProjectionPoint, Run } from "./projection";

import { cashFlow } from "./cash-flow";
import {
  balanceIn,
  holdsAnything,
  isShort,
  laidOut,
  measuredOf,
  monthsOn,
  movedIn,
  movedYears,
  project,
  retirementIn,
  worthsIn,
} from "./projection";

const [pension, isa, cash, home, mortgage] = accounts;
// The fixture's salary fixed in nominal terms, so it pays what it states
// in every month whatever prices do and every figure below is one it
// states; how a line grows is read on its own.
const salary: IncomeLine = { ...incomeLines[0], growth: "nominal" };
const [, , consulting] = incomeLines;
const [household] = expenseLines;

// Read at the start of its first year, so every year is carried whole,
// and retiring past the end of any plan here, so a salary runs as long
// as its line says.
const plan = {
  born: 1992,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working],
  rate: 0.05,
  retires: 92,
};

// The plan for an owner born in the year given, written on the plan and
// on the owner as the store writes both, so a test run past the pension
// age moves the pension's owner there with it.
function bornIn(born: number): Omit<Plan, "years"> {
  return { ...plan, born, owners: [{ ...working, born }] };
}

// A point as the projection plots it from the plan above, aged by its
// birth year and holding nothing in either wrapper, drawn early or
// uncovered unless it says so. A test run on another birth year passes
// the age it reads.
function point(
  year: number,
  balances: ProjectionPoint["balances"],
  rest: Partial<ProjectionPoint> = {},
): ProjectionPoint {
  return {
    age: year - plan.born,
    allowances: { [working.id]: lumpSumAllowance },
    balances,
    deferred: 0,
    early: 0,
    free: 0,
    uncovered: 0,
    year,
    ...rest,
  };
}

// Nothing going out and one line coming in wide enough to cover every
// fixed sum these tests pay, £6,346.45 a month once its tax is paid,
// feeding no pension and sacrificing nothing, since a fixed sum is paid
// only out of what the month has: no account here takes the spare
// money, so each is paid its fixed sum whole and what the month does
// not use simply stays.
const funded = {
  expenses: [],
  income: [
    { ...salary, amount: 120000, bonus: 0, feeds: null, rsu: 0, sacrifice: 0 },
  ],
};

// The salary against the household. The pension it feeds is not among
// the accounts these tests hold, so it is earned whole, £7,342.20 a
// month after £4,250.25 of income tax and £407.55 of NI, which leaves
// £3,992.20 a month in 2026, and all of it from 2052, when the
// household ends.
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
  owner: 1,
};

const sipp: Account = {
  balance: 12000,
  growth: { kind: "fixed", rate: 0 },
  id: 7,
  kind: "tax-deferred",
  name: "SIPP",
  owner: 1,
};

describe("project", () => {
  // The ISA's £20,000 a year lands as £1,666.67 a month, each month's
  // then growing at m = 1.05^(1/12) for the months it is in: 271,930 ×
  // 1.05 + 1,666.67 × m(m¹² − 1)/(m − 1) = 285,526.50 + 20,537.63 =
  // 306,064.13, then the same again on that: 341,904.96. The pension
  // the same way with its £2,376 a month and the basic rate claimed
  // back on it, £2,970: 447,820.06, then 506,809.11.
  // The current account is no wrapper, and is carried on its own at the
  // £16,900 it holds, paid nothing and at no growth; the home at its own
  // 2.1%, 397,512 × 1.021 = 405,859.75, then 414,382.81; and the
  // mortgage paid down by its £2,180 a month, each month charged a
  // twelfth of its 4.85% on what it owes before the payment comes off:
  // 158,524.70 owed after a year, then 139,636.95.
  it("pays a year's sum in a twelfth at a time, each month grown at the plan rate, by wrapper", () => {
    expect(project(accounts, funded, { ...plan, years: 2 })).toStrictEqual([
      point(
        2026,
        { 2: 271930, 3: 16900, 4: 397512, 5: -176520, 6: 391640 },
        { deferred: 391640, free: 271930 },
      ),
      point(
        2027,
        { 2: 306064, 3: 16900, 4: 405860, 5: -158525, 6: 447820 },
        { deferred: 447820, free: 306064 },
      ),
      point(
        2028,
        { 2: 341905, 3: 16900, 4: 414383, 5: -139637, 6: 506809 },
        { deferred: 506809, free: 341905 },
      ),
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
      owner: 1,
    };

    expect(project([monthly], funded, { ...plan, years: 2 })).toStrictEqual([
      point(2026, { 6: 1000 }, { free: 1000 }),
      point(2027, { 6: 2200 }, { free: 2200 }),
      point(2028, { 6: 3400 }, { free: 3400 }),
    ]);
  });

  // A car losing 15% a year is worth 20,000 × 0.85 = 17,000 after one,
  // and is never drawn on: the £1,200 of cash covers January and £200
  // of February, and the other £10,800 goes uncovered rather than out
  // of the car. An extension paid £100 a month out of a month that has
  // it, at no growth, is 1,000 + 12 × 100 = 2,200.
  it("carries an asset at its own rate, paid what the flow pays it, and never draws on it", () => {
    const car: Account = {
      balance: 20000,
      growth: { kind: "fixed", rate: -0.15 },
      id: 8,
      kind: "car",
      name: "Car",
    };
    const extension: Account = {
      balance: 1000,
      contribution: { amount: 100, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0 },
      id: 9,
      kind: "real-asset",
      name: "Extension",
    };

    expect(
      project([pocket, car], short, { ...plan, years: 1 }).map(
        ({ balances, uncovered }) => ({ balances, uncovered }),
      ),
    ).toStrictEqual([
      { balances: { 3: 1200, 8: 20000 }, uncovered: 10800 },
      { balances: { 3: 0, 8: 17000 }, uncovered: 0 },
    ]);
    expect(
      project([extension], funded, { ...plan, years: 1 }).at(-1)?.balances,
    ).toStrictEqual({ 9: 2200 });
  });

  // At 10% inflation a car halving each year is 10,000 after one, 9,091
  // of today's money, then reaches its floor of 8,000 and is held there
  // in today's money; a house growing 20% is 600,000 after one, 545,455,
  // then held at its ceiling of 550,000. One opening past its limit is
  // brought to it from the first year on.
  it("holds a house to its ceiling and a car to its floor, in today's money", () => {
    const car: Account = {
      balance: 20000,
      growth: { kind: "fixed", rate: -0.5 },
      id: 8,
      kind: "car",
      limit: 8000,
      name: "Car",
    };
    const house: Account = {
      balance: 500000,
      growth: { kind: "fixed", rate: 0.2 },
      id: 9,
      kind: "house",
      limit: 550000,
      name: "House",
    };

    expect(
      project(
        [
          car,
          house,
          { ...car, balance: 5000, id: 10 },
          { ...house, balance: 700000, id: 11 },
        ],
        { expenses: [], income: [] },
        { ...plan, inflation: 0.1, years: 3 },
      ).map(({ balances }) => balances),
    ).toStrictEqual([
      { 8: 20000, 9: 500000, 10: 5000, 11: 700000 },
      { 8: 9091, 9: 545455, 10: 8000, 11: 550000 },
      { 8: 8000, 9: 550000, 10: 8000, 11: 550000 },
      { 8: 8000, 9: 550000, 10: 8000, 11: 550000 },
    ]);
  });

  // 306,064.13 from the ISA and 10,000 × 1.02 = 10,200 from an account
  // with nothing paid in, each on the point by its id beside their sum.
  it("grows an account on a fixed rate at its own and sums the accounts", () => {
    const lifetime: Account = {
      balance: 10000,
      growth: { kind: "fixed", rate: 0.02 },
      id: 6,
      kind: "tax-free",
      name: "Lifetime ISA",
      owner: 1,
    };

    expect(
      project([isa, lifetime], funded, { ...plan, years: 1 }),
    ).toStrictEqual([
      point(2026, { 2: 271930, 6: 10000 }, { free: 281930 }),
      point(2027, { 2: 306064, 6: 10200 }, { free: 316264 }),
    ]);
  });

  // £3,992.20 a month is left, of which the ISA takes what its tax year
  // has left of the £20,000 allowance. The plan opens in January, the
  // nine months of the 2025 tax year before it taken to have used a
  // twelfth each, so January and February fill the £5,000 left; from
  // April each tax year takes all the month has until September fills
  // its £20,000, and January to March take nothing. 2026 adds £25,000
  // and 2027 £20,000: 296,930, then 316,930.
  it("pays a spare-money account its take of the year's cash flow, every month", () => {
    expect(project([spareIsa], schedule, { ...plan, years: 2 })).toStrictEqual([
      point(2026, { 2: 271930 }, { free: 271930 }),
      point(2027, { 2: 296930 }, { free: 296930 }),
      point(2028, { 2: 316930 }, { free: 316930 }),
    ]);
  });

  // The salary's £1,200 a month sacrificed, the tax on the rest and the
  // household leave £3,356.20, and the fixed sums come out of it before
  // the spare money does: the mortgage's £2,180 first and whole, being
  // owed, though it is listed last, and the pension, marked droppable,
  // the £1,176.20 left of its £2,376. The current account, listed
  // first and uncapped, would take whatever was left, and nothing is, so
  // the ISA is paid nothing either; the pension is paid what the month
  // had, which lands with the basic rate claimed back as £1,470.25, and
  // fed the £1,380 that lands with the NI saved on top: 446,344.
  it("reads the cash flow over every account, in the order they are listed", () => {
    const spareCash: Account = {
      ...cash,
      contribution: { cap: null, kind: "spare" },
    };
    const [, a, b] = project(
      [spareCash, spareIsa, { ...pension, isDroppable: true }, mortgage],
      schedule,
      { ...plan, years: 2 },
    );

    expect(a?.free).toBe(271930);
    expect(b?.free).toBe(271930);
    expect(a?.deferred).toBe(446344);
  });

  // £800 a month paid into a pension out of the month lands as £1,000,
  // the basic rate claimed back on it, so a year at no growth is £12,000
  // up; and the spare money into one to a £6,000 cap takes £400 a month,
  // which lands as the £500 its cap holds, £6,000 up. The ISA beside
  // them takes the same £800 a month and holds what it is paid.
  it("lands what a pension is paid out of the month with the basic rate claimed back", () => {
    const paying: Account = {
      ...sipp,
      balance: 0,
      contribution: { amount: 800, cadence: "month", kind: "fixed" },
    };
    const spare: Account = {
      ...sipp,
      balance: 0,
      contribution: { cap: 6000, kind: "spare" },
      id: 8,
    };
    const saving: Account = {
      ...flatIsa,
      balance: 0,
      contribution: { amount: 800, cadence: "month", kind: "fixed" },
    };

    expect(
      project([paying, saving], funded, { ...plan, years: 1 }).at(-1),
    ).toStrictEqual(
      point(2027, { 6: 9600, 7: 12000 }, { deferred: 12000, free: 9600 }),
    );
    expect(
      project([spare], funded, { ...plan, years: 1 }).at(-1)?.deferred,
    ).toBe(6000);
  });

  // A pension paid nothing of its own and fed the salary's £1,200 a
  // month, at no growth, is £16,560 up on the year: the sacrifice with
  // the employer's fifteen per cent NI saved on it.
  it("pays a salary's sacrifice into the pension it feeds, with the NI saved", () => {
    const fed: Account = {
      balance: 0,
      growth: { kind: "fixed", rate: 0 },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };

    expect(
      project([fed], { expenses: [], income: [salary] }, { ...plan, years: 2 }),
    ).toStrictEqual([
      point(2026, { 6: 0 }),
      point(2027, { 6: 16560 }, { deferred: 16560 }),
      point(2028, { 6: 33120 }, { deferred: 33120 }),
    ]);
  });

  // The same salary matched to six per cent of its base lands the
  // employer's £7,200 a year beside the £16,560, so the pension is
  // £23,760 up on the year, while the salary itself is paid and taxed
  // as it was.
  it("pays the employer's match into the pension with the sacrifice", () => {
    const fed: Account = {
      balance: 0,
      growth: { kind: "fixed", rate: 0 },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };

    expect(
      project(
        [fed],
        { expenses: [], income: [{ ...salary, match: 0.06 }] },
        { ...plan, years: 1 },
      ),
    ).toStrictEqual([
      point(2026, { 6: 0 }),
      point(2027, { 6: 23760 }, { deferred: 23760 }),
    ]);
  });

  // A pension is never fed in a month it could be drawn on. £5,000 a
  // month is £3,431.78 after the sacrifice and the tax on the rest, and
  // against £4,000 of spending does not cover itself, so the £600 the
  // salary would have sacrificed is earned and spent instead, the SIPP
  // it feeds is fed nothing and stays at the nothing it opens with, and
  // the year is short by the £220.22 a month the whole income, £3,779.78
  // after its tax, does not cover, £2,642.60 over its twelve and so
  // £2,643. Born in 1960, so the SIPP is drawable in every month of the
  // year and has nothing to give.
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
        { expenses: [{ ...household, amount: 4000 }], income: [earner] },
        { ...bornIn(1960), years: 1 },
      ),
    ).toStrictEqual([
      point(2026, { 7: 0 }, { age: 66, uncovered: 2643 }),
      point(2027, { 7: 0 }, { age: 67 }),
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
      owner: 1,
    };

    expect(
      project(
        [fed],
        { expenses: [], income: [{ ...salary, lastYear: 2027 }] },
        { ...plan, years: 3 },
      ).map(({ deferred }) => deferred),
    ).toStrictEqual([0, 16560, 33120, 33120]);
  });

  // The same ISA listed again would open the plan holding £543,860 of
  // the £271,930 it has and be paid its take twice a month. The list
  // is refused before anything is plotted, over a carried year and
  // over no years at all, where no month is read and the flow would
  // never see it.
  it("refuses an account listed twice, carried or not", () => {
    const twin: Account = { ...spareIsa, name: "Twin ISA" };

    for (const held of [
      [spareIsa, spareIsa],
      [spareIsa, twin],
    ]) {
      expect(() => project(held, schedule, { ...plan, years: 1 })).toThrow(
        "An account is listed once",
      );
    }
    expect(() =>
      project([spareIsa, twin], schedule, { ...plan, years: 0 }),
    ).toThrow("An account is listed once");
    expect(() =>
      project([spareIsa, { ...flatIsa, id: 20 }], schedule, {
        ...plan,
        years: 1,
      }),
    ).not.toThrow();
  });

  // A debt owes what it holds below nothing: the mortgage at £500 above
  // it would plot as money held and be wiped off by its first payment.
  // One owing nothing is carried at nothing.
  it("refuses a debt above nothing", () => {
    expect(() =>
      project([{ ...mortgage, balance: 500 }], funded, { ...plan, years: 1 }),
    ).toThrow("A debt's balance is nothing or less");
    expect(() =>
      project([{ ...mortgage, balance: 0 }], funded, { ...plan, years: 0 }),
    ).not.toThrow();
  });

  // A balance below nothing is a debt's, and no debt is held: the ISA
  // at minus £500 would be compounded deeper every month and never
  // drawn on, since a draw takes the lesser of what an account holds
  // and what the month is short and stops at nothing, so it would
  // cover none of a month it was short and plot a wrapper owing money,
  // and a home at minus £500 would be worth less than nothing. A
  // balance of nothing is carried as it stands, and the mortgage,
  // owing £176,520, is owed rather than held, and is paid down.
  it("refuses a held account below nothing", () => {
    expect(() =>
      project([{ ...flatIsa, balance: -500 }], funded, { ...plan, years: 1 }),
    ).toThrow("A balance below nothing is a debt's");
    expect(() =>
      project([{ ...home, balance: -500 }], funded, { ...plan, years: 1 }),
    ).toThrow("A balance below nothing is a debt's");
    expect(
      project([{ ...flatIsa, balance: 0 }, mortgage], funded, {
        ...plan,
        years: 1,
      }),
    ).toStrictEqual([
      point(2026, { 5: -176520, 6: 0 }),
      point(2027, { 5: -158525, 6: 0 }),
    ]);
  });

  // The household ends in 2051, so from 2052 the whole salary is spare,
  // and the ISA still takes no more than its allowance: £20,000 a tax
  // year, and the £5,000 left of the one the plan opens in.
  it("reads each year's cash flow afresh", () => {
    const points = project([spareIsa], schedule, { ...plan, years: 27 });
    const [first, second] = points;
    const last = points.at(-1);

    expect(second?.free).toBe((first?.free ?? 0) + 25000);
    expect(last?.year).toBe(2053);
    expect(last?.free).toBe(271930 + 5000 + 27 * 20000);
  });

  // A salary of £20,000 leaves £1,493.30 a month after £123.83 of
  // income tax and £49.53 of NI, under the ISA's £1,666.67 a month. A
  // £1,000 household ending in March 2027 leaves £493.30 of it in each
  // of 2026's twelve months and 2027's first three, and the whole
  // £1,493.30 in the nine after: 5,919.60 on the year, then 1,479.90 +
  // 13,439.70.
  it("pays a line to the month it ends in, reading each month's flow afresh", () => {
    const earner = {
      ...salary,
      amount: 20000,
      bonus: 0,
      feeds: null,
      rsu: 0,
      sacrifice: 0,
    };
    const ending = { ...household, amount: 1000, lastMonth: 2, lastYear: 2027 };

    expect(
      project(
        [spareIsa],
        { expenses: [ending], income: [earner] },
        { ...plan, years: 2 },
      ),
    ).toStrictEqual([
      point(2026, { 2: 271930 }, { free: 271930 }),
      point(2027, { 2: 277850 }, { free: 277850 }),
      point(2028, { 2: 292769 }, { free: 292769 }),
    ]);
  });

  // Read in September, the first year has four months to run, and the
  // five of its tax year before it are taken to have used a twelfth of
  // the ISA's allowance each, leaving £11,666.67, which the four fill;
  // 2027's January to March take nothing more, and its April a whole
  // tax year's £20,000 on top.
  it("carries the first year from the month the plan is read in", () => {
    expect(
      project([spareIsa], schedule, { ...plan, month: 8, years: 2 }),
    ).toStrictEqual([
      point(2026, { 2: 271930 }, { free: 271930 }),
      point(2027, { 2: 283597 }, { free: 283597 }),
      point(2028, { 2: 303597 }, { free: 303597 }),
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
      point(2026, { 2: 271930 }, { free: 271930 }),
      point(2027, { 2: 271930 }, { free: 271930 }),
    ]);
  });

  // A £5,000 card at 22% paying £250 a month clears with its 26th
  // payment, February 2028, and the ISA beside it takes whatever the
  // month leaves of the £2,453.30 the salary pays after its tax and the
  // £1,000 going out, which is under its £1,666.67 a month. 2026 pays
  // the card twelve times, so the ISA takes 12 × £1,203.30 =
  // £14,439.60; 2027 the same, £28,879.20; 2028 pays it twice and the
  // ISA takes £1,203.30 in January, £1,453.30 less the £35.72 that
  // clears the card in February, and then ten whole months of
  // £1,453.30, £46,033.08. Charged for every month of the plan instead,
  // as it was, the card would take £250 a month for ever and the ISA
  // would be held to £1,203.30 a month in every year after the debt was
  // gone. The card owes £2,896.21 after its twelfth payment, £279.95
  // after its twenty-fourth and £35.08 after its twenty-fifth, so its
  // twenty-sixth is the £35.72 that with the month's interest clears
  // it, rather than £250 with £214.28 of it paid into nothing.
  it("charges a debt's fixed sum only to the month its payments clear it", () => {
    const card: Account = {
      balance: -5000,
      contribution: { amount: 250, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0.22 },
      id: 8,
      kind: "debt",
      name: "Credit card",
    };
    const earned = {
      expenses: [{ ...household, amount: 1000 }],
      income: [
        {
          ...salary,
          amount: 36000,
          bonus: 0,
          feeds: null,
          rsu: 0,
          sacrifice: 0,
        },
      ],
    };
    const saving: Account = { ...spareIsa, balance: 0 };

    const points = project([card, saving], earned, { ...plan, years: 3 });

    expect(points.map(({ free }) => free)).toStrictEqual([
      0, 14440, 28879, 46033,
    ]);
    expect(points.map(({ balances }) => balances[card.id])).toStrictEqual([
      -5000, -2896, -280, 0,
    ]);
  });

  // A £2,400 loan at no interest paid by a line of £300 a month, and
  // not by the £100 a month it states, since the line pays in its
  // place. Read in September, 2026 pays four of them, £1,200; 2027
  // pays the last four by April, and the line runs on through the
  // year, so the loan owes nothing rather than being owed £2,400.
  it("pays a debt down by the line paying it, and no further than nothing", () => {
    const loan: Account = {
      balance: -2400,
      contribution: { amount: 100, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0 },
      id: 8,
      kind: "debt",
      name: "Loan",
    };
    const paying = {
      ...household,
      amount: 300,
      id: 9,
      lastYear: null,
      pays: loan.id,
    };

    expect(
      project(
        [loan],
        { expenses: [paying], income: funded.income },
        { ...plan, month: 8, years: 2 },
      ).map(({ balances }) => balances),
    ).toStrictEqual([{ 8: -2400 }, { 8: -1200 }, { 8: 0 }]);
  });

  // A PCP owing £10,000 with a £4,000 balloon at no interest, paying
  // £500 a month, is paid down to the balloon over 2026 and then paid
  // nothing, so it owes the £4,000 for the rest of the plan. A £1,000
  // debt at 10% that nothing pays is charged nothing and owes its
  // £1,000 throughout.
  it("holds a balloon where the payments leave it, and a debt nothing pays where it opened", () => {
    const pcp: Account = {
      balance: -10000,
      balloon: 4000,
      contribution: { amount: 500, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0 },
      id: 8,
      kind: "debt",
      name: "PCP",
    };
    const owed: Account = {
      balance: -1000,
      growth: { kind: "fixed", rate: 0.1 },
      id: 9,
      kind: "debt",
      name: "Family loan",
    };

    expect(
      project([pcp, owed], funded, { ...plan, years: 2 }).map(
        ({ balances }) => balances,
      ),
    ).toStrictEqual([
      { 8: -10000, 9: -1000 },
      { 8: -4000, 9: -1000 },
      { 8: -4000, 9: -1000 },
    ]);
  });

  // Read in December, so 2026 carries one month: the £1,000 going out
  // comes from the £1,200 of cash and the ISA is left whole, which is
  // why 2027 enters on the same £20,000. 2027 carries twelve: the £200
  // of cash left covers a fifth of January and the ISA the £800 after
  // it, then the eleven months of £1,000 each, £11,800 in all, so
  // 20,000 − 11,800 = 8,200. Cash is carried and drawn from, and is on
  // each point by its id, though in no wrapper's sum.
  it("draws a shortfall from cash before the ISA, and from the ISA once cash is empty", () => {
    expect(
      project([pocket, flatIsa], short, { ...plan, month: 11, years: 2 }),
    ).toStrictEqual([
      point(2026, { 3: 1200, 6: 20000 }, { free: 20000 }),
      point(2027, { 3: 200, 6: 20000 }, { free: 20000 }),
      point(2028, { 3: 0, 6: 8200 }, { free: 8200 }),
    ]);
  });

  // The same month with a £3,000 GIA beside them, listed first: the
  // cash still goes first, leaving £200 for January, and the GIA then
  // gives up January's other £800, February's £1,000 and March's, and
  // the last £200 of it to April, before the ISA is touched. The ISA
  // gives April's other £800 and the eight months after it, £8,800, so
  // 20,000 − 8,800 = 11,200. The GIA is on each point by its id, in no
  // wrapper's sum.
  it("draws a GIA after cash and before the ISA, whatever order they are listed in", () => {
    const gia: Account = {
      balance: 3000,
      growth: { kind: "fixed", rate: 0 },
      id: 10,
      kind: "taxable",
      name: "GIA",
    };

    expect(
      project([gia, flatIsa, pocket], short, { ...plan, month: 11, years: 2 }),
    ).toStrictEqual([
      point(2026, { 3: 1200, 6: 20000, 10: 3000 }, { free: 20000 }),
      point(2027, { 3: 200, 6: 20000, 10: 3000 }, { free: 20000 }),
      point(2028, { 3: 0, 6: 11200, 10: 0 }, { free: 11200 }),
    ]);
  });

  // Nothing coming in and nothing spent, and a SIPP kept paid at £800
  // a month: the £1,200 of cash and the £2,000 ISA keep it paid
  // for four months, each landing as £860, since with no earnings only
  // £240 of it is relieved, and then it is paid nothing, since the only
  // savings left are pensions. The old pension beside it is never drawn
  // on, so nothing is drawn early and nothing goes uncovered.
  it("keeps a pension paid out of cash and the ISA, and never out of a pension", () => {
    const kept: Account = {
      ...sipp,
      contribution: { amount: 800, cadence: "month", kind: "fixed" },
    };
    const old: Account = { ...sipp, balance: 50000, id: 9, name: "Old SIPP" };

    expect(
      project(
        [pocket, { ...flatIsa, balance: 2000 }, kept, old],
        { expenses: [], income: [] },
        { ...plan, years: 1 },
      ),
    ).toStrictEqual([
      point(
        2026,
        { 3: 1200, 6: 2000, 7: 12000, 9: 50000 },
        { deferred: 62000, free: 2000 },
      ),
      point(2027, { 3: 0, 6: 0, 7: 15440, 9: 50000 }, { deferred: 65440 }),
    ]);
  });

  // Nothing coming in, and a £2,000 loan at no interest paid £500 a
  // month, so it clears in April: the four payments are owed, so each
  // is drawn from the ISA as an expense would be, £2,000 in all, and
  // nothing after the loan clears, which owes nothing from then on.
  it("draws on the savings for a debt's payment the month cannot meet", () => {
    const loan: Account = {
      balance: -2000,
      contribution: { amount: 500, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0 },
      id: 8,
      kind: "debt",
      name: "Loan",
    };

    expect(
      project(
        [flatIsa, loan],
        { expenses: [], income: [] },
        { ...plan, years: 1 },
      ),
    ).toStrictEqual([
      point(2026, { 6: 20000, 8: -2000 }, { free: 20000 }),
      point(2027, { 6: 18000, 8: 0 }, { free: 18000 }),
    ]);
  });

  // Born in 1980, so 2026 is the year 46 is reached and a pension is
  // drawn only as the last resort. The £1,200 of cash covers January
  // and £200 of February, the £2,000 ISA the £800 left of February,
  // March and £200 of April, and only then is the SIPP drawn, for the
  // £800 left of April and eight whole months after it, £8,800, at 45p
  // kept of each pound: £19,555.56 out of the £30,000, which the point
  // reports as drawn early.
  it("draws a pension before the pension age only once cash and the ISA are empty, at the charge on taking it early", () => {
    expect(
      project(
        [{ ...sipp, balance: 30000 }, { ...flatIsa, balance: 2000 }, pocket],
        short,
        { ...bornIn(1980), years: 1 },
      ),
    ).toStrictEqual([
      point(
        2026,
        { 3: 1200, 6: 2000, 7: 30000 },
        { age: 46, deferred: 30000, early: 19556, free: 2000 },
      ),
      point(2027, { 3: 0, 6: 0, 7: 10444 }, { age: 47, deferred: 10444 }),
    ]);
  });

  // Born in 1960, so the SIPP is drawn as income, and read in December,
  // so 2026 carries one month, £3,000 short. Drawing the savings first
  // takes the £1,200 of cash and £1,800 of the ISA and leaves the SIPP
  // whole. Drawing the pension before the ISA takes the cash and grosses
  // the £1,800 left up to £1,871.18 out of the SIPP: £467.79 free and
  // £1,403.38 taxed, the £355.88 of it past a twelfth of the personal
  // allowance at 20%. Drawing the pension first grosses the whole £3,000
  // up to £3,282.94 and leaves the cash and the ISA whole.
  it("draws a shortfall in the order the plan's drawdown names", () => {
    const drawnUnder = (
      drawdown: Drawdown,
    ): ProjectionPoint["balances"] | undefined =>
      project(
        [pocket, flatIsa, { ...sipp, balance: 50000 }],
        { expenses: [{ ...household, amount: 3000 }], income: [] },
        { ...bornIn(1960), drawdown, month: 11, years: 1 },
      ).at(-1)?.balances;

    expect(drawnUnder("savings-first")).toStrictEqual({
      3: 0,
      6: 18200,
      7: 50000,
    });
    expect(drawnUnder("pension-before-isa")).toStrictEqual({
      3: 0,
      6: 20000,
      7: 48129,
    });
    expect(drawnUnder("pension-first")).toStrictEqual({
      3: 1200,
      6: 20000,
      7: 46717,
    });
  });

  // The same month drawing the pension before the ISA from a SIPP of
  // £500, which the cash leaves £1,800 short: the SIPP gives up all it
  // holds, taxed nothing, and the ISA the £1,300 that leaves.
  it("draws the ISA for what a pension drawn before it could not cover", () => {
    expect(
      project(
        [pocket, flatIsa, { ...sipp, balance: 500 }],
        { expenses: [{ ...household, amount: 3000 }], income: [] },
        {
          ...bornIn(1960),
          drawdown: "pension-before-isa",
          month: 11,
          years: 1,
        },
      ).at(-1)?.balances,
    ).toStrictEqual({ 3: 0, 6: 18700, 7: 0 });
  });

  // The pension drawn before the pension age above, with the plan
  // drawing the pension first: it is still drawn last, once the cash and
  // the ISA are empty, and at the charge, as under any drawdown.
  it("draws a pension before the pension age last whatever the drawdown", () => {
    expect(
      project(
        [{ ...sipp, balance: 30000 }, { ...flatIsa, balance: 2000 }, pocket],
        short,
        { ...bornIn(1980), drawdown: "pension-first", years: 1 },
      ),
    ).toStrictEqual([
      point(
        2026,
        { 3: 1200, 6: 2000, 7: 30000 },
        { age: 46, deferred: 30000, early: 19556, free: 2000 },
      ),
      point(2027, { 3: 0, 6: 0, 7: 10444 }, { age: 47, deferred: 10444 }),
    ]);
  });

  // In 2049 the first owner is 57 and Sam 54. Sam's SIPP is listed first,
  // but the first owner's is drawn as income for the whole year, £1,000
  // a month taxed nothing, and Sam's, which only an early draw could
  // reach, is left whole.
  it("draws a pension at its owner's pension age before one drawn early, whatever order they are listed in", () => {
    expect(
      project(
        [
          { ...sipp, balance: 50000, id: 8, owner: sam.id },
          { ...sipp, balance: 50000 },
        ],
        {
          expenses: [{ ...household, amount: 1000, lastYear: null }],
          income: [],
        },
        { ...plan, from: 2049, owners: [working, sam], years: 1 },
      ).map(({ balances, early }) => ({ balances, early })),
    ).toStrictEqual([
      { balances: { 7: 50000, 8: 50000 }, early: 0 },
      { balances: { 7: 38000, 8: 50000 }, early: 0 },
    ]);
  });

  // Born in 1960 and read in December, one month £800 short of its
  // spending with nothing coming in, and a SIPP kept paid £500, which
  // lands as £560 with the £60 a non-earner is relieved. The spending is
  // drawn first in the order the drawdown names, and what keeping the
  // SIPP paid adds to it after, out of the cash and then the ISA and
  // never out of a pension. Drawing the pension before the ISA, the cash
  // covers the £800 of spending, so the SIPP is not drawn, and the £200
  // of cash left and £300 of the ISA pay the £500.
  it("pays a pension kept paid out of the savings after the spending, never out of the pension drawn before the ISA", () => {
    expect(
      project(
        [
          { ...pocket, balance: 1000 },
          flatIsa,
          {
            ...sipp,
            balance: 50000,
            contribution: { amount: 500, cadence: "month", kind: "fixed" },
          },
        ],
        { expenses: [{ ...household, amount: 800 }], income: [] },
        {
          ...bornIn(1960),
          drawdown: "pension-before-isa",
          month: 11,
          years: 1,
        },
      ).at(-1)?.balances,
    ).toStrictEqual({ 3: 0, 6: 19700, 7: 50560 });
  });

  // The same month drawing the pension first: the SIPP gives up the £800
  // of spending, taxed nothing, a quarter of it free and the £600 left
  // under a twelfth of the personal allowance, and the £500 keeping it
  // paid comes out of the cash, so 50,000 − 800 + 560 = 49,760.
  it("pays a pension kept paid out of the savings while the pension drawn first pays the spending", () => {
    expect(
      project(
        [
          { ...pocket, balance: 1000 },
          flatIsa,
          {
            ...sipp,
            balance: 50000,
            contribution: { amount: 500, cadence: "month", kind: "fixed" },
          },
        ],
        { expenses: [{ ...household, amount: 800 }], income: [] },
        { ...bornIn(1960), drawdown: "pension-first", month: 11, years: 1 },
      ).at(-1)?.balances,
    ).toStrictEqual({ 3: 500, 6: 20000, 7: 49760 });
  });

  // Born in 1972, so 55 is reached in 2027, while the pension age is 55,
  // and a pension is drawn as income in every month of it: £1,000 is
  // taxed nothing, a quarter of it free and the £750 left under a
  // twelfth of the personal allowance, so twelve take £12,000. The age
  // rises to 57 in April 2028, when its owner is 56, so January to March
  // are drawn as income and the nine months after early, £2,222.22 each
  // and £20,000 in all, read to the penny rather than rounded up from
  // the residue of adding them. 2029 reaches 57 and is income again.
  // Each draw as income takes its £250 off the lump sum allowance, £3,000
  // over a year of them and £750 over 2028's three, and an early one
  // takes nothing.
  it("draws a pension as income from 55 until the pension age rises in April 2028, and from 57 after", () => {
    expect(
      project([{ ...sipp, balance: 100000 }], short, {
        ...bornIn(1972),
        from: 2027,
        years: 3,
      }),
    ).toStrictEqual([
      point(2027, { 7: 100000 }, { age: 55, deferred: 100000 }),
      point(
        2028,
        { 7: 88000 },
        {
          age: 56,
          allowances: { [working.id]: 265275 },
          deferred: 88000,
          early: 20000,
        },
      ),
      point(
        2029,
        { 7: 65000 },
        { age: 57, allowances: { [working.id]: 264525 }, deferred: 65000 },
      ),
      point(
        2030,
        { 7: 53000 },
        { age: 58, allowances: { [working.id]: 261525 }, deferred: 53000 },
      ),
    ]);
  });

  // Born in 1960, so the SIPP is drawable from the first month. £3,000
  // a month with nothing coming in grosses up to £3,282.94: the first
  // £1,396.67 is taxed nothing, its taxed three quarters inside a
  // twelfth of the personal allowance, and each pound after keeps 85p,
  // the basic rate taken off three quarters of it. Twelve of them are
  // £39,395.29, leaving 60,604.71, and a quarter of them, £9,848.82, is
  // taken off the lump sum allowance.
  it("grosses a pension draw up so what is left of it once taxed covers the month", () => {
    const drawn: Account = { ...sipp, balance: 100000 };

    expect(
      project(
        [drawn],
        { expenses: [{ ...household, amount: 3000 }], income: [] },
        { ...bornIn(1960), years: 1 },
      ),
    ).toStrictEqual([
      point(2026, { 7: 100000 }, { age: 66, deferred: 100000 }),
      point(
        2027,
        { 7: 60605 },
        { age: 67, allowances: { [working.id]: 258426 }, deferred: 60605 },
      ),
    ]);
  });

  // A pension of £12,570 a year fills the personal allowance, so the
  // £850 a month it leaves short is drawn at the basic rate: £1,000,
  // £250 of it free and £150 of tax on the other £750. Twelve of them
  // take £12,000 of the £20,000.
  it("taxes a draw on top of what the month earned", () => {
    const drawn: Account = { ...sipp, balance: 20000 };
    const pension = {
      ...salary,
      amount: 12570,
      bonus: 0,
      feeds: null,
      kind: "pension",
      rsu: 0,
      sacrifice: 0,
    } as const;

    expect(
      project(
        [drawn],
        {
          expenses: [{ ...household, amount: 12570 / 12 + 850 }],
          income: [pension],
        },
        { ...bornIn(1960), years: 1 },
      ).at(-1)?.deferred,
    ).toBe(8000);
  });

  // £2,800 a month grosses up to £3,047.65, and a SIPP holding twelve of
  // them, £36,571.76, covers the year to the last penny. Drawn a month
  // at a time it is left a residue of the order of a billionth of a
  // pound short, which rounded up whole marked the year short by £1 and
  // put the chart's mark on a year that covered itself.
  it("reports no shortfall in a year a pension covers exactly", () => {
    const { gross } = drawFor(2800, {
      allowance: lumpSumAllowance,
      below: 0,
      isEarly: false,
      months: 1,
      uprating: 1,
    });
    const exact: Account = {
      ...sipp,
      balance: Array.from({ length: 12 }, () => gross).reduce(
        (sum, month) => sum + month,
        0,
      ),
    };

    expect(
      project(
        [exact],
        { expenses: [{ ...household, amount: 2800 }], income: [] },
        { ...bornIn(1960), years: 1 },
      ).map(({ uncovered }) => uncovered),
    ).toStrictEqual([0, 0]);
  });

  // The lump sum allowance is the owner's for life. £100,000 a month
  // grosses up to £149,207.92 while a quarter of each draw is free,
  // which takes £37,301.98 of the £268,275 a month; seven months leave
  // £7,161.13 of it, which the eighth uses up, and every month after it
  // is taxed whole and draws £179,727.73. So 2026 draws £1,937,235 and
  // 2027, with nothing free in any month of it, twelve of the last,
  // £2,156,733.
  it("frees a quarter of each draw only until the lump sum allowance is used up, over the plan", () => {
    const drawn: Account = { ...sipp, balance: 5000000 };

    expect(
      project(
        [drawn],
        { expenses: [{ ...household, amount: 100000 }], income: [] },
        { ...bornIn(1960), years: 2 },
      ).map(({ deferred }) => deferred),
    ).toStrictEqual([5000000, 3062765, 906032]);
  });

  // Each owner has a lump sum allowance of their own, and a draw on their
  // pension is taxed on top of their own income. A pension of £100,000,
  // the first owner's, listed before one of £400,000 of Sam's, both
  // past the pension age, and £150,000 going out in January: the first
  // gives up all it holds, £25,000 of it free and £75,000 taxed, and
  // Sam's covers what that leaves under Sam's own whole allowance and
  // from the foot of Sam's own bands. Both the first owner's, the second
  // is drawn under what the first left of the one allowance and from
  // where its draw left the bands, and gives up more.
  it("draws each owner's pension under their own lump sum allowance, taxed on top of their own income", () => {
    const first: Account = { ...sipp, balance: 100000 };
    const second: Account = {
      ...sipp,
      balance: 400000,
      id: 8,
      name: "Sam's SIPP",
      owner: sam.id,
    };
    const standing = {
      allowance: lumpSumAllowance,
      below: 0,
      isEarly: false,
      months: 1,
      uprating: 1,
    };
    const emptied = drawOf(100000, standing);
    const own = drawFor(150000 - emptied.net, standing);
    const pooled = drawFor(150000 - emptied.net, {
      ...standing,
      allowance: lumpSumAllowance - emptied.taxFree,
      below: emptied.taxable,
    });
    const once = {
      expenses: [
        { ...household, amount: 150000, lastMonth: 0, lastYear: 2026 },
      ],
      income: [],
    };
    const shared = {
      ...bornIn(1960),
      owners: [
        { ...working, born: 1960 },
        { ...sam, born: 1963 },
      ],
      years: 1,
    };
    const drawnTo = (accounts: readonly Account[]): readonly number[] =>
      project(accounts, once, shared).map((point) =>
        balanceIn(point, second.id),
      );

    expect(own.gross).toBeLessThan(pooled.gross);
    expect(drawnTo([first, second])).toStrictEqual([
      400000,
      Math.round(400000 - own.gross),
    ]);
    expect(drawnTo([first, { ...second, owner: working.id }])).toStrictEqual([
      400000,
      Math.round(400000 - pooled.gross),
    ]);
  });

  // A £36,000 salary sacrificing half its base into the SIPP, £1,500 a
  // month landing as £1,725 with the NI saved, against £2,500 going out
  // in January alone. January is short either way, so nothing is
  // sacrificed and the month is taxed whole, £2,453.30 after £390.50 of
  // income tax and £156.20 of NI, and the £46.70 it is short is drawn
  // from the SIPP as income, since the owner, born in 1960, is past the
  // pension age: £54.94, each pound keeping 85p in the basic rate band
  // with a quarter of it free, £13.74 off the lump sum allowance. That
  // draw is a flexible access, so from February the owner's allowance
  // is the £10,000 money purchase one, held across the tax year: the
  // plan opens in January, the nine months of the 2025/26 tax year before
  // it taken to have used a twelfth each, so £2,500 is left, which
  // February's £1,725 is within and March's £950 past; from April the
  // year's £10,000 takes five months whole and £1,375 of September's,
  // and October to December land the whole £1,725 past it. A month is
  // taxed on the £1,500 it is paid and what lands past, at the basic
  // rate, and with £36.20 of NI leaves the ISA £1,373.30 where nothing
  // is past, £1,183.30 in March, £1,303.30 in September and £1,028.30 in
  // each of the last three, £13,811.30 over the eleven months, while the
  // SIPP is fed its £1,725 whatever the charge, 100,000 − 54.94 +
  // 18,975 = 118,920.06. The three months of the 2025/26 tax year each
  // sit in the basic rate band, so April settles nothing. With nothing
  // going out in January nothing is drawn, the allowance stays whole and
  // every month leaves the ISA £1,373.30, £16,479.60 on the year.
  it("holds an owner's pensions to the money purchase allowance from the month after they draw on one as income", () => {
    const earner = {
      ...salary,
      amount: 36000,
      bonus: 0,
      feeds: sipp.id,
      rsu: 0,
      sacrifice: 0.5,
    };
    const once = { ...household, amount: 2500, lastMonth: 0, lastYear: 2026 };
    const saving: Account = { ...spareIsa, balance: 0 };
    const drawn: Account = { ...sipp, balance: 100000 };
    const over = (expenses: (typeof once)[]): ProjectionPoint[] =>
      project(
        [saving, drawn],
        { expenses, income: [earner] },
        { ...bornIn(1960), years: 1 },
      );

    expect(over([once])).toStrictEqual([
      point(2026, { 2: 0, 7: 100000 }, { age: 66, deferred: 100000 }),
      point(
        2027,
        { 2: 13811, 7: 118920 },
        {
          age: 67,
          allowances: { [working.id]: 268261 },
          deferred: 118920,
          free: 13811,
        },
      ),
    ]);
    expect(over([]).at(-1)).toStrictEqual(
      point(
        2027,
        { 2: 16480, 7: 120700 },
        { age: 67, deferred: 120700, free: 16480 },
      ),
    );
  });

  // The same year for an owner born in 1980, for whom the January draw
  // is early: £103.78 at 45p kept of each pound, reported as drawn
  // early, and no flexible access, so the allowance stays whole and the
  // eleven months after leave the ISA £1,373.30 each, £15,106.30, with
  // the SIPP at 100,000 − 103.78 + 18,975 = 118,871.22.
  it("leaves the allowance whole after a draw before the pension age, which is no flexible access", () => {
    const earner = {
      ...salary,
      amount: 36000,
      bonus: 0,
      feeds: sipp.id,
      rsu: 0,
      sacrifice: 0.5,
    };
    const once = { ...household, amount: 2500, lastMonth: 0, lastYear: 2026 };

    expect(
      project(
        [
          { ...spareIsa, balance: 0 },
          { ...sipp, balance: 100000 },
        ],
        { expenses: [once], income: [earner] },
        { ...bornIn(1980), years: 1 },
      ),
    ).toStrictEqual([
      point(
        2026,
        { 2: 0, 7: 100000 },
        { age: 46, deferred: 100000, early: 104 },
      ),
      point(
        2027,
        { 2: 15106, 7: 118871 },
        { age: 47, deferred: 118871, free: 15106 },
      ),
    ]);
  });

  // Sam, born in 1995, reaches 57 in 2052, three years after the first
  // owner: from 2049 a pension of Sam's is drawn early, at the charge,
  // £2,222.22 for each £1,000 and £26,666.67 a year, for three years,
  // and as income from 2052, where the same pension the first owner's
  // is income throughout.
  it("draws a pension early until its own owner reaches the pension age", () => {
    const late = { ...plan, from: 2049, owners: [working, sam], years: 4 };
    const spending = {
      expenses: [{ ...household, amount: 1000, lastYear: null }],
      income: [],
    };
    const earlyIn = (owner: number): readonly number[] =>
      project([{ ...sipp, balance: 200000, owner }], spending, late).map(
        ({ early }) => early,
      );

    expect(earlyIn(sam.id)).toStrictEqual([26667, 26667, 26667, 0, 0]);
    expect(earlyIn(working.id)).toStrictEqual([0, 0, 0, 0, 0]);
  });

  // Read in April, so the first tax year is whole. The first owner's
  // £36,000 salary ends with November and Sam's runs on, each leaving
  // £2,453.30 a month after its tax and NI, which the current account
  // takes as the spare money at no growth. The
  // first owner's eight months paid £3,124 of income tax where the year's
  // £24,000 owes £2,286, so £838 is refunded in April 2027 and their
  // cash entering 2028 is £20,464.40; Sam's twenty-one alike months owe
  // nothing more, £51,519.30; and the household's is the two together,
  // £71,983.70, each year settled on its own. Taxed as one person's
  // income, the first's £24,000 would have been owed at Sam's rate and
  // the year would have owed £3,622 rather than refunding £838.
  it("settles each owner's tax year on their own", () => {
    const flat: Account = {
      ...cash,
      balance: 0,
      contribution: { cap: null, kind: "spare" },
    };
    const mine = {
      ...salary,
      amount: 36000,
      bonus: 0,
      feeds: null,
      lastMonth: 10,
      lastYear: 2026,
      rsu: 0,
      sacrifice: 0,
    };
    const theirs = {
      ...mine,
      id: 9,
      lastMonth: null,
      lastYear: null,
      owner: sam.id,
    };
    const cashIn = (income: readonly IncomeLine[]): number | undefined =>
      project(
        [flat],
        { expenses: [], income },
        { ...plan, month: 3, owners: [working, sam], years: 2 },
      )
        .map((point) => balanceIn(point, flat.id))
        .at(-1);

    expect(cashIn([mine])).toBe(20464);
    expect(cashIn([theirs])).toBe(51519);
    expect(cashIn([mine, theirs])).toBe(71984);
  });

  // Read in April, so the first tax year is whole. £36,000 ending in
  // November leaves £2,453.30 in each of eight months, and £1,000 going
  // out while it runs leaves £1,453.30 of that, under the ISA's
  // £1,666.67 a month, which the ISA takes: £11,626.40. Each month paid
  // £390.50 of income tax, a twelfth of the tax on a year of it, £3,124
  // in all; but the year earned £24,000, and its tax is £2,286, the four
  // months without the salary leaving a third of the personal allowance
  // that the eight could not use. The £838 between them is refunded in
  // April 2027, which the ISA takes: £12,464.40. The April the plan
  // opens in settles nothing, having no year behind it.
  it("settles the tax year a salary stops in, in the April after it", () => {
    const saving: Account = { ...spareIsa, balance: 0 };
    const ending = {
      ...salary,
      amount: 36000,
      bonus: 0,
      feeds: null,
      lastMonth: 10,
      lastYear: 2026,
      rsu: 0,
      sacrifice: 0,
    };
    const spending = {
      ...household,
      amount: 1000,
      lastMonth: 10,
      lastYear: 2026,
    };

    expect(
      project(
        [saving],
        { expenses: [spending], income: [ending] },
        { ...plan, month: 3, years: 2 },
      ).map(({ free }) => free),
    ).toStrictEqual([0, 11626, 12464]);
  });

  // Read in April, a salary of £72,000 with a £12,000 bonus runs the
  // 2026 tax year to March. Every month's pay is past a twelfth of the
  // upper earnings limit however the bonus is paid, so its NI is the
  // same over the year, £3,690.60; a bonus paid in one month is taxed in
  // it as a twelfth of a year earning £216,000 and the year settled in
  // the April after, so the year's income tax is what £84,000 owes,
  // £21,032, however it was paid, and the cash keeps the same £59,277.40
  // by the time the next year closes. December 2026 closes on what nine
  // months had been paid by then: nine twelfths of the bonus, £44,458;
  // three quarters of it, in June, September and December, £44,058; or
  // none of it before February, £39,238.
  // Read in April, £12,000 of base pays £1,000 a month, under the
  // personal allowance's twelfth, which the ISA takes whole, ten
  // twelfths of the 2026 tax year by January. February adds a £24,000
  // bonus: £25,000, taxed as a twelfth of a year of it, £10,100.25, and
  // £667.55 of NI, leaves £14,232.20, of which the ISA takes the £10,000
  // its tax year has left and the cash the rest; March's £1,000 finds
  // no room and goes to the cash too. April 2027 opens a new tax year,
  // whose room takes the £5,414.25 the old one is refunded, the year
  // having earned £36,000 and owing £4,686: £25,414.25 in the ISA and
  // £5,232.20 in the cash. Held a twelfth a month, the ISA would have
  // taken £1,666.67 of February, March's £1,000 and £1,666.67 of the
  // refund.
  it("fills what the tax year has left of the ISA in a bonus month", () => {
    const saving: Account = { ...spareIsa, balance: 0 };
    const spareCash: Account = {
      ...cash,
      balance: 0,
      contribution: { cap: null, kind: "spare" },
    };
    const bonused: IncomeLine = {
      ...salary,
      amount: 12000,
      bonus: 24000,
      bonusCadence: "year",
      bonusMonth: 1,
      feeds: null,
      lastMonth: 2,
      lastYear: 2027,
      rsu: 0,
      sacrifice: 0,
    };
    const points = project(
      [saving, spareCash],
      { expenses: [], income: [bonused] },
      { ...plan, month: 3, years: 2 },
    );

    expect(points.map((point) => balanceIn(point, saving.id))).toStrictEqual([
      0, 9000, 25414,
    ]);
    expect(points.map((point) => balanceIn(point, spareCash.id))).toStrictEqual(
      [0, 0, 5232],
    );
  });

  // Read in April, the ISA is paid £3,000 a month of its own, which the
  // month has, past the £20,000 a tax year holds it to: April to
  // August land £15,000, September the whole £3,000 and October the
  // £2,000 left, and November to March nothing, the rest staying in the
  // month as spent. The room opens again in April 2027, and the same
  // £20,000 lands by October.
  it("holds a fixed sum back once the tax year's allowance is used, and opens it again in April", () => {
    const topped: Account = {
      ...spareIsa,
      balance: 0,
      contribution: { amount: 3000, cadence: "month", kind: "fixed" },
    };

    expect(
      project([topped], funded, { ...plan, month: 3, years: 2 }).map((point) =>
        balanceIn(point, topped.id),
      ),
    ).toStrictEqual([0, 20000, 40000]);
  });

  // Read in April, a £150,000 base sacrificing two fifths lands £5,750 a
  // month in the SIPP, £69,000 a year's worth; but it ends in December,
  // and the £51,750 its nine months land is within the year's £60,000,
  // so nothing is charged as income. Each month pays £7,500, taxed as a
  // twelfth of £90,000 at £1,952.67 with £317.55 of NI, leaving
  // £5,229.78 for the cash, £47,068.05; April 2027 refunds the £3,142
  // the nine months paid past what £67,500 owes over the year:
  // £50,210.05. Held a twelfth a month, £750 of each month would have
  // been charged as income, £2,700 more tax.
  it("charges as income only what passes the tax year's pension allowance", () => {
    const fed: Account = { ...sipp, balance: 0 };
    const spareCash: Account = {
      ...cash,
      balance: 0,
      contribution: { cap: null, kind: "spare" },
    };
    const sacrificing: IncomeLine = {
      ...salary,
      amount: 150000,
      bonus: 0,
      feeds: fed.id,
      lastYear: 2026,
      rsu: 0,
      sacrifice: 0.4,
    };
    const points = project(
      [fed, spareCash],
      { expenses: [], income: [sacrificing] },
      { ...plan, month: 3, years: 2 },
    );

    expect(points.map((point) => balanceIn(point, fed.id))).toStrictEqual([
      0, 51750, 51750,
    ]);
    expect(points.map((point) => balanceIn(point, spareCash.id))).toStrictEqual(
      [0, 47068, 50210],
    );
  });

  it("settles a tax year to the same income tax however its bonus was paid", () => {
    const flat: Account = {
      ...cash,
      balance: 0,
      contribution: { cap: null, kind: "spare" },
    };
    const salaried = {
      ...salary,
      amount: 72000,
      bonus: 12000,
      feeds: null,
      lastMonth: 2,
      lastYear: 2027,
      rsu: 0,
      sacrifice: 0,
    };
    const cashIn = (line: IncomeLine): number[] =>
      project(
        [flat],
        { expenses: [], income: [line] },
        { ...plan, month: 3, years: 2 },
      ).map((point) => balanceIn(point, flat.id));

    expect(cashIn(salaried)).toStrictEqual([0, 44458, 59277]);
    expect(cashIn({ ...salaried, bonusCadence: "quarter" })).toStrictEqual([
      0, 44058, 59277,
    ]);
    expect(
      cashIn({ ...salaried, bonusCadence: "year", bonusMonth: 1 }),
    ).toStrictEqual([0, 39238, 59277]);
  });

  // Read in September, the plan holds seven months of the 2026 tax
  // year, which is taxed against seven twelfths of each band. The
  // salary ends with December, so four months of £2,453.30 are earned,
  // less £1,000 going out while it runs, and £1,453.30 of each lands in
  // the ISA, £5,813.20, having paid £1,562 of income tax; the £12,000
  // they earned owes £933.50 against seven twelfths of the allowance,
  // and the £628.50 between them lands in April: £6,441.70.
  it("settles a tax year the plan holds part of against that part of each band", () => {
    const saving: Account = { ...spareIsa, balance: 0 };
    const ending = {
      ...salary,
      amount: 36000,
      bonus: 0,
      feeds: null,
      lastYear: 2026,
      rsu: 0,
      sacrifice: 0,
    };
    const spending = { ...household, amount: 1000, lastYear: 2026 };

    expect(
      project(
        [saving],
        { expenses: [spending], income: [ending] },
        { ...plan, month: 8, years: 2 },
      ).map(({ free }) => free),
    ).toStrictEqual([0, 5813, 6442]);
  });

  // Class 4 is due on the year's profit, as income tax is on its income.
  // Consulting of £2,000 a month from January is £6,000 in the 2026 tax
  // year, under both the allowance and Class 4's threshold, but each of
  // its three months paid £190.50 of income tax and £57.15 of Class 4 as
  // a twelfth of a year of such months. All £742.95 is refunded in April,
  // so the ISA takes twelve months of £1,752.35 less the £1,000 going
  // out, £752.35, and the refund: £9,771.15. Settling the income tax
  // alone refunded £571.50 of it.
  it("settles Class 4 on the year's profit with the income tax", () => {
    const saving: Account = { ...spareIsa, balance: 0 };

    expect(
      project(
        [saving],
        {
          expenses: [{ ...household, amount: 1000, firstYear: 2027 }],
          income: [{ ...consulting, firstYear: 2027 }],
        },
        { ...plan, month: 3, years: 2 },
      ).map(({ free }) => free),
    ).toStrictEqual([0, 0, 9771]);
  });

  // A settlement can be owed as well as refunded. £112,800 to December
  // and £138,000 from January is £119,100 in the 2026 tax year, which
  // owes £38,892, the year sitting in the 60% band where the allowance is
  // withdrawn. Taxed as twelfths, nine months at £2,926 and three at
  // £4,025.25 paid only £38,409.75: the three read as £138,000 a year,
  // past the withdrawal and into the 45% rate. April 2027 owes the
  // £482.25 between them. £6,000 going out every month leaves the ISA
  // under its £1,666.67 a month: nine months of £118.45, then twelve of
  // £1,077.20 less the £482.25: £1,066.05, then £13,510.20.
  it("takes what a tax year still owes out of the April after it", () => {
    const saving: Account = { ...spareIsa, balance: 0 };
    const earner = {
      ...salary,
      amount: 112800,
      bonus: 0,
      feeds: null,
      lastYear: 2026,
      rsu: 0,
      sacrifice: 0,
    };

    expect(
      project(
        [saving],
        {
          expenses: [{ ...household, amount: 6000 }],
          income: [
            earner,
            {
              ...earner,
              amount: 138000,
              firstYear: 2027,
              id: 2,
              lastYear: null,
            },
          ],
        },
        { ...plan, month: 3, years: 2 },
      ).map(({ free }) => free),
    ).toStrictEqual([0, 1066, 13510]);
  });

  // £400 of cash covers £400 of January and stops there rather than
  // going below nothing, so the ISA covers the £600 left of it and the
  // eleven whole months after, £11,600 in all: 20,000 − 11,600 = 8,400.
  it("draws an account to nothing and no lower, passing the rest to the next", () => {
    const thin: Account = { ...cash, balance: 400 };

    expect(
      project([thin, flatIsa], short, { ...plan, years: 1 }),
    ).toStrictEqual([
      point(2026, { 3: 400, 6: 20000 }, { free: 20000 }),
      point(2027, { 3: 0, 6: 8400 }, { free: 8400 }),
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
      point(2026, { 6: 1 }, { free: 1 }),
      point(2027, { 6: 1 }, { free: 1 }),
    ]);
  });

  // The £1,200 of cash covers January whole and £200 of February, so
  // 2026 goes short by 800 + 10 × 1,000 = 10,800 and 2027, with nothing
  // left anywhere, by all twelve of its £1,000. Each is reported on the
  // point whose balances open that year, and the last year is never
  // carried, so its point is short by nothing.
  it("reports what nothing covered on the point of the year it went short", () => {
    expect(project([pocket], short, { ...plan, years: 2 })).toStrictEqual([
      point(2026, { 3: 1200 }, { uncovered: 10800 }),
      point(2027, { 3: 0 }, { uncovered: 12000 }),
      point(2028, { 3: 0 }),
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
    ).toStrictEqual([point(2026, {}, { uncovered: 1 }), point(2027, {})]);
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
      point(2026, { 6: 10000 }, { free: 10000 }),
      point(2027, { 6: 9037 }, { free: 9037 }),
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
    ).toStrictEqual(point(2027, { 6: 0 }));
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
    ).toStrictEqual(point(2027, { 6: 2000 }, { free: 2000 }));
  });

  // The home is carried at its own 2.1% and the mortgage paid down, and
  // neither is in a wrapper, so both sums are nothing.
  it("sums no wrapper when no account is one, carrying the home all the same", () => {
    expect(
      project([home, mortgage], funded, { ...plan, years: 1 }),
    ).toStrictEqual([
      point(2026, { 4: 397512, 5: -176520 }),
      point(2027, { 4: 405860, 5: -158525 }),
    ]);
  });

  it("holds only today's balances over no years", () => {
    expect(
      project([pension, isa], funded, { ...plan, years: 0 }),
    ).toStrictEqual([
      point(2026, { 2: 271930, 6: 391640 }, { deferred: 391640, free: 271930 }),
    ]);
  });

  // At 10% a year, £10,000 of cash earning nothing is worth £9,091 of
  // today's money entering 2027 and £8,264 entering 2028, and a debt
  // nothing pays, held where it opened, owes that much less of it too.
  it("reads each balance on a point in today's money", () => {
    const unpaid: Account = {
      balance: -176520,
      growth: mortgage.growth,
      id: 5,
      kind: "debt",
      name: "Mortgage",
    };

    expect(
      project(
        [{ ...cash, balance: 10000 }, unpaid],
        { expenses: [], income: [] },
        { ...plan, inflation: 0.1, years: 2 },
      ).map(({ balances }) => balances),
    ).toStrictEqual([
      { 3: 10000, 5: -176520 },
      { 3: 9091, 5: -160473 },
      { 3: 8264, 5: -145884 },
    ]);
  });

  // £1,000 a month of today's money rising with prices at 10% a year
  // is short £12,000 of today's money a year, whichever year it is;
  // drawn instead from a pension before the pension age, each month
  // takes £2,222.22 of today's money, £26,667 a year.
  it("reads what a year goes short by or draws early in today's money, a month at a time", () => {
    const rising = {
      expenses: [{ ...household, amount: 1000, growth: "inflation" as const }],
      income: [],
    };
    const tenPercent = { ...plan, inflation: 0.1, years: 2 };

    expect(
      project([], rising, tenPercent).map(({ uncovered }) => uncovered),
    ).toStrictEqual([12000, 12000, 0]);
    expect(
      project([{ ...sipp, balance: 1000000 }], rising, tenPercent).map(
        ({ early }) => early,
      ),
    ).toStrictEqual([26667, 26667, 0]);
  });

  // Neither owner draws on a pension, so each holds the whole £268,275
  // in nominal pounds, which at 10% a year is £243,886 of today's money
  // entering 2027 and £221,715 entering 2028.
  it("carries each owner's lump sum allowance left on the point in today's money", () => {
    expect(
      project([], funded, {
        ...plan,
        inflation: 0.1,
        owners: [working, sam],
        years: 2,
      }).map(({ allowances }) => allowances),
    ).toStrictEqual([
      { [sam.id]: 268275, [working.id]: 268275 },
      { [sam.id]: 243886, [working.id]: 243886 },
      { [sam.id]: 221715, [working.id]: 221715 },
    ]);
  });

  // Read from April 2030 at 3%, £36,000 a year fixed in nominal terms
  // runs two whole tax years, to March 2032. The first, the last the
  // bands are frozen for, pays £390.50 of income tax and £156.20 of NI a
  // month against the figures, leaving £2,453.30; the second pays
  // £384.22 and £153.69 against them risen 3%, leaving £2,462.10. Each
  // tax year's months are alike, so each settles nothing in the April
  // after it, against its own year's bands: £58,984.79 is held entering
  // 2033, when prices have risen by 1.03 to the power of two and three
  // quarters, which is £54,380 of today's money.
  it("taxes each tax year against its bands as they have risen, and settles it against them", () => {
    const earning = {
      ...salary,
      amount: 36000,
      bonus: 0,
      feeds: null,
      lastMonth: 2,
      lastYear: 2032,
      rsu: 0,
      sacrifice: 0,
    };

    const [, , , entering2033] = project(
      [{ ...cash, balance: 0, contribution: { cap: null, kind: "spare" } }],
      { expenses: [], income: [earning] },
      { ...plan, from: 2030, inflation: 0.03, month: 3, years: 3 },
    );

    expect(entering2033?.balances[3]).toBe(54380);
  });

  // £20,000 on the plan rate earns the path's 10% in 2026, loses 20% of
  // that in 2027 and gains 30% in 2028, 22,000, 17,600 and 22,880, and
  // the plan's own 5% in 2029, past where the path runs, 24,024.
  it("carries a saving on the plan rate at each year's rate along a path, and at the plan's past it", () => {
    const saving: Account = { ...flatIsa, growth: { kind: "plan" } };

    expect(
      project(
        [saving],
        { expenses: [], income: [] },
        {
          ...plan,
          path: { inflation: [0, 0, 0], rate: [0.1, -0.2, 0.3] },
          years: 4,
        },
      ).map((point) => balanceIn(point, saving.id)),
    ).toStrictEqual([20000, 22000, 17600, 22880, 24024]);
  });

  // £20,000 on the plan rate earns the glide path's 10% in 2026 and 5%
  // in 2027, 22,000 and 23,100; a path drawn over it is taken in its
  // place, its 20% in 2026, 24,000, and the glide path's 5% past it,
  // 25,200.
  it("carries a saving on the plan rate at each year's rate along a glide path, and a path's over it", () => {
    const saving: Account = { ...flatIsa, growth: { kind: "plan" } };
    const glided = { ...plan, byYear: [0.1, 0.05], years: 2 };

    expect(
      project([saving], { expenses: [], income: [] }, glided).map((point) =>
        balanceIn(point, saving.id),
      ),
    ).toStrictEqual([20000, 22000, 23100]);
    expect(
      project(
        [saving],
        { expenses: [], income: [] },
        { ...glided, path: { inflation: [0], rate: [0.2] } },
      ).map((point) => balanceIn(point, saving.id)),
    ).toStrictEqual([20000, 24000, 25200]);
  });

  // The mortgage on the plan rate and the home on its own are carried
  // the same whatever the path says the plan rate comes to.
  it("carries a debt and an account on a fixed rate as at the plan's rates, whatever the path", () => {
    const carriedOn: readonly Account[] = [
      { ...mortgage, growth: { kind: "plan" } },
      home,
      cash,
    ];
    const atItsRates = { ...plan, years: 3 };

    expect(
      project(carriedOn, funded, {
        ...atItsRates,
        path: { inflation: [0, 0, 0], rate: [0.9, -0.5, 0.4] },
      }),
    ).toStrictEqual(project(carriedOn, funded, atItsRates));
  });

  // £12,100 earning nothing reads £11,000 of today's money once prices
  // have risen 10% along the path, and £10,000 once they have risen 10%
  // again; past the path, at the plan's own inflation of nothing, it
  // stays there.
  it("reads each balance in today's money along the path's prices, and at the plan's inflation past it", () => {
    expect(
      project(
        [{ ...cash, balance: 12100 }],
        { expenses: [], income: [] },
        { ...plan, path: { inflation: [0.1, 0.1], rate: [0, 0] }, years: 3 },
      ).map((point) => balanceIn(point, cash.id)),
    ).toStrictEqual([12100, 11000, 10000, 10000]);
  });

  // The fixture's household, every line rising as it says, carried along
  // a path of its own 5% and 3% in every year as it is at its own rates.
  it("carries a plan along a path of its own rates as at its rates", () => {
    const atItsRates = { ...plan, inflation: 0.03, month: 8, years: 30 };
    const lines = { expenses: expenseLines, income: incomeLines };

    expect(
      project(accounts, lines, {
        ...atItsRates,
        path: {
          inflation: Array.from({ length: 30 }, () => 0.03),
          rate: Array.from({ length: 30 }, () => 0.05),
        },
      }),
    ).toStrictEqual(project(accounts, lines, atItsRates));
  });
});

// A plan of ten years from 34, at no growth and no inflation, whose
// owner retires once the cash comes to twenty-five years of what they
// would spend retired. A salary of £120,000 leaves £6,346.45 a month
// once taxed, and £2,000 of it is spent until retirement, when the
// spending drops to £1,000. So £250,000 of cash opens 2026 short of the
// £300,000 that twenty-five years of retired spending comes to, and
// some £52,000 saved over the year opens 2027 past it, though nowhere
// near twenty-five years of the £24,000 spent working.
describe("moving home", () => {
  // A house worth £400,000 and owing £120,000 at no interest, paid £1,000
  // a month by its line, with £100,000 of cash the payments are drawn
  // from, nothing earned and nothing growing: so in 2028, as the move
  // opens it, the house is worth £400,000, owes £96,000 and leaves
  // £304,000 on its sale, and the cash holds £76,000. The next house
  // costs £500,000, whose stamp duty is £15,000.
  const moving = { ...plan, years: 3 };
  const savings: Account = { ...pocket, balance: 100000 };
  const move = {
    at: 1,
    mortgage: { loanToValue: 0.9, rate: 0, term: 10 },
    price: 500000,
    year: 2028,
  };
  const house: Account = {
    balance: 400000,
    bought: { month: { month: 9, year: 2021 }, price: 380000 },
    growth: { kind: "fixed", rate: 0 },
    id: 4,
    kind: "house",
    move,
    name: "Home",
  };
  const loan: Account = {
    balance: -120000,
    contribution: { amount: 1000, cadence: "month", kind: "fixed" },
    growth: { kind: "fixed", rate: 0 },
    id: 5,
    kind: "debt",
    name: "Home mortgage",
    secures: 4,
  };
  const paying: ExpenseLine = {
    ...household,
    amount: 1000,
    growth: "nominal",
    id: 9,
    lastYear: null,
    name: "Home mortgage",
    pays: loan.id,
  };
  const lines = { expenses: [paying], income: [] };

  // The sale's £304,000 goes in whole, so the mortgage borrows the
  // £211,000 the £515,000 still wants, under 90% of the price, the
  // deposit is the other £289,000 of it, and the cash is untouched by
  // the move. The new mortgage is paid £1,758.33
  // a month over its ten years, £21,100 in 2028, and the old line
  // stops: the cash ends 2028 at £54,900. A debt on nothing the move
  // sells stays where it opened.
  it("sells the home, clears its mortgage, and buys the next with all the sale leaves, borrowing the rest", () => {
    const family: Account = {
      balance: -1000,
      growth: { kind: "fixed", rate: 0 },
      id: 8,
      kind: "debt",
      name: "Family loan",
    };
    const run = {
      accounts: [savings, house, loan, family],
      plan: moving,
      schedule: lines,
    };
    const points = project(run.accounts, lines, moving);
    const years = movedYears(points, run);
    const [, , opened, after] = years;

    expect(points.map(({ balances }) => balances)).toStrictEqual([
      { 3: 100000, 4: 400000, 5: -120000, 8: -1000 },
      { 3: 88000, 4: 400000, 5: -108000, 8: -1000 },
      { 3: 76000, 4: 400000, 5: -96000, 8: -1000 },
      { 3: 54900, 4: 500000, 5: -189900, 8: -1000 },
    ]);
    expect(points.some(isShort)).toBe(false);
    expect(opened?.run.schedule.expenses).toStrictEqual([
      {
        ...paying,
        amount: 211000 / 120,
        firstYear: 2028,
        id: loan.id,
        lastMonth: 11,
        lastYear: 2037,
      },
    ]);
    expect(after?.run).toBe(opened?.run);
    expect(opened?.balances).toStrictEqual({
      3: 76000,
      4: 500000,
      5: -211000,
      8: -1000,
    });
    expect(opened?.due).toBe(0);
    expect(opened?.sales).toStrictEqual([
      {
        at: 1,
        borrowed: 211000,
        deposit: 289000,
        duty: 15000,
        equity: 304000,
        house: "Home",
      },
    ]);
    expect(years.map(({ sales }) => sales.length)).toStrictEqual([0, 0, 1, 0]);
    expect(movedIn(years, run, 2027)).toStrictEqual({ due: 0, run });
    expect(movedIn(years, run, 2029).run).toBe(opened?.run);
    expect(movedIn(years, run, 2025)).toStrictEqual({ due: 0, run });
  });

  // Borrowing no more than 30% of the price, £150,000, leaves a deposit
  // of £350,000, and the move £61,000 short, drawn from the cash in
  // January 2028 with that month's £500 of spending and £1,250 of the
  // new mortgage, and the spending's line runs on beside it: £114,000
  // less £61,000 and twelve months of £1,750 leaves £32,000.
  it("draws on the savings for what the sale and the most the mortgage borrows leave short", () => {
    const capped: Account = {
      ...house,
      move: { ...move, mortgage: { loanToValue: 0.3, rate: 0, term: 10 } },
    };
    const spending = { ...household, amount: 500, growth: "nominal" } as const;
    const run = {
      accounts: [{ ...savings, balance: 150000 }, capped, loan],
      plan: moving,
      schedule: { expenses: [spending, paying], income: [] },
    };
    const points = project(run.accounts, run.schedule, moving);
    const [, , opened] = movedYears(points, run);

    expect(points.map(({ balances }) => balances)).toStrictEqual([
      { 3: 150000, 4: 400000, 5: -120000 },
      { 3: 132000, 4: 400000, 5: -108000 },
      { 3: 114000, 4: 400000, 5: -96000 },
      { 3: 32000, 4: 500000, 5: -135000 },
    ]);
    expect(points.some(isShort)).toBe(false);
    expect(opened?.balances).toStrictEqual({ 3: 53000, 4: 500000, 5: -150000 });
    expect(opened?.due).toBe(61000);
    expect(opened?.sales).toStrictEqual([
      {
        at: 1,
        borrowed: 150000,
        deposit: 350000,
        duty: 15000,
        equity: 304000,
        house: "Home",
      },
    ]);
    expect(movedIn(movedYears(points, run), run, 2028).due).toBe(61000);
    expect(movedIn(movedYears(points, run), run, 2033).due).toBe(0);
  });

  // The salary's £6,346.45 a month after tax pays the ISA its £1,666.67
  // a month, a twelfth of the £20,000 it is capped at, the rest going as
  // spent. In January 2028 the move leaves £61,000 short, so that month
  // is short too: the ISA is paid nothing in it while the cash is drawn
  // on, and eleven months in 2028 rather than twelve.
  it("pays nothing into the savings in the month a move is short", () => {
    const capped: Account = {
      ...house,
      move: { ...move, mortgage: { loanToValue: 0.3, rate: 0, term: 10 } },
    };
    const saving: Account = {
      ...spareIsa,
      balance: 0,
      contribution: { cap: 20000, kind: "spare" },
    };
    const points = project(
      [savings, saving, capped, loan],
      { expenses: [paying], income: funded.income },
      moving,
    );

    expect(points.map(({ balances }) => balances[saving.id])).toStrictEqual([
      0, 20000, 40000, 58333,
    ]);
    expect(points.map(({ balances }) => balances[savings.id])).toStrictEqual([
      100000, 100000, 100000, 44096,
    ]);
  });

  // The owner retires once liquid net worth is anything above nothing.
  // A salary's £1,733.30 a month after tax lifts it from £40,000 below
  // nothing by £20,799.60 a year, so the balances entering 2028 hold
  // £1,599 above it; but the move that year borrows £211,000, and
  // measured as the move leaves it the year holds £113,401 below
  // nothing, so the owner works on, the plan never reaching it.
  it("measures the year a house moves in for retirement as the move leaves it", () => {
    const onLiquid = {
      ...moving,
      owners: [
        {
          ...working,
          retirement: [{ measure: "liquid", of: "pounds", times: 0 }],
        },
      ],
      retires: 45,
    } as const satisfies Plan;
    const earning: IncomeLine = {
      ...salary,
      amount: 24000,
      bonus: 0,
      endsAt: "retirement",
      feeds: null,
      lastYear: null,
      rsu: 0,
      sacrifice: 0,
    };
    const run = {
      accounts: [
        {
          ...savings,
          balance: 80000,
          contribution: { cap: null, kind: "spare" },
        },
        house,
        loan,
      ],
      plan: onLiquid,
      schedule: { expenses: [paying], income: [earning] },
    } as const satisfies Run;
    const points = project(run.accounts, run.schedule, onLiquid);
    const entering = points[2]?.balances ?? {};

    expect((entering[3] ?? 0) + (entering[5] ?? 0)).toBe(1599);
    expect(retirementIn(points, run)).toBeNull();
  });

  // The home growing at 5% is worth £441,000 as 2028 opens, so its sale
  // leaves £345,000. A £250,000 house held to a £220,000 ceiling costs
  // £220,000, whose stamp duty is £1,900, so £123,100 is left over,
  // into the cash; nothing is borrowed, though the move would, and
  // nothing is paid on the old mortgage after it.
  it("lands what a move leaves over in the cash, holding the next house to its ceiling", () => {
    const downsize: Account = {
      ...house,
      growth: { kind: "fixed", rate: 0.05 },
      move: { ...move, ceiling: 220000, price: 250000 },
    };

    expect(
      project([savings, downsize, loan], lines, moving).map(
        ({ balances }) => balances,
      ),
    ).toStrictEqual([
      { 3: 100000, 4: 400000, 5: -120000 },
      { 3: 88000, 4: 420000, 5: -108000 },
      { 3: 76000, 4: 441000, 5: -96000 },
      { 3: 199100, 4: 220000, 5: 0 },
    ]);
  });

  // A move borrowing nothing to a house costing £515,000 with its duty
  // clears the old mortgage out of the £304,000 the sale leaves, finds
  // the £26,000 the cash has left, and is short of the other £185,000
  // as 2028 opens; nothing is paid on the old mortgage after it.
  it("reports what neither the sale nor the savings cover on the year the move is made in", () => {
    const outright: Account = {
      ...house,
      move: { at: 1, price: 500000, year: 2028 },
    };
    const points = project(
      [{ ...savings, balance: 50000 }, outright, loan],
      lines,
      moving,
    );

    expect(points.map(({ balances }) => balances)).toStrictEqual([
      { 3: 50000, 4: 400000, 5: -120000 },
      { 3: 38000, 4: 400000, 5: -108000 },
      { 3: 26000, 4: 400000, 5: -96000 },
      { 3: 0, 4: 500000, 5: 0 },
    ]);
    expect(points.map(({ uncovered }) => uncovered)).toStrictEqual([
      0, 0, 185000, 0,
    ]);
  });

  // At 2% a year, prices have risen by 1.0404 by January 2028, so the
  // £400,000 home and the £96,000 it owes enter it as £384,468 and
  // £92,272 of today's money, leaving £292,196 of equity. The £15,000 of
  // stamp duty on the £500,000 price is £14,418 of today's, the deposit
  // is the equity less it, and the mortgage borrows the rest of the
  // £515,000.
  it("says what a move comes to in today's money", () => {
    const rising = { ...moving, inflation: 0.02 };
    const run = {
      accounts: [savings, house, loan],
      plan: rising,
      schedule: lines,
    };
    const [, , opened] = movedYears(project(run.accounts, lines, rising), run);
    const [sale] = opened?.sales ?? [];

    expect(sale?.equity).toBeCloseTo(292196, 6);
    expect(sale?.duty).toBeCloseTo(15000 / 1.0404, 6);
    expect(sale?.deposit).toBeCloseTo(292196 - 15000 / 1.0404, 6);
    expect(sale?.borrowed).toBeCloseTo(515000 / 1.0404 - 292196, 6);
  });

  it("refuses a move borrowing on a house with no loan on it", () => {
    expect(() =>
      project([savings, house], { expenses: [], income: [] }, moving),
    ).toThrow("A move borrows on a loan already secured on the house");
  });
});

describe("retiring when conditions hold", () => {
  const onConditions = {
    ...plan,
    owners: [
      {
        ...working,
        retirement: [{ measure: "liquid", of: "expenses", times: 25 }],
      },
    ],
    retires: 45,
    years: 10,
  } as const satisfies Plan;
  const saving: Account = {
    ...pocket,
    balance: 250000,
    contribution: { cap: null, kind: "spare" },
    growth: { kind: "fixed", rate: 0 },
  };
  const lines = {
    expenses: [
      {
        ...household,
        amount: 2000,
        endsAt: "retirement",
        lastYear: 2035,
        name: "Working",
      },
      {
        ...household,
        amount: 1000,
        firstYear: 2036,
        id: 2,
        lastYear: null,
        name: "Retired",
        startsAt: "retirement",
      },
    ],
    income: [
      {
        ...salary,
        amount: 120000,
        bonus: 0,
        endsAt: "retirement",
        feeds: null,
        lastYear: 2035,
        rsu: 0,
        sacrifice: 0,
      },
    ],
  } as const;

  // The plan run as if it had been set to retire at the age given, its
  // lines tied to retirement read off it.
  function retiringFixed(age: number): ProjectionPoint[] {
    const fixed = retiringAt(onConditions, age);
    return project(
      [saving],
      {
        expenses: lines.expenses.map((line) => timed(line, [], fixed)),
        income: lines.income.map((line) => timed(line, [], fixed)),
      },
      fixed,
    );
  }

  it("retires in the first year the conditions hold as it opens, reading the spending it would retire to, and runs on as a plan retiring then", () => {
    const points = project([saving], lines, onConditions);

    expect(
      retirementIn(points, {
        accounts: [saving],
        plan: onConditions,
        schedule: lines,
      }),
    ).toBe(2027);
    expect(points).toStrictEqual(retiringFixed(35));
    expect(points).not.toStrictEqual(retiringFixed(45));
    expect(points[1]?.balances[saving.id]).toBeGreaterThan(300000);
  });

  // Sam, born in 1995, retires with the plan's owner, so their salary,
  // tied to nothing, stops in 2027 as the conditions hold, as it would
  // were they set to retire at 32, the age they reach then, rather than
  // running to the end.
  it("retires an owner retiring with the plan's owner in the year the conditions hold", () => {
    const withSam = (retirement: Owner["retirement"]): Plan => ({
      ...onConditions,
      owners: [...onConditions.owners, { ...sam, retirement }],
    });
    const earning = {
      ...lines,
      income: [
        ...lines.income,
        {
          ...salary,
          amount: 60000,
          bonus: 0,
          feeds: null,
          id: 3,
          lastYear: null,
          owner: sam.id,
          rsu: 0,
          sacrifice: 0,
        },
      ],
    } as const;
    const points = project([saving], earning, withSam("retirement"));

    expect(
      retirementIn(points, {
        accounts: [saving],
        plan: withSam("retirement"),
        schedule: earning,
      }),
    ).toBe(2027);
    expect(points).toStrictEqual(
      project([saving], earning, withSam(atAge(32))),
    );
    expect(points).not.toStrictEqual(
      project([saving], earning, withSam(atAge(62))),
    );
  });

  // £450,000 saved and £50,000 owed on a loan a line pays £500 a month,
  // so a retired year's expenses are £18,000 with the payments, and 25
  // of them £450,000. The savings hold that as the plan opens, the loan
  // counted once, as its payments, so the owner retires at once; a pound
  // short, they work a year more.
  it("counts a loan a line pays once, as its payments, against the expenses", () => {
    const loan: Account = {
      balance: -50000,
      growth: { kind: "fixed", rate: 0 },
      id: 9,
      kind: "debt",
      name: "Loan",
    };
    const paying = {
      ...lines,
      expenses: [
        ...lines.expenses,
        { ...household, amount: 500, id: 3, name: "Loan", pays: loan.id },
      ],
    };
    const retiredIn = (saved: number): null | number => {
      const accounts = [{ ...saving, balance: saved }, loan];
      return retirementIn(project(accounts, paying, onConditions), {
        accounts,
        plan: onConditions,
        schedule: paying,
      });
    };

    expect(retiredIn(450000)).toBe(2026);
    expect(retiredIn(449999)).toBe(2027);
  });

  // A hundred years of retired spending is £1,200,000, which ten years
  // of saving never reach, so the owner works to the end, the spending
  // starting at retirement never starting.
  it("works on to the end where the conditions never hold", () => {
    const never = {
      ...onConditions,
      owners: [
        {
          ...working,
          retirement: [{ measure: "liquid", of: "expenses", times: 100 }],
        },
      ],
    } as const satisfies Plan;
    const points = project([saving], lines, never);

    expect(
      retirementIn(points, {
        accounts: [saving],
        plan: never,
        schedule: lines,
      }),
    ).toBeNull();
    expect(points).toStrictEqual(retiringFixed(45));
  });

  // The plan as a screen lays it out: retiring at 35, where its own run
  // reaches the conditions, or at 45, past its end, where it never does,
  // each line tied to retirement read off that age; and as it is for a
  // plan retiring at an age.
  it("lays a plan retiring on conditions out at the age its own run reaches them, or past its end", () => {
    const never = {
      ...onConditions,
      owners: [
        {
          ...working,
          retirement: [{ measure: "liquid", of: "expenses", times: 100 }],
        },
      ],
    } as const satisfies Plan;
    const atAge = (plan: Plan, age: number): ReturnType<typeof laidOut> => {
      const fixed = retiringAt(plan, age);
      return {
        accounts: [saving],
        plan: fixed,
        schedule: {
          expenses: lines.expenses.map((line) => timed(line, [], fixed)),
          income: lines.income.map((line) => timed(line, [], fixed)),
        },
      };
    };
    const fixed = retiringAt(onConditions, 61);

    expect(laidOut([saving], lines, onConditions)).toStrictEqual(
      atAge(onConditions, 35),
    );
    expect(laidOut([saving], lines, never)).toStrictEqual(atAge(never, 45));
    expect(laidOut([saving], lines, fixed)).toStrictEqual({
      accounts: [saving],
      plan: fixed,
      schedule: lines,
    });
  });

  // At 35 the owner retires in 2027, having worked 2026/27 alone past
  // the twelve years through 2025/26, so thirteen earn £4,661 a year;
  // read with the plan retiring past its end they counted on to
  // 2036/37, 23 years. Eight years laid out as nine earn nothing, and go.
  it("lays each State Pension out counted to the retirement the run reaches, or drops one counted below ten years", () => {
    const pensioned = (years: number): Run => {
      const dated = {
        ...onConditions.owners[0],
        qualifiedThrough: 2025,
        qualifyingYears: years,
      };
      const held = { ...onConditions, owners: [dated] };
      return {
        accounts: [saving],
        plan: held,
        schedule: {
          ...lines,
          income: [...lines.income, ...statePensionLines(dated, held)],
        },
      };
    };
    const laid = (run: Run): Run["schedule"]["income"] =>
      laidOut(run.accounts, run.schedule, run.plan).schedule.income;

    expect(pensioned(12).schedule.income.at(-1)).toMatchObject({
      amount: 8246,
    });
    expect(laid(pensioned(12))).toHaveLength(2);
    expect(laid(pensioned(12)).at(-1)).toMatchObject({
      amount: 4661,
      kind: "state-pension",
    });
    expect(laid(pensioned(8))).toHaveLength(1);
  });

  // Born in 1961, the owner reaches their State Pension age of 67 in
  // 2028, inside the plan, and the run retires them at 66 in 2027, so
  // from 2028 it pays the thirteen years that retirement earns, £4,661,
  // rather than the fourteen, £5,019, counted to the pension age before it
  // was placed: what the plan retiring at 66 pays, and not what it would
  // pay on the line as read.
  it("pays a State Pension on the years counted to the retirement the run reaches", () => {
    const dated = {
      ...onConditions.owners[0],
      born: 1961,
      qualifiedThrough: 2025,
      qualifyingYears: 12,
    };
    const held = { ...onConditions, born: 1961, owners: [dated], retires: 76 };
    const read = statePensionLines(dated, held);
    const fixed = retiringAt(held, 66);
    const counted = statePensionLines(
      { ...dated, retirement: atAge(66) },
      fixed,
    );
    const laid = (pensions: readonly IncomeLine[]): Schedule => ({
      expenses: lines.expenses.map((line) => timed(line, [], fixed)),
      income: [
        ...lines.income.map((line) => timed(line, [], fixed)),
        ...pensions,
      ],
    });
    const run = {
      accounts: [saving],
      plan: held,
      schedule: { ...lines, income: [...lines.income, ...read] },
    };
    const points = project([saving], run.schedule, held);

    expect(retirementIn(points, run)).toBe(2027);
    expect(read).toMatchObject([{ amount: 5019, firstYear: 2028 }]);
    expect(counted).toMatchObject([{ amount: 4661, firstYear: 2028 }]);
    expect(points).toStrictEqual(project([saving], laid(counted), fixed));
    expect(points).not.toStrictEqual(project([saving], laid(read), fixed));
  });

  it("reads the year a plan retiring at an age lays out", () => {
    expect(
      retirementIn([], {
        accounts: [],
        plan: retiringAt(onConditions, 61),
        schedule: lines,
      }),
    ).toBe(2053);
  });
});

describe("monthsOn", () => {
  // The plan above, a year long, since a month end reads its months
  // whatever the plan's length.
  const year = { ...plan, years: 1 };

  // Each account's figures by its id, as the months leave them.
  function byId(
    reached: ReturnType<typeof monthsOn>,
  ): Map<number, { readonly balance: number; readonly paid: number }> {
    return new Map(
      reached.map(({ account, balance, paid }) => [
        account.id,
        { balance, paid },
      ]),
    );
  }

  it("leaves every account where it stands, paid nothing, over no months", () => {
    expect(monthsOn(accounts, funded, { months: 0, plan: year })).toStrictEqual(
      accounts.map((account) => ({
        account,
        balance: account.balance,
        paid: 0,
      })),
    );
  });

  // January's month as the projection carries it: the pension's
  // £2,376 lands with the basic rate claimed back on it, £2,970,
  // and the ISA's £1,666.67, each then growing a month at 1.05^(1/12);
  // the home grows a month at its own 2.1%, the current account holds
  // still, and the mortgage is charged a twelfth of its 4.85% and paid
  // down by its £2,180.
  it("carries each account a month as the projection does, with what the month pays it", () => {
    const month = byId(monthsOn(accounts, funded, { months: 1, plan: year }));
    const grown = (balance: number, paid: number, rate: number): number =>
      (balance + paid) * (1 + rate) ** (1 / 12);

    expect(month.get(pension.id)?.paid).toBeCloseTo(2970);
    expect(month.get(pension.id)?.balance).toBeCloseTo(
      grown(391640, 2970, 0.05),
    );
    expect(month.get(isa.id)?.balance).toBeCloseTo(
      grown(271930, 20000 / 12, 0.05),
    );
    expect(month.get(cash.id)).toStrictEqual({ balance: 16900, paid: 0 });
    expect(month.get(home.id)).toStrictEqual({
      balance: grown(397512, 0, 0.021),
      paid: 0,
    });
    expect(month.get(mortgage.id)?.paid).toBe(2180);
    expect(month.get(mortgage.id)?.balance).toBeCloseTo(
      -176520 * (1 + 0.0485 / 12) + 2180,
    );
  });

  // £150 owed at 4.85% is charged 61p for the month and cleared by the
  // £290 payment, so the month pays off what was owed and its interest,
  // and what the payment would have paid past nothing is no debt paid.
  it("pays a debt off no further than it owes in the month it clears", () => {
    const [cleared] = monthsOn(
      [
        {
          ...mortgage,
          balance: -150,
          contribution: { amount: 290, cadence: "month", kind: "fixed" },
        },
      ],
      funded,
      { months: 1, plan: year },
    );

    expect(cleared?.balance).toBe(0);
    expect(cleared?.paid).toBeCloseTo(150 * (1 + 0.0485 / 12));
  });

  // £334,670 at 4.85% paying £1,889 a month clears with its 313th
  // payment, 312 of £1,889 and a last of £239.25, which is what the flow
  // charges the month it clears in and what that month pays off the
  // debt, so the two agree; and the payments come to the £589,607.25
  // that clears it, so what the household is charged over the loan is
  // what the debt is credited, with nothing paid into nothing, and the
  // debt owes nothing after.
  it("charges a debt in the month it clears what it credits it, so the payments sum to what clears the debt", () => {
    const loan: Account = {
      ...mortgage,
      balance: -334670,
      contribution: { amount: 1889, cadence: "month", kind: "fixed" },
    };
    const over = (
      months: number,
    ): undefined | { readonly balance: number; readonly paid: number } =>
      byId(monthsOn([loan], funded, { months, plan: year })).get(loan.id);
    const charged = Array.from({ length: 313 }, (_, offset) =>
      cashFlow([loan], funded, {
        at: { month: offset % 12, year: 2026 + Math.floor(offset / 12) },
        plan: year,
      }).fixed.reduce((sum, { amount }) => sum + amount, 0),
    );

    expect(charged.at(-1)).toBeCloseTo(239.25, 2);
    expect((over(313)?.paid ?? 0) - (over(312)?.paid ?? 0)).toBeCloseTo(
      239.25,
      2,
    );
    expect(over(313)?.paid).toBeCloseTo(589607.25, 2);
    expect(charged.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(
      over(313)?.paid ?? 0,
      6,
    );
    expect(over(313)?.balance).toBeCloseTo(0, 6);
  });

  // A month spending £1,000 with nothing coming in keeps a pension paid
  // only as far as the £1,200 of cash reaches once the spending is met,
  // as the projection keeps it: £200, landing as £250 with the basic
  // rate claimed back on it, where with no reserve read it would be kept
  // paid its whole £2,376.
  it("keeps a pension paid only as far as the cash reaches, as the projection does", () => {
    const [kept] = monthsOn([pension, pocket], short, {
      months: 1,
      plan: year,
    });

    expect(kept?.paid).toBeCloseTo(250);
  });

  // The same month with £20,000 in an ISA beside the £1,200 of cash
  // keeps the pension paid its whole £2,376, and that comes out of
  // them, the cash's £1,200 first and the ISA's £1,176 after it,
  // counted as paid off each, while the £1,000 the spending is short of
  // is not drawn, a month end checking the balances rather than
  // spending them.
  it("takes what keeps a pension paid out of the cash and the ISAs, and nothing for the spending", () => {
    const kept: Account = { ...pension, id: 20 };
    const month = byId(
      monthsOn([kept, flatIsa, pocket], short, { months: 1, plan: year }),
    );

    expect(month.get(pocket.id)).toStrictEqual({ balance: 0, paid: -1200 });
    expect(month.get(flatIsa.id)?.balance).toBeCloseTo(18824, 10);
    expect(month.get(flatIsa.id)?.paid).toBeCloseTo(-1176, 10);
  });

  // £10,000 of cash under £1,000 a month of spending and a £500 pension
  // kept paid: the projection draws £1,500 a month and has £1,000 left
  // as the seventh month opens, which the spending alone runs out, so
  // the pension is kept paid six months. A month end over eighteen counts
  // the spending it does not draw off what keeps the pension paid, so it
  // too pays it six months, £3,000 out of the cash, landing as £3,360
  // with the basic rate on the £300 a month nothing earned relieves.
  it("stops keeping a pension paid when the projection would, over a long gap", () => {
    const kept: Account = {
      ...pension,
      contribution: { amount: 500, cadence: "month", kind: "fixed" },
    };
    const months = byId(
      monthsOn([kept, { ...pocket, balance: 10000 }], short, {
        months: 18,
        plan: year,
      }),
    );

    expect(months.get(pocket.id)).toStrictEqual({ balance: 7000, paid: -3000 });
    expect(months.get(pension.id)?.paid).toBeCloseTo(3360, 10);
  });

  // A salary starting in 2027 feeds the pension nothing in December and
  // its sacrifice in January, so two months from December pay the
  // pension more than twice what December alone does.
  it("reads the months on into the next year", () => {
    const starting = {
      expenses: [],
      income: [
        ...funded.income,
        { ...salary, feeds: pension.id, firstYear: 2027, sacrifice: 0.12 },
      ],
    };
    const december = { ...year, month: 11 };
    const [one] = monthsOn(accounts, starting, { months: 1, plan: december });
    const [two] = monthsOn(accounts, starting, { months: 2, plan: december });

    expect(one?.paid).toBeCloseTo(2970);
    expect(two?.paid).toBeGreaterThan(2 * 2970 + 1200);
  });
});

describe("balanceIn", () => {
  it("reads what an account holds or owes on a point, and nothing for one it does not carry", () => {
    const [point] = project([isa, mortgage], funded, { ...plan, years: 0 });

    expect(point && balanceIn(point, isa.id)).toBe(271930);
    expect(point && balanceIn(point, mortgage.id)).toBe(-176520);
    expect(point && balanceIn(point, pension.id)).toBe(0);
  });
});

describe("worthsIn", () => {
  // £100,000 in a pension is £25,000 free of tax and £75,000 at 20%,
  // £85,000, and everything else counts at what it holds or owes.
  it("counts a pension at what drawing it would leave, and anything else at its balance", () => {
    expect(
      worthsIn(point(2026, { 2: 50000, 4: 300000, 5: -100000, 6: 100000 }), [
        pension,
        isa,
        cash,
        home,
        mortgage,
      ]),
    ).toStrictEqual({ 2: 50000, 3: 0, 4: 300000, 5: -100000, 6: 85000 });
  });

  // £2,000,000 is more than four times the £268,275 allowance, so its
  // quarter is held to the allowance: £268,275 free and £1,731,725 at
  // 20%, leaving £1,653,655 rather than 85% of it.
  it("holds a pension's tax-free quarter to its owner's allowance", () => {
    expect(worthsIn(point(2026, { 6: 2000000 }), [pension])).toStrictEqual({
      6: 1653655,
    });
  });

  // The owner's £1,500,000 and £500,000 are counted together, as the
  // £2,000,000 that leaves £1,653,655, three quarters of it to the first
  // and a quarter to the second; counted one at a time each would take a
  // whole allowance and leave 85%, £1,700,000 between them. Sam's
  // £100,000, against the nothing Sam has left, leaves £80,000, and a
  // pension holding nothing is worth nothing.
  it("shares one allowance across an owner's pensions by what each holds, and holds each owner to their own", () => {
    const sams: Account = { ...sipp, id: 8, owner: sam.id };

    expect(
      worthsIn(
        point(
          2026,
          { 6: 1500000, 7: 500000, 8: 100000 },
          { allowances: { [sam.id]: 0, [working.id]: lumpSumAllowance } },
        ),
        [pension, sipp, sams],
      ),
    ).toStrictEqual({ 6: 1240241, 7: 413414, 8: 80000 });
    expect(worthsIn(point(2026, {}), [pension, sipp, sams])).toStrictEqual({
      6: 0,
      7: 0,
      8: 0,
    });
  });

  // An owner the point holds no allowance for has none to take a
  // quarter free under, so the whole pension is taxed, and so is a
  // pension with no owner at all, here the current account's fields as
  // a pension's.
  it("taxes the whole of a pension whose owner the point holds no allowance for", () => {
    const ownerless: Account = { ...cash, kind: "tax-deferred" };

    expect(
      worthsIn(point(2026, { 6: 100000 }, { allowances: {} }), [pension]),
    ).toStrictEqual({ 6: 80000 });
    expect(worthsIn(point(2026, { 3: 100000 }), [ownerless])).toStrictEqual({
      3: 80000,
    });
  });
});

describe("measuredOf", () => {
  // The pension counts at its £85,000 in the net worth, £345,000 with
  // the ISA, the cash and the home's equity. Its owner, born in 1992,
  // is 34 in 2026 and 56 in 2048, short of the pension age, so the
  // liquid net worth leaves it out with the home, the ISA and the cash
  // less the mortgage, -£40,000; at 57 in 2049 it can be drawn and
  // counts there at the same £85,000, £45,000. What is owed, the
  // expenses and the age are read as they were.
  it("counts a pension net in the net worth, and in the liquid net worth only from its owner's pension age", () => {
    const run = {
      accounts: [pension, isa, cash, home, mortgage],
      plan: { ...plan, years: 60 },
      schedule: short,
    };
    const at = (year: number): ReturnType<typeof measuredOf> =>
      measuredOf(
        point(year, { 2: 50000, 3: 10000, 4: 300000, 5: -100000, 6: 100000 }),
        { month: 0, year },
        run,
      );

    expect(at(2026)).toStrictEqual({
      age: 34,
      debt: 100000,
      expenses: 12000,
      liquid: -40000,
      loans: 0,
      worth: 345000,
    });
    expect(at(2048)).toStrictEqual({
      age: 56,
      debt: 100000,
      expenses: 12000,
      liquid: -40000,
      loans: 0,
      worth: 345000,
    });
    expect(at(2049)).toStrictEqual({
      age: 57,
      debt: 100000,
      expenses: 12000,
      liquid: 45000,
      loans: 0,
      worth: 345000,
    });
  });

  // The pension age rises from 55 to 57 in April 2028. An owner of 55 in
  // 2028, born in 1973, can draw from January to March and not after,
  // so not all year, and the £85,000 the pension counts at is left out
  // of 2028's liquid net worth, the ISA's £50,000 alone; one of 57 then,
  // born in 1971, can draw all year, and so can one of 55 in 2027, born
  // in 1972, the age not yet risen, so theirs counts, £135,000.
  it("counts a pension in the liquid net worth for a year only if it can be drawn all year", () => {
    const liquidIn = (born: number, year: number): number =>
      measuredOf(
        point(year, { 2: 50000, 6: 100000 }),
        { month: 0, year },
        {
          accounts: [pension, isa],
          plan: { ...bornIn(born), years: 60 },
          schedule: short,
        },
      ).liquid;

    expect(liquidIn(1973, 2028)).toBe(50000);
    expect(liquidIn(1971, 2028)).toBe(135000);
    expect(liquidIn(1972, 2027)).toBe(135000);
  });

  // £1,000 a month on the household beside £500 a month paying the
  // mortgage: a year's expenses are £18,000, the payments among them,
  // and the £100,000 owed on the mortgage is what the loans the lines
  // pay owe. The same £500 paying no loan leaves the mortgage paid by
  // nothing on the expenses.
  it("measures what is owed on the loans the expense lines pay", () => {
    const payments = { ...household, amount: 500, id: 99, name: "Payments" };
    const measuredWith = (line: ExpenseLine): ReturnType<typeof measuredOf> =>
      measuredOf(
        point(2026, { 5: -100000 }),
        { month: 0, year: 2026 },
        {
          accounts: [mortgage],
          plan: { ...plan, years: 30 },
          schedule: {
            expenses: [{ ...household, amount: 1000 }, line],
            income: [],
          },
        },
      );

    expect(measuredWith({ ...payments, pays: mortgage.id })).toMatchObject({
      debt: 100000,
      expenses: 18000,
      loans: 100000,
    });
    expect(measuredWith(payments)).toMatchObject({
      debt: 100000,
      expenses: 18000,
      loans: 0,
    });
  });
});

describe("isShort", () => {
  it("says whether a point's year drew from nowhere or on a pension early", () => {
    expect(isShort(point(2030, {}))).toBe(false);
    expect(isShort(point(2030, {}, { uncovered: 1 }))).toBe(true);
    expect(isShort(point(2030, {}, { early: 1 }))).toBe(true);
  });
});

describe("holdsAnything", () => {
  it("says whether a point holds or owes anything in any account", () => {
    const at = (accounts: readonly Account[]): boolean =>
      project(accounts, funded, { ...plan, years: 0 }).some(holdsAnything);

    expect(at([isa])).toBe(true);
    expect(at([mortgage])).toBe(true);
    expect(at([{ ...isa, balance: 0 }])).toBe(false);
    expect(at([])).toBe(false);
  });
});

describe("endYear", () => {
  it("names the last year the plan runs to, which is the last year plotted", () => {
    const [, , last] = project([], funded, { ...plan, years: 2 });

    expect(endYear({ ...plan, years: 2 })).toBe(2028);
    expect(last?.year).toBe(endYear({ ...plan, years: 2 }));
  });
});
