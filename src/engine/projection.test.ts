// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { endYear } from "@/data/plan";
import { drawFor, lumpSumAllowance } from "@/lib/tax";

import { project } from "./projection";

const [pension, isa, cash, home, mortgage] = accounts;
const [salary, , consulting] = incomeLines;
const [household] = expenseLines;

// Read at the start of its first year, so every year is carried whole.
const plan = { born: 1990, from: 2026, month: 0, rate: 0.05 };

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
// the accounts these tests hold, so it is earned whole, £7,474.70 a
// month after £4,362.75 of income tax and £412.55 of NI, which leaves
// £3,974.70 a month in 2026, and all of it from 2048, when the
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
  // the same way with its £2,266.25 a month and the basic rate claimed
  // back on it, £2,832.81: 468,431.69, then 526,760.95.
  // The current account, the home and the mortgage are no wrapper and
  // are left out.
  it("pays a year's sum in a twelfth at a time, each month grown at the plan rate, by wrapper", () => {
    expect(project(accounts, funded, { ...plan, years: 2 })).toStrictEqual([
      {
        age: 36,
        deferred: 412880,
        early: 0,
        free: 286145,
        uncovered: 0,
        year: 2026,
      },
      {
        age: 37,
        deferred: 468432,
        early: 0,
        free: 320990,
        uncovered: 0,
        year: 2027,
      },
      {
        age: 38,
        deferred: 526761,
        early: 0,
        free: 357577,
        uncovered: 0,
        year: 2028,
      },
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
      { age: 36, deferred: 0, early: 0, free: 1000, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 2200, uncovered: 0, year: 2027 },
      { age: 38, deferred: 0, early: 0, free: 3400, uncovered: 0, year: 2028 },
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
      {
        age: 36,
        deferred: 0,
        early: 0,
        free: 296145,
        uncovered: 0,
        year: 2026,
      },
      {
        age: 37,
        deferred: 0,
        early: 0,
        free: 331190,
        uncovered: 0,
        year: 2027,
      },
    ]);
  });

  // £3,974.70 a month is left, of which the ISA takes £1,666.67, a
  // twelfth of its £20,000 allowance, so a year adds £20,000: 306,145,
  // then 326,145.
  it("pays a spare-money account its take of the year's cash flow, every month", () => {
    expect(project([spareIsa], schedule, { ...plan, years: 2 })).toStrictEqual([
      {
        age: 36,
        deferred: 0,
        early: 0,
        free: 286145,
        uncovered: 0,
        year: 2026,
      },
      {
        age: 37,
        deferred: 0,
        early: 0,
        free: 306145,
        uncovered: 0,
        year: 2027,
      },
      {
        age: 38,
        deferred: 0,
        early: 0,
        free: 326145,
        uncovered: 0,
        year: 2028,
      },
    ]);
  });

  // The salary's £1,000 a month sacrificed, the tax on the rest and the
  // household leave £3,444.70, and the fixed sums come out of it before
  // the spare money does, in the order the accounts are listed: the
  // pension's £27,195 a year, £2,266.25 a month, whole, and the
  // mortgage the £1,178.45 left of its £2,210. The current account,
  // listed first and uncapped, would take whatever was left, and
  // nothing is, so the ISA is paid nothing either; the pension is paid
  // its sum, which lands with the basic rate claimed back as £2,832.81,
  // and fed the £1,150 that lands with the NI saved on top: 482,603.
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
    expect(a?.deferred).toBe(482603);
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
    ).toStrictEqual({
      age: 37,
      deferred: 12000,
      early: 0,
      free: 9600,
      uncovered: 0,
      year: 2027,
    });
    expect(
      project([spare], funded, { ...plan, years: 1 }).at(-1)?.deferred,
    ).toBe(6000);
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
      { age: 36, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2026 },
      { age: 37, deferred: 13800, early: 0, free: 0, uncovered: 0, year: 2027 },
      { age: 38, deferred: 27600, early: 0, free: 0, uncovered: 0, year: 2028 },
    ]);
  });

  // A pension is never fed in a month it could be drawn on. £5,000 a
  // month is £3,489.78 after the sacrifice and the tax on the rest, and
  // against £4,000 of spending does not cover itself, so the £500 the
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
        { ...plan, born: 1960, years: 1 },
      ),
    ).toStrictEqual([
      { age: 66, deferred: 0, early: 0, free: 0, uncovered: 2643, year: 2026 },
      { age: 67, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2027 },
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

  // The same ISA listed again would open the plan holding £572,290 of
  // the £286,145 it has and be paid its take twice a month. The list
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
      project([spareIsa, flatIsa], schedule, { ...plan, years: 1 }),
    ).not.toThrow();
  });

  // A balance below nothing is a debt's, and no debt is held: the ISA
  // at minus £500 would be compounded deeper every month and never
  // drawn on, since a draw takes the lesser of what an account holds
  // and what the month is short and stops at nothing, so it would
  // cover none of a month it was short and plot a wrapper owing money.
  // A balance of nothing is carried as it stands, and the mortgage,
  // owing £182,940 and held by nothing, is left where it is.
  it("refuses a held account below nothing", () => {
    expect(() =>
      project([{ ...flatIsa, balance: -500 }], funded, { ...plan, years: 1 }),
    ).toThrow("A balance below nothing is a debt's");
    expect(
      project([{ ...flatIsa, balance: 0 }, mortgage], funded, {
        ...plan,
        years: 1,
      }),
    ).toStrictEqual([
      { age: 36, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2027 },
    ]);
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
      {
        age: 36,
        deferred: 0,
        early: 0,
        free: 286145,
        uncovered: 0,
        year: 2026,
      },
      {
        age: 37,
        deferred: 0,
        early: 0,
        free: 292065,
        uncovered: 0,
        year: 2027,
      },
      {
        age: 38,
        deferred: 0,
        early: 0,
        free: 306984,
        uncovered: 0,
        year: 2028,
      },
    ]);
  });

  // Read in September, the first year has four months to run: £1,666.67
  // in each is £6,666.67, then a whole year's £20,000 on top.
  it("carries the first year from the month the plan is read in", () => {
    expect(
      project([spareIsa], schedule, { ...plan, month: 8, years: 2 }),
    ).toStrictEqual([
      {
        age: 36,
        deferred: 0,
        early: 0,
        free: 286145,
        uncovered: 0,
        year: 2026,
      },
      {
        age: 37,
        deferred: 0,
        early: 0,
        free: 292812,
        uncovered: 0,
        year: 2027,
      },
      {
        age: 38,
        deferred: 0,
        early: 0,
        free: 312812,
        uncovered: 0,
        year: 2028,
      },
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
      {
        age: 36,
        deferred: 0,
        early: 0,
        free: 286145,
        uncovered: 0,
        year: 2026,
      },
      {
        age: 37,
        deferred: 0,
        early: 0,
        free: 286145,
        uncovered: 0,
        year: 2027,
      },
    ]);
  });

  // A £5,000 card at 22% paying £250 a month clears with its 26th
  // payment, February 2028, and the ISA beside it takes whatever the
  // month leaves of the £2,453.30 the salary pays after its tax and the
  // £1,000 going out, which is under its £1,666.67 a month. 2026 pays
  // the card twelve times, so the ISA takes 12 × £1,203.30 =
  // £14,439.60; 2027 the same, £28,879.20; 2028 pays it twice and the
  // ISA takes 2 × £1,203.30 and then ten whole months of £1,453.30,
  // £45,818.80. Charged for every month of the plan instead, as it
  // was, the card would take £250 a month for ever and the ISA would be
  // held to £1,203.30 a month in every year after the debt was gone.
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

    expect(
      project([card, saving], earned, { ...plan, years: 3 }).map(
        ({ free }) => free,
      ),
    ).toStrictEqual([0, 14440, 28879, 45819]);
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
      { age: 36, deferred: 0, early: 0, free: 20000, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 20000, uncovered: 0, year: 2027 },
      { age: 38, deferred: 0, early: 0, free: 8200, uncovered: 0, year: 2028 },
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
        { ...plan, born: 1980, years: 1 },
      ),
    ).toStrictEqual([
      {
        age: 46,
        deferred: 30000,
        early: 19556,
        free: 2000,
        uncovered: 0,
        year: 2026,
      },
      { age: 47, deferred: 10444, early: 0, free: 0, uncovered: 0, year: 2027 },
    ]);
  });

  // Born in 1972, so 55 is reached in 2027, while the pension age is 55,
  // and a pension is drawn as income in every month of it: £1,000 is
  // taxed nothing, a quarter of it free and the £750 left under a
  // twelfth of the personal allowance, so twelve take £12,000. The age
  // rises to 57 in April 2028, when its owner is 56, so January to March
  // are drawn as income and the nine months after early, £2,222.22 each
  // and £20,000 in all, read to the penny rather than rounded up from
  // the residue of adding them. 2029 reaches 57 and is income again.
  it("draws a pension as income from 55 until the pension age rises in April 2028, and from 57 after", () => {
    expect(
      project([{ ...sipp, balance: 100000 }], short, {
        ...plan,
        born: 1972,
        from: 2027,
        years: 3,
      }),
    ).toStrictEqual([
      {
        age: 55,
        deferred: 100000,
        early: 0,
        free: 0,
        uncovered: 0,
        year: 2027,
      },
      {
        age: 56,
        deferred: 88000,
        early: 20000,
        free: 0,
        uncovered: 0,
        year: 2028,
      },
      { age: 57, deferred: 65000, early: 0, free: 0, uncovered: 0, year: 2029 },
      { age: 58, deferred: 53000, early: 0, free: 0, uncovered: 0, year: 2030 },
    ]);
  });

  // Born in 1960, so the SIPP is drawable from the first month. £3,000
  // a month with nothing coming in grosses up to £3,282.94: the first
  // £1,396.67 is taxed nothing, its taxed three quarters inside a
  // twelfth of the personal allowance, and each pound after keeps 85p,
  // the basic rate taken off three quarters of it. Twelve of them are
  // £39,395.29, leaving 60,604.71.
  it("grosses a pension draw up so what is left of it once taxed covers the month", () => {
    const drawn: Account = { ...sipp, balance: 100000 };

    expect(
      project(
        [drawn],
        { expenses: [{ ...household, amount: 3000 }], income: [] },
        { ...plan, born: 1960, years: 1 },
      ),
    ).toStrictEqual([
      {
        age: 66,
        deferred: 100000,
        early: 0,
        free: 0,
        uncovered: 0,
        year: 2026,
      },
      { age: 67, deferred: 60605, early: 0, free: 0, uncovered: 0, year: 2027 },
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
        { ...plan, born: 1960, years: 1 },
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
        { ...plan, born: 1960, years: 1 },
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
        { ...plan, born: 1960, years: 2 },
      ).map(({ deferred }) => deferred),
    ).toStrictEqual([5000000, 3062765, 906032]);
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
      { age: 36, deferred: 0, early: 0, free: 20000, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 8400, uncovered: 0, year: 2027 },
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
      { age: 36, deferred: 0, early: 0, free: 1, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 1, uncovered: 0, year: 2027 },
    ]);
  });

  // The £1,200 of cash covers January whole and £200 of February, so
  // 2026 goes short by 800 + 10 × 1,000 = 10,800 and 2027, with nothing
  // left anywhere, by all twelve of its £1,000. Each is reported on the
  // point whose balances open that year, and the last year is never
  // carried, so its point is short by nothing.
  it("reports what nothing covered on the point of the year it went short", () => {
    expect(project([pocket], short, { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 0, early: 0, free: 0, uncovered: 10800, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 0, uncovered: 12000, year: 2027 },
      { age: 38, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2028 },
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
      { age: 36, deferred: 0, early: 0, free: 0, uncovered: 1, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2027 },
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
      { age: 36, deferred: 0, early: 0, free: 10000, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 9037, uncovered: 0, year: 2027 },
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
      early: 0,
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
      early: 0,
      free: 2000,
      uncovered: 0,
      year: 2027,
    });
  });

  it("projects nothing when no account is a wrapper", () => {
    expect(
      project([home, mortgage], funded, { ...plan, years: 1 }),
    ).toStrictEqual([
      { age: 36, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2026 },
      { age: 37, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2027 },
    ]);
  });

  it("holds only today's balances over no years", () => {
    expect(
      project([pension, isa], funded, { ...plan, years: 0 }),
    ).toStrictEqual([
      {
        age: 36,
        deferred: 412880,
        early: 0,
        free: 286145,
        uncovered: 0,
        year: 2026,
      },
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
