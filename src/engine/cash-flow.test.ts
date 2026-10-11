// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";
import type { LineValues, Month } from "@/data/schedule";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { sam, working } from "@/data/owners.fixture";
import { retiringAt } from "@/data/plan";

import type { CashFlow, Schedule } from "./cash-flow";

import { cashFlow, inTodaysMoney, totalsOf } from "./cash-flow";

// The fixture's lines, each fixed in nominal terms, so it pays what it
// states in every month whatever prices do and every figure below is
// one a line states; how a line grows is read on its own.
const [salary, stepUp, consulting, statePension] = [
  flat(incomeLines[0]),
  flat(incomeLines[1]),
  flat(incomeLines[2]),
  flat(incomeLines[3]),
] as const;
const [household, childcare, mortgagePayment, retirement, care] = [
  flat(expenseLines[0]),
  flat(expenseLines[1]),
  flat(expenseLines[2]),
  flat(expenseLines[3]),
  flat(expenseLines[4]),
] as const;

const [pension, isa, cash, home, mortgage] = accounts;

const schedule: Schedule = {
  expenses: [household, childcare, mortgagePayment, retirement, care],
  income: [salary, stepUp, consulting, statePension],
};

// Read at the start of 2026, so a debt's payments are counted from
// January and the months a month is charged for are read off there,
// and retiring past its end, so a salary runs as long as its line says.
const plan = {
  born: 1992,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working, sam],
  rate: 0.05,
  retires: 92,
  years: 57,
};

// The fixture's accounts, each paid the spare money instead: the ISA to
// its £20,000 allowance, the pension to a cap under its own, and the
// current account whatever is left, in the order they are listed.
const spareIsa: Account = {
  ...isa,
  contribution: { cap: null, kind: "spare" },
};

const spareCash: Account = {
  ...cash,
  contribution: { cap: null, kind: "spare" },
};

const sparePension: Account = {
  ...pension,
  contribution: { cap: 30000, kind: "spare" },
};

// Two thinner salaries, for the months a fixed sum is more than the
// month has: one of £60,000 paid as its base alone, so £5,000 a month
// with 12% of it still going into the pension, which leaves
// £3,431.78 after £712.67 of income tax and £255.55 of NI on the
// £52,800 a year left of it, or £3,779.78 earned whole, after £952.67
// and £267.55 on the whole £60,000; and one of £36,000 feeding
// nothing, so the month keeps its £3,000 less £390.50 of income tax
// and £156.20 of NI, £2,453.30.
const lean: IncomeLine = { ...salary, amount: 60000, bonus: 0, rsu: 0 };

const plain: IncomeLine = {
  ...salary,
  amount: 36000,
  bonus: 0,
  feeds: null,
  rsu: 0,
  sacrifice: 0,
};

// A line as it is, fixed in nominal terms.
function flat<TLine extends LineValues>(line: TLine): TLine {
  return { ...line, growth: "nominal" };
}

// A flow's entries with what each is paid read to the penny: a figure
// worked out after tax is a fraction of a penny off the one written
// down, and toStrictEqual reads a number to its last bit.
function pennies<TEntry extends { readonly amount: number }>(
  entries: readonly TEntry[],
): TEntry[] {
  return entries.map((entry) => ({
    ...entry,
    amount: Math.round(entry.amount * 100) / 100,
  }));
}

describe("cashFlow", () => {
  // 2026 runs the salary alone, £144,000 a year with its parts, so
  // £12,000 a month, of which 12% of the £120,000 base, £1,200 a
  // month, is sacrificed into the pension and lands there as £1,380
  // with the NI saved. The £129,600 a year left is past the allowance's
  // withdrawal, so it pays £44,523 of income tax, £3,710.25 a month,
  // and £4,602.60 of NI, £383.55, leaving £6,706.20 against the
  // household's £3,350 a month. The mortgage's £2,180 is owed, so it
  // goes out whole and before the other fixed sums, though it is listed
  // after them, which leaves £1,176.20. The pension's £28,512 a year is
  // £2,376 a month and takes all of it, so the ISA's £20,000,
  // £1,666.67, is paid nothing and nothing is left.
  it("takes this year's lines a month at a time, less every sacrifice, the tax on the rest and the fixed sums", () => {
    const flow = cashFlow(accounts, schedule, {
      at: { month: 0, year: 2026 },
      plan,
    });

    expect(flow.income).toBe(12000);
    expect(flow.taxable).toBe(10800);
    expect(flow.fed).toStrictEqual([
      {
        account: pension,
        amount: (14400 * 1.15) / 12,
        line: salary,
        sacrificed: 1200,
      },
    ]);
    expect(flow.incomeTax).toBeCloseTo(3710.25, 10);
    expect(flow.insurance).toBeCloseTo(383.55, 10);
    expect(flow.expenses).toBe(3350);
    expect(flow.spent).toStrictEqual([{ amount: 3350, line: household }]);
    expect(pennies(flow.fixed)).toStrictEqual([
      { account: mortgage, amount: 2180 },
      { account: pension, amount: 1176.2 },
      { account: isa, amount: 0 },
    ]);
    expect(flow.spare).toStrictEqual([]);
    expect(flow.left).toBe(0);
  });

  // Every kind of income is taxed together, and each pays its National
  // Insurance apart. £36,000 and £12,000 of salary, £24,000 of
  // consulting, the £23,400 state pension and £6,000 of other income are
  // £101,400 a year, £1,400 past £100,000, so the income tax is £27,432
  // and 60% of the £1,400, £28,272, which is £2,356 a month. The two
  // salaries are one job's pay, so Class 1 is 8% of the £35,430 of
  // £48,000 over the threshold, £2,834.40, where taken apart the
  // £12,000 would sit under it and the two would pay only the £1,874.40
  // on the other; the consulting pays Class 4, 6% of £11,430, £685.80;
  // and the pension and the other income pay none. £3,520.20 a year in
  // all, £293.35 a month.
  it("taxes every kind of income together and charges each kind its own National Insurance", () => {
    const flow = cashFlow(
      [],
      {
        expenses: [],
        income: [
          plain,
          { ...plain, amount: 12000, id: 5 },
          { ...consulting, firstYear: 2026 },
          { ...statePension, firstYear: 2026 },
          { ...plain, amount: 6000, id: 6, kind: "other" },
        ],
      },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(flow.income).toBe(8450);
    expect(flow.profit).toBe(2000);
    expect(flow.incomeTax).toBeCloseTo(2356, 10);
    expect(flow.insurance).toBeCloseTo(293.35, 10);
    expect(flow.left).toBeCloseTo(8450 - 2356 - 293.35, 10);
  });

  // Retiring at 61, someone born in 1992 works to the end of 2052 and
  // earns nothing by working from 2053, though the salary and the
  // consulting both run on for good by their lines. December 2052 is
  // earned whole: the £5,000 salary, feeding the pension, the £2,000 of
  // consulting, the £1,950 state pension and £500 of other income.
  // January 2053 is the state pension and the other income alone, with
  // nothing fed and no profit for Class 4 to be charged on.
  it("stops a salary and a self-employed profit at the retirement age, whatever their lines say, and runs the rest on", () => {
    const retiring = retiringAt(plan, 61);
    const working = { ...lean, lastYear: null };
    const lines: Schedule = {
      expenses: [],
      income: [
        working,
        { ...consulting, firstYear: 2026, lastYear: null },
        { ...statePension, firstYear: 2026 },
        { ...plain, amount: 6000, id: 6, kind: "other", lastYear: null },
      ],
    };

    const last = cashFlow([pension], lines, {
      at: { month: 11, year: 2052 },
      plan: retiring,
    });
    const first = cashFlow([pension], lines, {
      at: { month: 0, year: 2053 },
      plan: retiring,
    });

    expect(last.income).toBe(9450);
    expect(last.fed.map((entry) => entry.line)).toStrictEqual([working]);
    expect(last.profit).toBe(2000);
    expect(first.income).toBe(2450);
    expect(first.fed).toStrictEqual([]);
    expect(first.profit).toBe(0);
  });

  // Retiring at 61, the first owner retires in 2053 and Sam, born in
  // 1995, in 2056: both £36,000 salaries pay in 2052, Sam's alone in
  // 2054, and neither in 2056.
  it("stops each owner's salary at their own retirement", () => {
    const income = [
      { ...plain, lastYear: null },
      { ...plain, id: 9, lastYear: null, owner: sam.id },
    ];
    const incomeIn = (year: number): number =>
      cashFlow(
        [],
        { expenses: [], income },
        { at: { month: 0, year }, plan: retiringAt(plan, 61) },
      ).income;

    expect(incomeIn(2052)).toBe(6000);
    expect(incomeIn(2054)).toBe(3000);
    expect(incomeIn(2056)).toBe(0);
  });

  // Two salaries of £40,000, one each owner's: each pays £5,486 of
  // income tax and £2,194.40 of NI a year, £15,360.80 together, where
  // one person on £80,000 pays £23,042.60. Both the one owner's, they
  // are the one job's step-up and pay that.
  it("taxes each owner's income on its own, against their own allowance, bands and thresholds", () => {
    const mine: IncomeLine = { ...plain, amount: 40000 };
    const theirs: IncomeLine = { ...mine, id: 9, owner: sam.id };
    const taxed = (income: readonly IncomeLine[]): number => {
      const flow = cashFlow(
        [],
        { expenses: [], income },
        { at: { month: 0, year: 2026 }, plan },
      );
      return (flow.incomeTax + flow.insurance) * 12;
    };

    expect(taxed([mine, theirs])).toBeCloseTo(15360.8, 8);
    expect(taxed([mine, { ...theirs, owner: mine.owner }])).toBeCloseTo(
      23042.6,
      8,
    );
  });

  // Sam's SIPP is paid £2,000 a month out of taxed money while Sam earns
  // nothing and the first owner earns £5,000 a month: Sam is relieved on
  // £3,600 a year, £300 a month, so £240 of the £2,000 claims £60 back
  // and the rest lands a pound a pound, where pooling the household's
  // earnings relieved £500. Earning £1,000 a month of their own, Sam is
  // relieved on that, £800 paid and £200 back.
  it("relieves a pension on its own owner's earnings, and on £3,600 a year for an owner earning nothing", () => {
    const sipp: Account = {
      ...pension,
      contribution: { amount: 2000, cadence: "month", kind: "fixed" },
      id: 7,
      name: "Sam's SIPP",
      owner: sam.id,
    };
    const reliefWith = (income: readonly IncomeLine[]): CashFlow["relief"] =>
      pennies(
        cashFlow(
          [sipp],
          { expenses: [], income },
          { at: { month: 0, year: 2026 }, plan },
        ).relief,
      );

    expect(reliefWith([{ ...plain, amount: 60000 }])).toStrictEqual([
      { account: sipp, amount: 60 },
    ]);
    expect(
      reliefWith([
        { ...plain, amount: 60000 },
        { ...plain, amount: 12000, id: 9, owner: sam.id },
      ]),
    ).toStrictEqual([{ account: sipp, amount: 200 }]);
  });

  // £3,431.78 a month after the sacrifice and the tax on the rest, less
  // £2,500 of expenses, leaves £931.78, which is all the pension's
  // £2,376 can be paid: the sum is trimmed to what the month has
  // rather than drawn out of a wrapper, and the £690 the salary feeds
  // the pension is untouched by it, being given up before the month
  // sees the money at all.
  it("pays a fixed sum only as far as the month reaches", () => {
    const flow = cashFlow(
      [pension],
      { expenses: [{ ...household, amount: 2500 }], income: [lean] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(flow.fed).toStrictEqual([
      {
        account: pension,
        amount: (7200 * 1.15) / 12,
        line: lean,
        sacrificed: 600,
      },
    ]);
    expect(pennies(flow.fixed)).toStrictEqual([
      { account: pension, amount: 931.78 },
    ]);
    expect(flow.left).toBe(0);
  });

  // £2,453.30 a month after its tax against the pension's £2,376 and
  // the ISA's £1,666.67: listed first the pension is paid whole and the
  // ISA takes the £77.30 left, and listed first the ISA is paid whole
  // and the pension takes the £786.63 left. Either way the month ends
  // at nothing, the remainder being the one the hand-down keeps.
  it("pays the fixed sums in the order the accounts are listed", () => {
    const flow = cashFlow(
      [pension, isa],
      { expenses: [], income: [plain] },
      { at: { month: 0, year: 2026 }, plan },
    );
    const reversed = cashFlow(
      [isa, pension],
      { expenses: [], income: [plain] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.fixed)).toStrictEqual([
      { account: pension, amount: 2376 },
      { account: isa, amount: 77.3 },
    ]);
    expect(flow.left).toBe(0);
    expect(pennies(reversed.fixed)).toStrictEqual([
      { account: isa, amount: 1666.67 },
      { account: pension, amount: 786.63 },
    ]);
    expect(reversed.left).toBe(0);
  });

  // The same £2,453.30 against the mortgage's £2,180 and the pension's
  // £2,376: the mortgage is owed, so it is paid whole and first
  // whichever of the two is listed first, and the pension takes the
  // £273.30 it leaves. The order sets which saving is paid first, and a
  // debt is no saving.
  it("pays a debt's fixed sum whole and before any other, wherever it is listed", () => {
    const flow = cashFlow(
      [pension, mortgage],
      { expenses: [], income: [plain] },
      { at: { month: 0, year: 2026 }, plan },
    );
    const reversed = cashFlow(
      [mortgage, pension],
      { expenses: [], income: [plain] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.fixed)).toStrictEqual([
      { account: mortgage, amount: 2180 },
      { account: pension, amount: 273.3 },
    ]);
    expect(flow.left).toBe(0);
    expect(reversed).toStrictEqual(flow);
  });

  // £60,000 of salary leaves £3,431.78 a month with its £600 sacrificed
  // and £3,779.78 earned whole, against the mortgage's £2,180 and the
  // household. At £1,200 of household the £3,380 going out is covered
  // with the £600 gone, so the pension is fed and £51.78 is left; at
  // £1,500 the £3,680 is covered only by keeping the £600, so the salary
  // is earned whole, the pension is fed nothing and £99.78 is left; and
  // at £2,000 the £4,180 is covered neither way, so the mortgage is paid
  // its £2,180 all the same and the month is short by the £400.22 the
  // whole income does not cover, for the projection to draw from the
  // savings as it would for an expense. A debt's payment is owed rather
  // than saved, and a month short of it would be a debt in default.
  it("pays a debt's fixed sum in a month short of it, and gives up no sacrifice to leave it short", () => {
    const unpaid: Account = {
      balance: 391640,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };
    const against = (amount: number): CashFlow =>
      cashFlow(
        [unpaid, mortgage],
        { expenses: [{ ...household, amount }], income: [lean] },
        { at: { month: 0, year: 2026 }, plan },
      );

    expect(against(1200).fed).toStrictEqual([
      {
        account: unpaid,
        amount: (7200 * 1.15) / 12,
        line: lean,
        sacrificed: 600,
      },
    ]);
    expect(against(1200).fixed).toStrictEqual([
      { account: mortgage, amount: 2180 },
    ]);
    expect(against(1200).left).toBeCloseTo(51.78, 2);
    expect(against(1500).fed).toStrictEqual([]);
    expect(against(1500).left).toBeCloseTo(99.78, 2);
    expect(against(2000).fed).toStrictEqual([]);
    expect(against(2000).fixed).toStrictEqual([
      { account: mortgage, amount: 2180 },
    ]);
    expect(against(2000).left).toBeCloseTo(-400.22, 2);
  });

  // 2053's consulting is £2,000 a month, £1,752.35 after £190.50 of
  // income tax and £57.15 of Class 4 NI, against the mortgage payment
  // and the retirement living, £7,898: the pension is paid nothing,
  // still listed at what it had, and the month is short by the
  // £6,145.98 of expenses the income does not cover and by nothing
  // else, the sum it could not pay adding nothing to it. The mortgage
  // states no sum by then at all, its £2,180 a month having cleared the
  // £176,520 it owes in March 2034, so it is out of the ledger rather
  // than listed at nothing for another thirty years.
  it("pays no fixed sum at all when the expenses alone outrun the income", () => {
    const flow = cashFlow([pension, mortgage], schedule, {
      at: { month: 0, year: 2053 },
      plan,
    });

    expect(flow.fixed).toStrictEqual([{ account: pension, amount: 0 }]);
    expect(flow.left).toBeCloseTo(-6145.98, 10);
  });

  // £5,000 a month with 12% of its £60,000 base sacrificed leaves
  // £3,431.78 after the tax, and earned whole £3,779.78, so the £600
  // costs the month £348 once the tax saved on it is counted. Against
  // £3,400 of expenses the month covers itself with the £600 gone and
  // the pension is fed as ever, £31.78 left; against £3,700 it covers
  // itself only by keeping the £600, so the salary is earned and taxed
  // whole, the pension is fed nothing and £79.78 is left; and against
  // £4,000 it covers itself neither way, so the month is short by the
  // £220.22 the whole income does not cover rather than by the £568.22
  // a sacrifice on top of it would leave. A sacrifice the month cannot
  // afford would be a drawdown by another name, and the pension would
  // be fed in the very month a wrapper is sold to cover the spending.
  it("sacrifices nothing at all in a month the income would not cover the expenses", () => {
    const unpaid: Account = {
      balance: 391640,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };
    const against = (amount: number): CashFlow =>
      cashFlow(
        [unpaid],
        { expenses: [{ ...household, amount }], income: [lean] },
        { at: { month: 0, year: 2026 }, plan },
      );

    expect(against(3400).fed).toStrictEqual([
      {
        account: unpaid,
        amount: (7200 * 1.15) / 12,
        line: lean,
        sacrificed: 600,
      },
    ]);
    expect(against(3400).left).toBeCloseTo(31.78, 2);
    expect(against(3700).fed).toStrictEqual([]);
    expect(against(3700).incomeTax).toBeCloseTo(11432 / 12, 10);
    expect(against(3700).left).toBeCloseTo(79.78, 2);
    expect(against(4000).fed).toStrictEqual([]);
    expect(against(4000).left).toBeCloseTo(-220.22, 2);
  });

  // £12,400 a year giving up a hundredth of its base against £12,276 a
  // year of expenses covers itself to the penny, under the allowance
  // and the threshold so no tax comes off it, and is £1.1e-13 short in
  // binary, so the sacrifice was dropped and the pension fed nothing in
  // every month of the plan, while the same residue left over was read
  // as nothing at all. The month is not short: the pension is fed, and
  // the ISA takes what the sacrifice leaves down to nothing exactly.
  it("gives up the sacrifice in a month short of it by less than a nanopound", () => {
    const fed: Account = {
      balance: 0,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };
    const earner: IncomeLine = {
      ...salary,
      amount: 12400,
      bonus: 0,
      feeds: fed.id,
      rsu: 0,
      sacrifice: 0.01,
    };
    const flow = cashFlow(
      [fed, spareIsa],
      {
        expenses: [{ ...household, amount: 12276, cadence: "year" }],
        income: [earner],
      },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(12400 / 12 - 124 / 12 - 12276 / 12).toBeLessThan(0);
    expect(flow.incomeTax + flow.insurance).toBe(0);
    expect(flow.fed).toStrictEqual([
      {
        account: fed,
        amount: (124 * 1.15) / 12,
        line: earner,
        sacrificed: 124 / 12,
      },
    ]);
    expect(Object.is(flow.left, 0)).toBe(true);
  });

  // The spare money sees what the fixed sums leave and no more: the
  // £931.78 month is taken whole by the pension's trimmed sum, so the
  // ISA and the current account take nothing, while the £2,453.30 month
  // leaves the £77.30 the pension did not take for the ISA, and
  // nothing after it.
  it("hands the spare money what the fixed sums leave", () => {
    const held = [pension, spareIsa, spareCash];
    const short = cashFlow(
      held,
      { expenses: [{ ...household, amount: 2500 }], income: [lean] },
      { at: { month: 0, year: 2026 }, plan },
    );
    const wide = cashFlow(
      held,
      { expenses: [], income: [plain] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(short.fixed)).toStrictEqual([
      { account: pension, amount: 931.78 },
    ]);
    expect(short.spare).toStrictEqual([
      { account: spareIsa, amount: 0, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(short.left).toBe(0);
    expect(pennies(wide.spare)).toStrictEqual([
      { account: spareIsa, amount: 77.3, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(wide.left).toBe(0);
  });

  // The salary's £1,200 a month comes off the month whether or not the
  // pension is paid a fixed sum of its own, and is not the pension's
  // own sum, leaving £6,706.20 after the tax on the rest; a salary
  // naming a pension not among the accounts is earned whole, £7,342.20
  // after £4,250.25 of income tax and £407.55 of NI on all £144,000,
  // and a line giving up nothing feeds nothing whichever pension it
  // names.
  it("feeds the pension a salary names when it is among the accounts", () => {
    const unpaid: Account = {
      balance: 391640,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };
    const income = [salary];
    const fed = cashFlow(
      [unpaid],
      { expenses: [], income },
      { at: { month: 0, year: 2026 }, plan },
    );
    const unlisted = cashFlow(
      [isa],
      { expenses: [], income },
      { at: { month: 0, year: 2026 }, plan },
    );
    const nothing = cashFlow(
      [pension],
      { expenses: [], income: [{ ...salary, sacrifice: 0 }] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(fed.fed).toStrictEqual([
      {
        account: unpaid,
        amount: (14400 * 1.15) / 12,
        line: salary,
        sacrificed: 1200,
      },
    ]);
    expect(fed.fixed).toStrictEqual([]);
    expect(fed.left).toBeCloseTo(6706.2, 10);
    expect(unlisted.fed).toStrictEqual([]);
    expect(unlisted.left).toBeCloseTo(7342.2 - 20000 / 12, 10);
    expect(nothing.fed).toStrictEqual([]);
    expect(nothing.left).toBeCloseTo(7342.2 - 2376, 10);
  });

  // The salary matched to six per cent of its base: the employer's
  // £600 a month lands beside the £1,200 given up and the £180 of NI
  // saved on it, £1,980, while the £1,200 alone comes off the month and
  // the tax is charged on the £10,800 left of it as before, leaving the
  // £6,706.20 it leaves unmatched. A match of a fifth is matched only to
  // the 12% given up, so it lands what a match of 12% does. What the
  // month put by is the £1,200 the owner gave up: the match, like
  // the NI saved, is no money the month had.
  it("feeds the pension the employer's match with the sacrifice, off nothing the owner is paid", () => {
    const unpaid: Account = {
      balance: 391640,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };
    const flowWith = (match: number): CashFlow =>
      cashFlow(
        [unpaid],
        { expenses: [], income: [{ ...salary, match }] },
        { at: { month: 0, year: 2026 }, plan },
      );
    const matched = flowWith(0.06);

    expect(matched.fed).toHaveLength(1);
    expect(matched.fed[0]?.amount).toBeCloseTo(1980, 9);
    expect(matched.fed[0]?.sacrificed).toBe(1200);
    expect(matched.taxable).toBe(10800);
    expect(matched.incomeTax).toBeCloseTo(3710.25, 10);
    expect(matched.insurance).toBeCloseTo(383.55, 10);
    expect(matched.left).toBeCloseTo(6706.2, 10);
    expect(flowWith(0.2).fed[0]?.amount).toBeCloseTo(2580, 9);
    expect(flowWith(0.12).fed[0]?.amount).toBeCloseTo(2580, 9);
    expect(totalsOf(matched).saved).toBe(1200);
  });

  // The feed runs with the line: before its first year, and after the
  // month it ends in, the pension is fed nothing and the month is
  // short by nothing, though the pension is listed and the line names
  // it.
  it("stops feeding the pension when the salary is not running", () => {
    const unpaid: Account = {
      balance: 391640,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };
    const ending = { ...salary, lastMonth: 5, lastYear: 2030 };
    const flowAt = (income: IncomeLine, at: Month): CashFlow =>
      cashFlow([unpaid], { expenses: [], income: [income] }, { at, plan });

    expect(flowAt(salary, { month: 0, year: 2053 }).fed).toStrictEqual([]);
    expect(flowAt(salary, { month: 0, year: 2053 }).left).toBe(0);
    expect(flowAt(salary, { month: 11, year: 2025 }).fed).toStrictEqual([]);
    expect(flowAt(ending, { month: 6, year: 2030 }).fed).toStrictEqual([]);
    expect(flowAt(ending, { month: 6, year: 2030 }).left).toBe(0);
    expect(flowAt(ending, { month: 5, year: 2030 }).fed).toHaveLength(1);
    expect(flowAt(ending, { month: 5, year: 2030 }).left).toBeCloseTo(
      6706.2,
      10,
    );
  });

  // 2039 runs both salaries, £144,000 and £174,000 a year, against the
  // household and the childcare; 2053 the consulting's £2,000 a month
  // against the mortgage payment and the retirement living's £58,000 a
  // year, since the salaries ended in 2052, the childcare in 2039 and
  // the household in 2051; and 2083, the plan's last year, the state
  // pension alone against the two open-ended lines.
  it("runs a line from its first year to its last, or to the end when it has none", () => {
    const [, , , ...none] = accounts;
    const earlier = cashFlow(none, schedule, {
      at: { month: 0, year: 2039 },
      plan,
    });
    const later = cashFlow(none, schedule, {
      at: { month: 0, year: 2053 },
      plan,
    });
    const last = cashFlow(none, schedule, {
      at: { month: 0, year: 2083 },
      plan,
    });

    expect(earlier.income).toBe(26500);
    expect(earlier.expenses).toBe(4590);
    expect(later.income).toBe(2000);
    expect(later.expenses).toBeCloseTo(3065 + 58000 / 12, 10);
    expect(last.income).toBe(1950);
    expect(last.expenses).toBeCloseTo(7416.67, 2);
    expect([salary, stepUp, consulting, statePension]).toHaveLength(4);
    expect([
      household,
      childcare,
      mortgagePayment,
      retirement,
      care,
    ]).toHaveLength(5);
  });

  // £6,706.20 after the £1,200 sacrificed and the tax on the rest, less
  // the mortgage's £2,180, leaves £4,526.20 with nothing going out; the
  // ISA takes £1,666.67, a twelfth of its allowance; the pension has
  // £1,120 of room, a twelfth of its cap less the £1,380 the salary
  // already feeds it, and takes £896 of the month, which lands as
  // that £1,120 once the basic rate is claimed back on it; and the
  // current account takes the £1,963.53 left, leaving nothing.
  it("hands the spare money down the accounts that take it, each to a twelfth of its cap", () => {
    const flow = cashFlow(
      [spareIsa, sparePension, spareCash, home, mortgage],
      { expenses: [], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );
    expect(flow.fixed).toStrictEqual([{ account: mortgage, amount: 2180 }]);
    expect(pennies(flow.spare)).toStrictEqual([
      { account: spareIsa, amount: 1666.67, cap: 20000 },
      { account: sparePension, amount: 896, cap: 30000 },
      { account: spareCash, amount: 1963.53, cap: null },
    ]);
    expect(flow.left).toBe(0);
  });

  // A cap says how much of the allowance an account may use, not that
  // it has more. The salary's pension is not listed, so it is earned
  // whole, £7,342.20 after its tax: an ISA capped at £50,000 a year
  // takes the £1,666.67 its £20,000 allowance gives it a month, as one
  // with no cap does, and the current account after it the £5,675.53
  // left.
  it("holds a cap above the allowance to the allowance", () => {
    const overcapped: Account = {
      ...isa,
      contribution: { cap: 50000, kind: "spare" },
    };
    const flow = cashFlow(
      [overcapped, spareCash],
      { expenses: [], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.spare)).toStrictEqual([
      { account: overcapped, amount: 1666.67, cap: 20000 },
      { account: spareCash, amount: 5675.53, cap: null },
    ]);
  });

  // A sacrifice is an employer contribution and counts against the
  // pension's allowance: a pension at its £60,000 allowance fed £6,900
  // a month off a £600,000 base takes nothing of the spare money,
  // since the feeding alone is £82,800 a year, while one fed £1,380
  // has the £3,620 left of its £5,000 a month to fill, and one fed
  // nothing the whole twelfth. What the month pays fills it with the
  // basic rate claimed back on top, so it takes four fifths of that
  // room: £2,896 and £4,000.
  it("counts what a salary feeds a pension against its allowance", () => {
    const uncapped: Account = {
      ...pension,
      contribution: { cap: null, kind: "spare" },
    };
    const at = (amount: number, sacrifice: number): number =>
      cashFlow(
        [uncapped],
        { expenses: [], income: [{ ...salary, amount, sacrifice }] },
        { at: { month: 0, year: 2026 }, plan },
      ).spare.map((take) => take.amount)[0] ?? Number.NaN;

    expect(at(600000, 0.12)).toBe(0);
    expect(at(120000, 0.12)).toBeCloseTo(2896, 10);
    expect(at(120000, 0)).toBe(4000);
  });

  // 12% of a £600,000 base lands £6,900 a month with the employer's
  // NI on it. The £624,000 a year with its parts is £624,000 of
  // threshold income and, with the £82,800 landed on top of the £552,000
  // paid, £634,800 of adjusted income, far past where the taper reaches
  // the £10,000 floor, so the allowance is £833.33 a month and the
  // £6,900 is £6,066.67 past it. The sacrifice is given up whole all the
  // same, being the employer's contribution under the scheme, so the
  // month is taxed on the £46,000 left of the salary and on the
  // £6,066.67 landed past the allowance, £52,066.67: £22,280.25 of
  // income tax, where the £46,000 alone pays £19,550.25, the £2,730
  // between them being 45% of the £6,066.67, the owner's marginal rate;
  // and the NI stays on the £46,000 of pay, £1,087.55, since the charge
  // is no earnings. The pension's own fixed sum finds no room left and
  // is paid nothing.
  it("gives up a sacrifice whole and charges what lands past the allowance as the owner's income", () => {
    const rich: IncomeLine = { ...salary, amount: 600000 };
    const flow = cashFlow(
      [pension],
      { expenses: [], income: [rich] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(flow.fed).toStrictEqual([
      {
        account: pension,
        amount: (72000 * 1.15) / 12,
        line: rich,
        sacrificed: 6000,
      },
    ]);
    expect(flow.taxable).toBeCloseTo(46000 + 6900 - 10000 / 12, 8);
    expect(
      flow.earned.map(({ owner, taxable }) => [owner, taxable]),
    ).toStrictEqual([[1, flow.taxable]]);
    expect(flow.incomeTax).toBeCloseTo(22280.25, 8);
    expect(flow.insurance).toBeCloseTo(1087.55, 10);
    expect(flow.fixed).toStrictEqual([{ account: pension, amount: 0 }]);
  });

  // Two salaries feeding the one pension are each given up whole, the
  // £600,000 base's £6,900 and the £144,000 salary's £1,380, and the
  // owner is charged on what the two land past the allowance together:
  // £768,000 a year of threshold income and £780,960 of adjusted leave
  // the £10,000 floor, £833.33 a month, which the £8,280 landed is
  // £7,446.67 past, so the month is taxed on the £46,000 and £10,800
  // left of the two and on that £7,446.67, £64,246.67.
  it("charges an owner on what every salary feeding their pensions lands past the allowance", () => {
    const rich: IncomeLine = { ...salary, amount: 600000 };
    const second: IncomeLine = { ...salary, id: 9 };
    const flow = cashFlow(
      [pension],
      { expenses: [], income: [rich, second] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(flow.fed.map((entry) => entry.line)).toStrictEqual([rich, second]);
    expect(flow.taxable).toBeCloseTo(56800 + 8280 - 10000 / 12, 8);
  });

  // £400,000 of salary with nothing sacrificed is £400,000 of threshold
  // income and of adjusted income, £140,000 over £260,000, which would
  // take £70,000 off the £60,000 allowance and so leaves the £10,000
  // floor: a pension paid £5,000 a month has room for the £833.33 a
  // twelfth of that holds, and is paid the £666.67 that lands as it once
  // the basic rate is claimed back, the other £4,333.33 staying in the
  // month.
  it("tapers an owner's pension allowance to the £10,000 floor and holds a fixed sum to a twelfth of it", () => {
    const topped: Account = {
      ...pension,
      contribution: { amount: 5000, cadence: "month", kind: "fixed" },
    };
    const flow = cashFlow(
      [topped],
      { expenses: [], income: [{ ...plain, amount: 400000 }] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.fixed)).toStrictEqual([
      { account: topped, amount: 666.67 },
    ]);
    expect(pennies(flow.relief)).toStrictEqual([
      { account: topped, amount: 166.67 },
    ]);
  });

  // A £200,000 base with a £94,000 bonus and a fifth of the base
  // sacrificed is £294,000 of threshold income, the £40,000 sacrifice
  // counted back in, and £300,000 of adjusted income, the £46,000 the
  // sacrifice lands with the employer's NI on top of the £254,000 paid.
  // Both are over, so the £40,000 over £260,000 takes £20,000 off and
  // the allowance is £40,000, £3,333.33 a month, which the £3,833.33
  // landed is £500 past: the month is taxed on the £21,166.67 paid and
  // that £500, and the pension's own fixed sum finds no room. Sam's
  // pension beside it is under Sam's own allowance, whole on a £36,000
  // salary, so Sam's £2,000 a month is paid in full.
  it("tapers each owner's pension allowance off their own adjusted and threshold income", () => {
    const earner: IncomeLine = {
      ...salary,
      amount: 200000,
      bonus: 94000,
      rsu: 0,
      sacrifice: 0.2,
    };
    const sipp: Account = {
      ...pension,
      contribution: { amount: 2000, cadence: "month", kind: "fixed" },
      id: 7,
      name: "Sam's SIPP",
      owner: sam.id,
    };
    const flow = cashFlow(
      [pension, sipp],
      { expenses: [], income: [earner, { ...plain, id: 9, owner: sam.id }] },
      { at: { month: 0, year: 2026 }, plan },
    );
    const [mine, theirs] = flow.earned;

    expect(flow.fed).toStrictEqual([
      {
        account: pension,
        amount: (40000 * 1.15) / 12,
        line: earner,
        sacrificed: 40000 / 12,
      },
    ]);
    expect(mine?.taxable).toBeCloseTo(254000 / 12 + 500, 8);
    expect(theirs?.taxable).toBe(3000);
    expect(pennies(flow.fixed)).toStrictEqual([
      { account: pension, amount: 0 },
      { account: sipp, amount: 2000 },
    ]);
  });

  // Handed the first owner as having drawn on a pension as income, the
  // month holds their pensions to a twelfth of the £10,000 money
  // purchase allowance, £833.33: the salary's £1,380 is given up whole
  // and is £546.67 past it, which is charged on top of the £10,800 paid,
  // and the pension's own fixed sum finds no room. Sam has not drawn, so
  // Sam's pension keeps the whole £5,000 a month and Sam's £2,000 is
  // paid in full. A month read on its own has nobody drawn, which the
  // first test above pays the pension's fixed sum under.
  it("holds the pensions of an owner who has drawn on one as income to the money purchase allowance", () => {
    const sipp: Account = {
      ...pension,
      contribution: { amount: 2000, cadence: "month", kind: "fixed" },
      id: 7,
      name: "Sam's SIPP",
      owner: sam.id,
    };
    const flow = cashFlow(
      [pension, sipp],
      { expenses: [], income: [salary, { ...plain, id: 9, owner: sam.id }] },
      { at: { month: 0, year: 2026 }, drawn: new Set([working.id]), plan },
    );
    const [mine, theirs] = flow.earned;

    expect(flow.fed).toStrictEqual([
      {
        account: pension,
        amount: (14400 * 1.15) / 12,
        line: salary,
        sacrificed: 1200,
      },
    ]);
    expect(mine?.taxable).toBeCloseTo(10800 + 1380 - 10000 / 12, 8);
    expect(theirs?.taxable).toBe(3000);
    expect(pennies(flow.fixed)).toStrictEqual([
      { account: pension, amount: 0 },
      { account: sipp, amount: 2000 },
    ]);
  });

  // The salary's pension is not listed, so it is earned whole, £7,342.20
  // after its tax. A pension paid £6,000 a month has room for £4,000 of
  // it, which lands as the £5,000 a twelfth of its allowance holds; an
  // ISA paid £30,000 a year is paid the £1,666.67 its allowance gives it
  // a month; and what neither could take passes down to the current
  // account, £1,675.53.
  it("pays a fixed sum only as far as the allowance reaches, passing the rest down", () => {
    const overpaid: Account = {
      ...pension,
      contribution: { amount: 6000, cadence: "month", kind: "fixed" },
      id: 7,
    };
    const oversaved: Account = {
      ...isa,
      contribution: { amount: 30000, cadence: "year", kind: "fixed" },
    };
    const flow = cashFlow(
      [overpaid, oversaved, spareCash],
      { expenses: [], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.fixed)).toStrictEqual([
      { account: overpaid, amount: 4000 },
      { account: oversaved, amount: 1666.67 },
    ]);
    expect(pennies(flow.spare)).toStrictEqual([
      { account: spareCash, amount: 1675.53, cap: null },
    ]);
  });

  // The salary feeds the pension £1,380 a month, which leaves £3,620 of
  // the £5,000 a twelfth of its allowance holds, so the pension's own
  // £5,000 a month is paid £2,896, which lands as that £3,620 once the
  // basic rate is claimed back.
  it("counts what a salary feeds a pension against the fixed sum it is paid", () => {
    const topped: Account = {
      ...pension,
      contribution: { amount: 5000, cadence: "month", kind: "fixed" },
    };
    const flow = cashFlow(
      [topped],
      { expenses: [], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.fixed)).toStrictEqual([
      { account: topped, amount: 2896 },
    ]);
  });

  // An allowance is its owner's, shared across their accounts of the
  // kind. The salary's pension is not listed, so it is earned whole,
  // £7,342.20 after its tax: the first owner's first ISA takes the
  // £1,666.67 their allowance gives them a month and their second finds
  // nothing left, while the second owner's ISA has an allowance of its
  // own and takes the same again, and the current account the £4,008.87
  // after them.
  it("shares an owner's allowance across their accounts of the kind, and gives each owner their own", () => {
    const second: Account = { ...spareIsa, id: 7, name: "Second ISA" };
    const theirs: Account = { ...spareIsa, id: 8, name: "Their ISA", owner: 2 };
    const flow = cashFlow(
      [spareIsa, second, theirs, spareCash],
      { expenses: [], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.spare)).toStrictEqual([
      { account: spareIsa, amount: 1666.67, cap: 20000 },
      { account: second, amount: 0, cap: 20000 },
      { account: theirs, amount: 1666.67, cap: 20000 },
      { account: spareCash, amount: 4008.87, cap: null },
    ]);
  });

  // What one account is fed, paid or handed counts against the room the
  // owner's others of the kind have. The salary feeds the workplace
  // pension £1,380 and its fixed £2,376 lands as £2,970 with the
  // relief, which leaves £650 of the owner's £5,000 a month, so a
  // second pension of theirs paid the spare money takes £520 of the
  // month, which lands as that £650; and an ISA paid its £20,000 a
  // year as a fixed sum leaves a second ISA of the owner's nothing.
  it("counts what one account of an owner's takes against the others of the kind", () => {
    const sipp: Account = {
      ...pension,
      contribution: { cap: null, kind: "spare" },
      id: 7,
      name: "SIPP",
    };
    const second: Account = { ...spareIsa, id: 8, name: "Second ISA" };
    const flow = cashFlow(
      [pension, sipp, isa, second],
      { expenses: [], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.fixed)).toStrictEqual([
      { account: pension, amount: 2376 },
      { account: isa, amount: 1666.67 },
    ]);
    expect(pennies(flow.spare)).toStrictEqual([
      { account: sipp, amount: 520, cap: 60000 },
      { account: second, amount: 0, cap: 20000 },
    ]);
  });

  // £500 a month paid into the pension out of taxed money, against a
  // state pension that covers it, earns no relief of its own: the owner
  // is relieved on £3,600 a year, £300 a month, which is £240 paid and
  // £60 claimed back. A £6,000 salary beside it relieves £500 a month,
  // £400 paid and £100 back, and a £12,000 one the whole £500, £125
  // back. Half that salary sacrificed is not earned, so it relieves £500
  // a month again.
  it("claims the basic rate on no more than the owner's earnings, or £3,600 a year", () => {
    const paying: Account = {
      ...pension,
      contribution: { amount: 500, cadence: "month", kind: "fixed" },
    };
    const state: IncomeLine = { ...statePension, firstYear: 2026 };
    const reliefWith = (lines: readonly IncomeLine[]): CashFlow["relief"] =>
      pennies(
        cashFlow(
          [paying],
          { expenses: [], income: lines },
          { at: { month: 0, year: 2026 }, plan },
        ).relief,
      );

    expect(reliefWith([state])).toStrictEqual([
      { account: paying, amount: 60 },
    ]);
    expect(reliefWith([state, { ...plain, amount: 6000 }])).toStrictEqual([
      { account: paying, amount: 100 },
    ]);
    expect(reliefWith([state, { ...plain, amount: 12000 }])).toStrictEqual([
      { account: paying, amount: 125 },
    ]);
    expect(
      reliefWith([
        state,
        { ...lean, amount: 12000, feeds: paying.id, sacrifice: 0.5 },
      ]),
    ).toStrictEqual([{ account: paying, amount: 100 }]);
  });

  // £120,000 of other income earns nothing, so the pension paid the
  // spare money is relieved on £300 a month: £240 paid lands as £300,
  // and every pound past it lands as a pound, so £4,940 is what lands
  // as the £5,000 the allowance has room for, £60 of it the relief.
  it("lands a pound a pound past what the owner's earnings relieve, up to the allowance", () => {
    const sipp: Account = {
      ...pension,
      contribution: { cap: null, kind: "spare" },
    };
    const flow = cashFlow(
      [sipp],
      { expenses: [], income: [{ ...plain, amount: 120000, kind: "other" }] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.spare)).toStrictEqual([
      { account: sipp, amount: 4940, cap: 60000 },
    ]);
    expect(pennies(flow.relief)).toStrictEqual([{ account: sipp, amount: 60 }]);
  });

  // £2,453.30 after its tax and £1,000 of household leave £1,453.30
  // against the pension's £2,376. Always funded, it is paid whole and
  // the month is £922.70 short, for the projection to draw from the cash
  // and the ISAs; with only £500 in them it is paid the £1,953.30 the
  // month and they have together, and with nothing in them the
  // £1,453.30 the month has, which is all it is paid unmarked.
  it("keeps an always funded pension's fixed sum paid out of the cash and the ISAs", () => {
    const kept: Account = { ...pension, isAlwaysFunded: true };
    const flowOf = (account: Account, reserve?: number): CashFlow =>
      cashFlow(
        [account],
        { expenses: [{ ...household, amount: 1000 }], income: [plain] },
        {
          at: { month: 0, year: 2026 },
          plan,
          ...(reserve !== undefined && { reserve }),
        },
      );

    expect(pennies(flowOf(kept).fixed)).toStrictEqual([
      { account: kept, amount: 2376 },
    ]);
    expect(flowOf(kept).left).toBeCloseTo(-922.70, 2);
    expect(pennies(flowOf(kept, 500).fixed)).toStrictEqual([
      { account: kept, amount: 1953.3 },
    ]);
    expect(flowOf(kept, 500).left).toBeCloseTo(-500, 10);
    expect(pennies(flowOf(kept, 0).fixed)).toStrictEqual([
      { account: kept, amount: 1453.3 },
    ]);
    expect(flowOf(kept, 0).left).toBe(0);
    expect(pennies(flowOf(pension).fixed)).toStrictEqual([
      { account: pension, amount: 1453.3 },
    ]);
  });

  // £3,253.30 of household is £800 more than the month's £2,453.30, so
  // the cash and the ISAs meet that first: with £1,000 in them the
  // pension is kept paid out of the £200 left, and with £500 in them
  // the spending alone runs them out and the pension is paid nothing,
  // rather than draw on a pension to pay one.
  it("meets the spending out of the cash and the ISAs before it keeps a pension paid", () => {
    const kept: Account = { ...pension, isAlwaysFunded: true };
    const flowOf = (reserve: number): CashFlow =>
      cashFlow(
        [kept],
        { expenses: [{ ...household, amount: 3253.3 }], income: [plain] },
        { at: { month: 0, year: 2026 }, plan, reserve },
      );

    expect(pennies(flowOf(1000).fixed)).toStrictEqual([
      { account: kept, amount: 200 },
    ]);
    expect(flowOf(1000).left).toBeCloseTo(-1000, 10);
    expect(flowOf(500).fixed).toStrictEqual([{ account: kept, amount: 0 }]);
    expect(flowOf(500).left).toBeCloseTo(-800, 10);
  });

  // Against £4,000 of household the £60,000 salary covers the month
  // neither way, £3,431.78 with its £600 sacrificed and £3,779.78 earned
  // whole. Always funded, the pension is fed as ever and the month is
  // £568.22 short; with £300 in the cash and the ISAs, which the £220.22
  // the spending is short by leaves only £79.78 of, the sacrifice goes
  // and the month is short by the £220.22 alone.
  it("keeps an always funded pension's sacrifice going in a month short of it", () => {
    const kept: Account = {
      balance: 391640,
      growth: { kind: "plan" },
      id: pension.id,
      isAlwaysFunded: true,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };
    const flowOf = (reserve?: number): CashFlow =>
      cashFlow(
        [kept],
        { expenses: [{ ...household, amount: 4000 }], income: [lean] },
        {
          at: { month: 0, year: 2026 },
          plan,
          ...(reserve !== undefined && { reserve }),
        },
      );

    expect(flowOf().fed).toStrictEqual([
      {
        account: kept,
        amount: (7200 * 1.15) / 12,
        line: lean,
        sacrificed: 600,
      },
    ]);
    expect(flowOf().left).toBeCloseTo(-568.22, 2);
    expect(flowOf(300).fed).toStrictEqual([]);
    expect(flowOf(300).left).toBeCloseTo(-220.22, 2);
  });

  // A salary feeding a pension that is not always funded still gives up
  // its sacrifice only while the month covers itself, and one feeding a
  // pension that is gives it up whatever the month has left. £6,000 of
  // household is more than the two salaries leave either way.
  it("gives up an unmarked pension's sacrifice in a month an always funded one's goes on", () => {
    const kept: Account = {
      balance: 0,
      growth: { kind: "plan" },
      id: pension.id,
      isAlwaysFunded: true,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
    };
    const unmarked: Account = {
      balance: 0,
      growth: { kind: "plan" },
      id: 7,
      kind: "tax-deferred",
      name: "SIPP",
      owner: 1,
    };
    const sipp: Account = { ...unmarked, isAlwaysFunded: true };
    const side: IncomeLine = {
      ...plain,
      amount: 12000,
      feeds: sipp.id,
      id: 9,
      name: "Side job",
      sacrifice: 0.12,
    };
    const flowOf = (accounts: readonly Account[]): CashFlow =>
      cashFlow(
        accounts,
        { expenses: [{ ...household, amount: 6000 }], income: [lean, side] },
        { at: { month: 0, year: 2026 }, plan },
      );

    expect(
      flowOf([kept, unmarked]).fed.map(({ account }) => account),
    ).toStrictEqual([kept]);
    expect(
      flowOf([kept, sipp]).fed.map(({ account }) => account),
    ).toStrictEqual([kept, sipp]);
  });

  // Against £2,000 of household the £60,000 salary leaves £1,431.78 with
  // its £600 sacrificed into a pension that is not always funded, which
  // covers the spending and not the £2,376 the pension that is is
  // kept paid after it. A month short of what it pays feeds nothing but
  // a pension always funded, so the sacrifice goes, the salary is earned
  // whole, and the month is short by what its £1,779.78 leaves of the
  // £2,376, £596.22, rather than £944.22 with the other pension fed.
  // With nothing in the cash and the ISAs the pension is paid only the
  // £1,779.78 the month has, but the sacrifice still goes, rather than
  // stay and leave the pension £1,431.78.
  it("gives up an unmarked pension's sacrifice in a month an always funded pension's fixed sum leaves short", () => {
    const kept: Account = { ...pension, isAlwaysFunded: true };
    const unmarked: Account = {
      balance: 0,
      growth: { kind: "plan" },
      id: 7,
      kind: "tax-deferred",
      name: "SIPP",
      owner: 1,
    };
    const flowOf = (reserve?: number): CashFlow =>
      cashFlow(
        [kept, unmarked],
        {
          expenses: [{ ...household, amount: 2000 }],
          income: [{ ...lean, feeds: unmarked.id }],
        },
        {
          at: { month: 0, year: 2026 },
          plan,
          ...(reserve !== undefined && { reserve }),
        },
      );

    expect(flowOf().fed).toStrictEqual([]);
    expect(pennies(flowOf().fixed)).toStrictEqual([
      { account: kept, amount: 2376 },
    ]);
    expect(flowOf().left).toBeCloseTo(-596.22, 2);
    expect(flowOf(0).fed).toStrictEqual([]);
    expect(pennies(flowOf(0).fixed)).toStrictEqual([
      { account: kept, amount: 1779.78 },
    ]);
    expect(flowOf(0).left).toBe(0);
  });

  // Two salaries feed one owner's pensions past the £5,000 a month of
  // allowance between them: £4,600 from a £48,000 side job given up
  // whole into a pension that is not always funded, and £690 from the
  // £60,000 salary into one that is. Against £10,000 of household the
  // month is short, so only the pension always funded is fed, and it is
  // fed the whole of its sacrifice whichever salary is listed first, the
  // side job's taking none of the room it does not give up.
  it("feeds an always funded pension the room a sacrifice the month gives up leaves, whatever the order", () => {
    const unmarked: Account = {
      balance: 0,
      growth: { kind: "plan" },
      id: 7,
      kind: "tax-deferred",
      name: "SIPP",
      owner: 1,
    };
    const kept: Account = {
      ...unmarked,
      id: pension.id,
      isAlwaysFunded: true,
      name: "Workplace pension",
    };
    const side: IncomeLine = {
      ...plain,
      amount: 48000,
      feeds: unmarked.id,
      id: 9,
      name: "Side job",
      sacrifice: 1,
    };
    const fedOf = (income: readonly IncomeLine[]): CashFlow["fed"] =>
      cashFlow(
        [kept, unmarked],
        { expenses: [{ ...household, amount: 10000 }], income },
        { at: { month: 0, year: 2026 }, plan },
      ).fed;
    const whole = [
      {
        account: kept,
        amount: (7200 * 1.15) / 12,
        line: lean,
        sacrificed: 600,
      },
    ];

    expect(fedOf([side, lean])).toStrictEqual(whole);
    expect(fedOf([lean, side])).toStrictEqual(whole);
  });

  // With nothing spent, the month's £2,453.30 pays the mortgage its
  // £2,180 first, then the pension always funded its £2,376 before
  // the ISA listed above it, which is paid nothing, and the month is
  // £2,102.70 short.
  it("pays an always funded pension after the debts and before any other saving", () => {
    const kept: Account = { ...pension, isAlwaysFunded: true };
    const flow = cashFlow(
      [isa, kept, mortgage],
      { expenses: [], income: [plain] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.fixed)).toStrictEqual([
      { account: mortgage, amount: 2180 },
      { account: kept, amount: 2376 },
      { account: isa, amount: 0 },
    ]);
    expect(flow.left).toBeCloseTo(-2102.7, 2);
  });

  // Only a pension gains by being funded out of the cash and the ISAs,
  // and the store holds the mark to one, so an ISA carrying it is a
  // caller's mistake.
  it("refuses an account always funded that is no pension", () => {
    expect(() =>
      cashFlow(
        [{ ...isa, isAlwaysFunded: true }],
        { expenses: [], income: [plain] },
        { at: { month: 0, year: 2026 }, plan },
      ),
    ).toThrow("Only a pension is always funded");
  });

  // The store holds every ISA and pension to an owner and nothing else
  // to one, so either broken is a caller's mistake: a wrapper's allowance
  // would have nobody to be held to, and an owner on cash says something
  // the engine would ignore. Cash naming none is sound.
  it("refuses an ISA or a pension that names no owner, and anything else that names one", () => {
    const unowned: Account = {
      balance: 0,
      growth: { kind: "plan" },
      id: 9,
      kind: "tax-free",
      name: "Unowned ISA",
    };

    for (const held of [[unowned], [{ ...cash, owner: 1 }]]) {
      expect(() =>
        cashFlow(
          held,
          { expenses: [], income: [plain] },
          { at: { month: 0, year: 2026 }, plan },
        ),
      ).toThrow("An ISA or a pension belongs to an owner, and nothing else");
    }
    expect(() =>
      cashFlow(
        [cash],
        { expenses: [], income: [plain] },
        { at: { month: 0, year: 2026 }, plan },
      ),
    ).not.toThrow();
  });

  // £187,787 a year is £15,648.92 a month, £9,276.13 after £5,892.26 of
  // income tax and £480.53 of NI, less the mortgage £7,096.13, of which
  // the ISA takes £1,666.67, the pension the £2,000 that lands as a
  // twelfth of its cap with the relief on it, and the current account
  // the £3,429.46 left: a month whose figures do not add back in
  // floating point, so what is left is read off the hand-down rather
  // than subtracted from the whole, and is exactly nothing.
  it("leaves exactly nothing when an account takes all there is", () => {
    const flow = cashFlow(
      [spareIsa, sparePension, spareCash, mortgage],
      {
        expenses: [],
        income: [
          {
            ...salary,
            amount: 187787,
            bonus: 0,
            feeds: null,
            rsu: 0,
            sacrifice: 0,
          },
        ],
      },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(pennies(flow.spare).map(({ amount }) => amount)).toStrictEqual([
      1666.67, 2000, 3429.46,
    ]);
    expect(Object.is(flow.left, 0)).toBe(true);
  });

  // £1,752.35 a month after its tax less the mortgage payment and the
  // retirement living is £6,145.98 short; the ISA takes nothing of it
  // and the shortfall is what is left.
  it("pays a spare-money account nothing when the month does not cover its outgoings", () => {
    const flow = cashFlow([spareIsa, spareCash], schedule, {
      at: { month: 0, year: 2053 },
      plan,
    });

    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 0, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(flow.left).toBeCloseTo(-6145.98, 2);
  });

  // The salary feeds no pension listed here, so it is earned whole,
  // £7,342.20 after its tax, and less £3,350 leaves £3,992.20, of which
  // the ISA takes its £1,666.67; the rest stays.
  it("leaves what the accounts do not take", () => {
    const flow = cashFlow(
      [spareIsa],
      { expenses: [household], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 20000 / 12, cap: 20000 },
    ]);
    expect(flow.left).toBeCloseTo(3992.2 - 20000 / 12, 10);
  });

  // The mortgage payment line paying the mortgage makes the line the
  // mortgage's payment, so the mortgage's own contribution is left out of
  // the month's fixed sums and the payment is counted once, as the line.
  // The salary runs, so the £6,706.20 a month it leaves after the
  // £1,200 sacrificed and the tax on the rest, less the line's £3,065,
  // covers the pension's sum whole and what is left out is read off the
  // mortgage rather than off a month too thin to pay.
  it("leaves a loan a line pays out of the fixed sums", () => {
    const flow = cashFlow(
      [pension, mortgage],
      {
        expenses: [{ ...mortgagePayment, pays: mortgage.id }],
        income: [salary],
      },
      { at: { month: 0, year: 2040 }, plan },
    );

    expect(flow.fixed).toStrictEqual([{ account: pension, amount: 2376 }]);
    expect(flow.expenses).toBe(3065);
  });

  // A month of the debts below, against the £2,453.30 the plain salary
  // leaves after its tax and nothing going out, so what the month
  // states is the debt's own sum and what the ISA beside it takes is
  // the rest.
  const owed = (held: readonly Account[], at: Month): CashFlow =>
    cashFlow(held, { expenses: [], income: [plain] }, { at, plan });

  // A £5,000 card at 22% paying £250 a month is cleared by its 26th
  // payment, which from January 2026 falls in February 2028: the sum is
  // charged whole through January 2028, and in February only the £35.72
  // that clears it, the £35.08 the 25 payments before leave with the
  // month's interest on it, and nothing after, so the card costs
  // £6,285.72 rather than the £6,500 of 26 whole payments or the £90,000
  // thirty years of it would. The £214.28 February does not pay the card
  // is left with the rest, and the month after, the £250 is the ISA's to
  // take.
  it("charges a debt's fixed sum to the month its payments clear it, what clears it in that month, and no further", () => {
    const card: Account = {
      balance: -5000,
      contribution: { amount: 250, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0.22 },
      id: 6,
      kind: "debt",
      name: "Credit card",
    };
    const held = [card, spareIsa];

    expect(owed(held, { month: 0, year: 2026 }).fixed).toStrictEqual([
      { account: card, amount: 250 },
    ]);
    expect(owed(held, { month: 0, year: 2028 }).fixed).toStrictEqual([
      { account: card, amount: 250 },
    ]);
    const [cleared] = owed(held, { month: 1, year: 2028 }).fixed;
    expect(cleared?.account).toBe(card);
    expect(cleared?.amount).toBeCloseTo(35.72, 2);
    expect(owed(held, { month: 2, year: 2028 }).fixed).toStrictEqual([]);
    expect(owed(held, { month: 1, year: 2028 }).spare).toStrictEqual([
      { account: spareIsa, amount: 20000 / 12, cap: 20000 },
    ]);
    expect(owed(held, { month: 1, year: 2028 }).left).toBeCloseTo(750.91, 2);
    expect(owed(held, { month: 2, year: 2028 }).left).toBeCloseTo(786.63, 2);
  });

  // A card already cleared with its £250 still set, and a PCP down to
  // the £6,000 balloon its payments leave, owe nothing the payments are
  // for, so neither states a sum even in the plan's first month, where
  // the one payment a term of nothing counts would land on nothing.
  it("charges a debt owing no more than its balloon nothing", () => {
    const cleared: Account = {
      balance: 0,
      contribution: { amount: 250, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0.22 },
      id: 6,
      kind: "debt",
      name: "Credit card",
    };
    const pcp: Account = {
      balance: -6000,
      balloon: 6000,
      contribution: { amount: 290, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0.079 },
      id: 7,
      kind: "debt",
      name: "Car finance",
    };

    expect(owed([cleared, pcp], { month: 0, year: 2026 }).fixed).toStrictEqual(
      [],
    );
  });

  // £1,200 at no rate paying £100 a month spreads flat over twelve
  // payments, so the last falls in December 2026 and January 2027 is
  // charged nothing: a term that is a whole number of months ends on
  // the month itself rather than a payment either side of it.
  it("ends a debt at no rate on the month the flat payments reach", () => {
    const owing: Account = {
      balance: -1200,
      contribution: { amount: 100, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0 },
      id: 6,
      kind: "debt",
      name: "Interest-free credit",
    };
    const charged = { account: owing, amount: 100 };

    expect(owed([owing], { month: 10, year: 2026 }).fixed).toStrictEqual([
      charged,
    ]);
    expect(owed([owing], { month: 11, year: 2026 }).fixed).toStrictEqual([
      charged,
    ]);
    expect(owed([owing], { month: 0, year: 2027 }).fixed).toStrictEqual([]);
  });

  // A debt carried on the plan rate is charged at the plan rate: at the
  // plan's five per cent £250 a month clears £5,000 with its 21st
  // payment, September 2027, a payment of £231.59, where the same
  // payment against no interest at all would have been done in August.
  it("works a debt on the plan rate out at the plan's rate", () => {
    const owing: Account = {
      balance: -5000,
      contribution: { amount: 250, cadence: "month", kind: "fixed" },
      growth: { kind: "plan" },
      id: 6,
      kind: "debt",
      name: "Overdraft",
    };
    const charged = { account: owing, amount: 250 };

    expect(owed([owing], { month: 7, year: 2027 }).fixed).toStrictEqual([
      charged,
    ]);
    const [last] = owed([owing], { month: 8, year: 2027 }).fixed;
    expect(last?.account).toBe(owing);
    expect(last?.amount).toBeCloseTo(231.59, 2);
    expect(owed([owing], { month: 9, year: 2027 }).fixed).toStrictEqual([]);
  });

  // A £12,000 loan at 10% paying £6,000 a year is paid a twelfth of it,
  // £500, a month, and 27 of them clear it: the 26 before the last leave
  // £440.85 owing, which the month's interest takes to £444.53, and that
  // is charged in March 2028 rather than the £500, with nothing in
  // April.
  it("charges a yearly debt sum a twelfth a month, and what clears it in the month the last twelfth falls", () => {
    const loan: Account = {
      balance: -12000,
      contribution: { amount: 6000, cadence: "year", kind: "fixed" },
      growth: { kind: "fixed", rate: 0.1 },
      id: 6,
      kind: "debt",
      name: "Loan",
    };
    const [last] = owed([loan], { month: 2, year: 2028 }).fixed;

    expect(owed([loan], { month: 1, year: 2028 }).fixed).toStrictEqual([
      { account: loan, amount: 500 },
    ]);
    expect(last?.account).toBe(loan);
    expect(last?.amount).toBeCloseTo(444.53, 2);
    expect(owed([loan], { month: 3, year: 2028 }).fixed).toStrictEqual([]);
  });

  // The mortgage's £3,065 a month, paid as a line from the plan's first
  // year, clears the £176,520 owed at 4.85% with its 66th payment, June
  // 2031: the 65 before it leave £2,111.06 owing, which the month's
  // interest takes to £2,119.59, and that is what the line costs the
  // month rather than its £3,065, the loan saying what its last payment
  // is as it does for a debt paying its own sum. In every other month
  // the line costs what it states: May 2031, and July 2031 too for a
  // line left running past the loan, which the household never leaves
  // but a caller may. A line of £700 a month, less than the £713.44 of
  // interest, never clears the loan and costs what it states in every
  // month.
  it("charges a line paying a loan what clears the loan in the month its payments do, and what it states in every other", () => {
    const paying: ExpenseLine = {
      ...mortgagePayment,
      firstYear: 2026,
      lastYear: null,
      pays: mortgage.id,
    };
    const costs = (line: ExpenseLine, at: Month): number =>
      cashFlow([mortgage], { expenses: [line], income: [] }, { at, plan })
        .expenses;

    expect(costs(paying, { month: 4, year: 2031 })).toBe(3065);
    expect(costs(paying, { month: 5, year: 2031 })).toBeCloseTo(2119.59, 2);
    expect(costs(paying, { month: 6, year: 2031 })).toBe(3065);
    expect(costs({ ...paying, amount: 700 }, { month: 5, year: 2031 })).toBe(
      700,
    );
  });

  // £50 a month against £5,000 at 22% is less than the £91.67 of
  // interest the month adds, so the payments never clear it and there
  // is no month to stop charging them in. The action refuses to save
  // such a debt, so one that reached here is a caller's mistake.
  it("refuses a debt its payments never clear", () => {
    const card: Account = {
      balance: -5000,
      contribution: { amount: 50, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0.22 },
      id: 6,
      kind: "debt",
      name: "Credit card",
    };

    expect(() => owed([card], { month: 0, year: 2026 })).toThrow(
      "A debt's payments end",
    );
  });

  // The household ending in March 2051 runs through March and not
  // April, while one ending in the year alone runs the whole of it; a
  // line whose last year is ahead runs in every month, and an income
  // line ends in a month the same way.
  it("runs a line in its last year to the month it ends in, or through the whole of it", () => {
    const [, , , ...none] = accounts;
    const ending = { ...household, lastMonth: 2 };
    const ended = { ...salary, lastMonth: 5, lastYear: 2030 };
    const at = (month: number, year: number): number =>
      cashFlow(
        none,
        { expenses: [ending], income: [ended] },
        { at: { month, year }, plan },
      ).expenses;

    expect(at(2, 2051)).toBe(3350);
    expect(at(3, 2051)).toBe(0);
    expect(at(11, 2050)).toBe(3350);
    expect(
      cashFlow(
        none,
        { expenses: [household], income: [] },
        { at: { month: 11, year: 2051 }, plan },
      ).expenses,
    ).toBe(3350);
    expect(
      cashFlow(
        none,
        { expenses: [], income: [ended] },
        { at: { month: 5, year: 2030 }, plan },
      ).income,
    ).toBe(12000);
    expect(
      cashFlow(
        none,
        { expenses: [], income: [ended] },
        { at: { month: 6, year: 2030 }, plan },
      ).income,
    ).toBe(0);
  });

  // The link is held to a pension by the action, so a salary feeding
  // the ISA, the current account or the mortgage is a caller's mistake,
  // whatever share it gives up.
  it("refuses a salary feeding an account that is no pension", () => {
    for (const account of [isa, cash, mortgage]) {
      expect(() =>
        cashFlow(
          [account],
          { expenses: [], income: [{ ...salary, feeds: account.id }] },
          { at: { month: 0, year: 2026 }, plan },
        ),
      ).toThrow("A salary feeds a pension alone");
      expect(() =>
        cashFlow(
          [account],
          {
            expenses: [],
            income: [{ ...salary, feeds: account.id, sacrifice: 0 }],
          },
          { at: { month: 0, year: 2026 }, plan },
        ),
      ).toThrow("A salary feeds a pension alone");
    }
  });

  // A share of the base is held between none of it and all of it by the
  // action, so one outside is a caller's mistake: below nothing, the
  // room divided by a feed below nothing came out as the whole room fed
  // from nothing given up, and past the whole the salary gave up pay it
  // never paid. Refused whether or not the pension is listed, and all of
  // the base or none of it is sound.
  it("refuses a salary giving up less than none of its base or more than all of it", () => {
    for (const sacrifice of [-0.1, 1.5, Number.NaN]) {
      for (const held of [[pension], []]) {
        expect(() =>
          cashFlow(
            held,
            { expenses: [], income: [{ ...salary, sacrifice }] },
            { at: { month: 0, year: 2026 }, plan },
          ),
        ).toThrow("A salary gives up a share of its base");
      }
    }
    for (const sacrifice of [0, 1]) {
      expect(() =>
        cashFlow(
          [pension],
          { expenses: [], income: [{ ...salary, sacrifice }] },
          { at: { month: 0, year: 2026 }, plan },
        ),
      ).not.toThrow();
    }
  });

  // The share an employer matches is held the same way, in words of its
  // own: below nothing it would take back out of the pension what the
  // sacrifice put in.
  it("refuses a salary matched less than none of its base or more than all of it", () => {
    for (const match of [-0.1, 1.5, Number.NaN]) {
      expect(() =>
        cashFlow(
          [pension],
          { expenses: [], income: [{ ...salary, match }] },
          { at: { month: 0, year: 2026 }, plan },
        ),
      ).toThrow("An employer matches a share of the base");
    }
    for (const match of [0, 1]) {
      expect(() =>
        cashFlow(
          [pension],
          { expenses: [], income: [{ ...salary, match }] },
          { at: { month: 0, year: 2026 }, plan },
        ),
      ).not.toThrow();
    }
  });

  // A line naming an account that is no debt would drop that account's
  // fixed sum from the month, the line standing in for a payment the
  // account never makes, so the ISA's £20,000 a year would leave the
  // ledger and land nowhere. The action holds the link to a loan, so
  // one that reached here is a caller's mistake, whatever the line
  // costs.
  it("refuses an expense line paying an account that is no debt", () => {
    for (const account of [pension, isa, cash, home]) {
      expect(() =>
        cashFlow(
          [account],
          { expenses: [{ ...household, pays: account.id }], income: [plain] },
          { at: { month: 0, year: 2026 }, plan },
        ),
      ).toThrow("A line pays a debt alone");
    }
  });

  // Both links are read over the whole schedule rather than over the
  // lines running this month, so a plan carrying one is refused wherever
  // it is read: the salary ended in 2052 and is refused in 2053, and a
  // line that starts in 2040 is refused in 2026. Checked in the months
  // they run alone, the projection would throw part way through the
  // years while the month a screen shows stayed green.
  it("refuses a link the schedule holds in a month the line is not running", () => {
    const feeding = { ...salary, feeds: isa.id };
    const paying = { ...household, firstYear: 2040, pays: isa.id };

    expect(() =>
      cashFlow(
        [isa],
        { expenses: [], income: [feeding] },
        { at: { month: 0, year: 2053 }, plan },
      ),
    ).toThrow("A salary feeds a pension alone");
    expect(() =>
      cashFlow(
        [isa],
        { expenses: [paying], income: [] },
        { at: { month: 0, year: 2026 }, plan },
      ),
    ).toThrow("A line pays a debt alone");
  });

  // A line paying a loan the plan does not list pays nothing off it and
  // drops no account's sum, as a salary feeding a pension it does not
  // list is earned whole: £7,342.20 a month after its tax less the
  // household's £3,350 leaves the ISA its £1,666.67.
  it("leaves an expense line paying an account that is not listed alone", () => {
    const flow = cashFlow(
      [isa],
      { expenses: [{ ...household, pays: 99 }], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(flow.fixed).toStrictEqual([{ account: isa, amount: 20000 / 12 }]);
  });

  // The store hands out an id an account, so two entries sharing one
  // are a caller's mistake: the ISA listed twice is paid its £1,666.67
  // twice over in the one month, and the plan card reads the month
  // straight from here, so the list is refused wherever it is read
  // rather than only where a year is carried. Refused on the id, so two
  // accounts that share one go with the one account listed again, and
  // two accounts with ids of their own are left alone.
  it("refuses an account the plan lists twice", () => {
    const twin: Account = { ...isa, name: "Twin ISA" };

    for (const held of [
      [isa, isa],
      [isa, twin],
    ]) {
      expect(() =>
        cashFlow(
          held,
          { expenses: [], income: [plain] },
          { at: { month: 0, year: 2026 }, plan },
        ),
      ).toThrow("An account is listed once");
    }
    expect(() =>
      cashFlow(
        [isa, { ...twin, id: 9 }],
        { expenses: [], income: [plain] },
        { at: { month: 0, year: 2026 }, plan },
      ),
    ).not.toThrow();
  });

  it("refuses to hand the spare money to a real asset or a debt", () => {
    const spareHome: Account = {
      ...home,
      contribution: { cap: null, kind: "spare" },
    };

    expect(() =>
      cashFlow([spareHome], schedule, { at: { month: 0, year: 2026 }, plan }),
    ).toThrow("A real asset or a debt takes no spare money");
  });

  // What the tax year before refunds comes into the month untaxed, as
  // money it has, so the ISA takes the £838; and what it still owes
  // goes out of it, so a month with nothing else is short by the £500.
  // A month read on its own settles nothing.
  it("adds what the tax year before settles to the month's money", () => {
    const at = { month: 3, year: 2027 };
    const nothing = { expenses: [], income: [] };

    expect(
      cashFlow([spareIsa], nothing, { at, plan, settlement: 838 }).spare,
    ).toStrictEqual([{ account: spareIsa, amount: 838, cap: 20000 }]);
    expect(
      cashFlow([spareIsa], nothing, { at, plan, settlement: -500 }).left,
    ).toBe(-500);
    expect(cashFlow([spareIsa], nothing, { at, plan }).left).toBe(0);
  });

  // £0.30 a month against £0.10 and £0.20 covers itself to the penny
  // and leaves −5.55e-17 in binary, which the projection would read as
  // a month to sell savings for, every month of the plan. What is left
  // is exactly nothing, sign and all.
  it("reads a shortfall smaller than a nanopound as nothing at all", () => {
    const flow = cashFlow(
      [],
      {
        expenses: [
          { ...household, amount: 0.1 },
          { ...childcare, amount: 0.2, firstYear: 2026 },
        ],
        income: [{ ...plain, amount: 0.3, cadence: "month" }],
      },
      { at: { month: 0, year: 2026 }, plan },
    );

    expect(0.3 - (0.1 + 0.2)).toBeLessThan(0);
    expect(Object.is(flow.left, 0)).toBe(true);
  });

  // At 3% a year from January 2026, a year on the household's £3,350 a
  // month is paid 3% more with inflation, 4% and 5% more a point or two
  // over it, and the same fixed in nominal terms; half a year on, each
  // rise is compounded to the month. In the plan's first month every
  // line pays what it states.
  it("pays each line risen as its growth says from the month the plan starts in", () => {
    const rising = { ...plan, inflation: 0.03 };
    const lines = (
      ["inflation", "inflation-plus-1", "inflation-plus-2", "nominal"] as const
    ).map((growth, index) => ({ ...household, growth, id: index + 1 }));
    const spentIn = (at: Month): number[] =>
      pennies(
        cashFlow([], { expenses: lines, income: [] }, { at, plan: rising })
          .spent,
      ).map(({ amount }) => amount);

    expect(spentIn({ month: 0, year: 2026 })).toStrictEqual([
      3350, 3350, 3350, 3350,
    ]);
    expect(spentIn({ month: 6, year: 2026 })).toStrictEqual([
      3399.88, 3416.34, 3432.73, 3350,
    ]);
    expect(spentIn({ month: 0, year: 2027 })).toStrictEqual([
      3450.5, 3484, 3517.5, 3350,
    ]);
  });

  // A loan's payment is the one sum for every month of its term, so the
  // mortgage's £3,065 is paid as it states in 2040 at 3% a year, though
  // the line says it rises two points over prices, where a line paying
  // no loan saying so would be paid 5% more a year.
  it("pays a line paying a loan fixed in nominal terms, whatever it says", () => {
    const flow = cashFlow(
      [mortgage],
      {
        expenses: [
          { ...mortgagePayment, growth: "inflation-plus-2", pays: mortgage.id },
        ],
        income: [],
      },
      { at: { month: 0, year: 2040 }, plan: { ...plan, inflation: 0.03 } },
    );

    expect(flow.expenses).toBe(3065);
  });

  // Read from April 2026 at 3%, a salary rising with prices is paid 3%
  // more a year on, against bands still frozen, so it pays a larger
  // share of itself in income tax. From April 2030, a year on is April
  // 2031, when the freeze ends and the bands rise 3% with the salary, so
  // the month pays 3% more of each tax and no larger a share.
  it("taxes a month against the bands of its tax year, frozen to April 2031 and risen with prices after", () => {
    const earning: Schedule = {
      expenses: [],
      income: [{ ...plain, amount: 60000, growth: "inflation" }],
    };
    const aYearOn = (from: number): readonly [CashFlow, CashFlow] => {
      const rising = { ...plan, from, inflation: 0.03, month: 3 };
      return [
        cashFlow([], earning, { at: { month: 3, year: from }, plan: rising }),
        cashFlow([], earning, {
          at: { month: 3, year: from + 1 },
          plan: rising,
        }),
      ];
    };
    const [frozen, dragged] = aYearOn(2026);
    const [last, first] = aYearOn(2030);

    expect(dragged.income).toBeCloseTo(frozen.income * 1.03, 9);
    expect(dragged.incomeTax / dragged.income).toBeGreaterThan(
      frozen.incomeTax / frozen.income,
    );
    expect(first.income).toBeCloseTo(last.income * 1.03, 9);
    expect(first.incomeTax).toBeCloseTo(last.incomeTax * 1.03, 9);
    expect(first.insurance).toBeCloseTo(last.insurance * 1.03, 9);
  });

  // Prices falling by everything leave nothing to read a pound of
  // today's money against, and falling by more, or rising by no finite
  // rate, leave no figure at all after the plan's first month.
  it("refuses a plan whose prices fall by everything, or whose inflation is no finite rate", () => {
    for (const inflation of [-1, -1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        cashFlow([], schedule, {
          at: { month: 0, year: 2026 },
          plan: { ...plan, inflation },
        }),
      ).toThrow("Inflation is a rate, and prices fall by less than everything");
    }
  });

  it("finds nothing in a year with no lines and no accounts", () => {
    expect(
      cashFlow([], schedule, { at: { month: 0, year: 2025 }, plan }),
    ).toStrictEqual({
      earned: [],
      expenses: 0,
      fed: [],
      fixed: [],
      income: 0,
      incomeTax: 0,
      insurance: 0,
      left: 0,
      profit: 0,
      relief: [],
      spare: [],
      spent: [],
      taxable: 0,
    });
  });
});

describe("inTodaysMoney", () => {
  // A year on at 3%, prices have risen by 3% exactly. The salary and the
  // household's £1,000, rising with them, read at what they state, and
  // so does the 12% of the base given up; the mortgage's £2,180,
  // fixed in nominal terms, reads 3% smaller; every other sum the month
  // worked out is read the same way; and each cap is left as it is
  // stated, the ISA's £20,000 and the current account's none.
  it("reads every figure of a month in today's money", () => {
    const reading = {
      at: { month: 0, year: 2027 },
      plan: { ...plan, inflation: 0.03 },
    };
    const flow = cashFlow(
      [pension, spareIsa, spareCash, mortgage],
      {
        expenses: [{ ...household, amount: 1000, growth: "inflation" }],
        income: [{ ...lean, growth: "inflation" }],
      },
      reading,
    );
    const read = inTodaysMoney(flow, reading);

    expect(read.income).toBeCloseTo(5000, 9);
    expect(read.fed[0]?.sacrificed).toBeCloseTo(600, 9);
    expect(read.spent.map(({ amount }) => Math.round(amount))).toStrictEqual([
      1000,
    ]);
    expect(read.fixed.map(({ account }) => account)).toStrictEqual([
      mortgage,
      pension,
    ]);
    expect(read.fixed[0]?.amount).toBeCloseTo(2180 / 1.03, 9);
    expect(read.spare.map(({ cap }) => cap)).toStrictEqual([20000, null]);
    expect(read.relief).toHaveLength(1);
    for (const [was, is] of [
      [flow.expenses, read.expenses],
      [flow.fed[0]?.amount, read.fed[0]?.amount],
      [flow.fixed[1]?.amount, read.fixed[1]?.amount],
      [flow.incomeTax, read.incomeTax],
      [flow.insurance, read.insurance],
      [flow.left, read.left],
      [flow.profit, read.profit],
      [flow.relief[0]?.amount, read.relief[0]?.amount],
      [flow.spare[0]?.amount, read.spare[0]?.amount],
      [flow.taxable, read.taxable],
    ]) {
      expect(is).toBeCloseTo((was ?? Number.NaN) / 1.03, 9);
    }
  });
});

describe("totalsOf", () => {
  // In January 2026 the salary's £12,000 comes in. £1,200 of it is
  // sacrificed into the pension, £3,710.25 of income tax and £383.55 of
  // NI go on the rest, the household's £3,350 goes out and the mortgage
  // takes its £2,180 whole, being owed, and the pension the £1,176.20
  // left of its fixed sum: £9,623.80 out for good and £2,376.20 put by,
  // which is all £12,000, with nothing drawn.
  it("sums a month into what came in, went out, was put by and was drawn", () => {
    const flow = cashFlow(
      [pension, spareIsa, spareCash, mortgage],
      { expenses: [household], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );
    const totals = totalsOf(flow);

    expect(totals.income).toBe(12000);
    expect(totals.out).toBeCloseTo(9623.8, 2);
    expect(totals.saved).toBeCloseTo(2376.2, 2);
    expect(totals.drawn).toBe(0);
  });

  // A month that takes nothing, as one with no account, counts what is
  // left as gone, since the plan takes it as spent, and one short draws
  // what it is short by: the retirement living's £4,833.33 with nothing
  // in.
  it("counts what no saving takes as out, and what the month is short by as drawn", () => {
    const left = totalsOf(
      cashFlow(
        [],
        { expenses: [], income: [plain] },
        { at: { month: 0, year: 2026 }, plan },
      ),
    );
    const short = totalsOf(
      cashFlow(
        [],
        { expenses: [retirement], income: [] },
        { at: { month: 0, year: 2053 }, plan },
      ),
    );

    expect(left.out).toBe(left.income);
    expect(left.saved).toBe(0);
    expect(short).toStrictEqual({
      drawn: 58000 / 12,
      income: 0,
      out: 58000 / 12,
      saved: 0,
    });
  });
});
