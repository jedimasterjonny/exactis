// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Month } from "@/data/schedule";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";

import type { CashFlow } from "./cash-flow";

import { cashFlow } from "./cash-flow";

const [pension, isa, cash, home, mortgage] = accounts;
const [salary, stepUp, consulting, statePension] = incomeLines;
const [household, childcare, mortgagePayment, retirement, care] = expenseLines;

const schedule = { expenses: expenseLines, income: incomeLines };

// Read at the start of 2026, so a debt's payments are counted from
// January and the months a month is charged for are read off there.
const plan = { born: 1990, from: 2026, month: 0, rate: 0.05, years: 53 };

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
// with a tenth of it still going into the pension, which leaves
// £3,489.78 after £752.67 of income tax and £257.55 of NI on the
// £54,000 a year left of it, or £3,779.78 earned whole, after £952.67
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
  // 2026 runs the salary alone, £147,000 a year with its parts, so
  // £12,250 a month, of which a tenth of the £120,000 base, £1,000 a
  // month, is sacrificed into the pension and lands there as £1,150
  // with the NI saved. The £135,000 a year left is past the allowance's
  // withdrawal, so it pays £46,953 of income tax, £3,912.75 a month,
  // and £4,710.60 of NI, £392.55, leaving £6,944.70 against the
  // household's £3,500 a month. The pension's £27,195 a year is
  // £2,266.25 a month and is paid whole, and the ISA's £20,000 is
  // £1,666.67 and takes the £1,178.45 left, so the mortgage's £2,210 is
  // paid nothing and nothing is left.
  it("takes this year's lines a month at a time, less every sacrifice, the tax on the rest and the fixed sums", () => {
    const flow = cashFlow(accounts, schedule, {
      at: { month: 0, year: 2026 },
      plan,
    });

    expect(flow.income).toBe(12250);
    expect(flow.fed).toStrictEqual([
      {
        account: pension,
        amount: (12000 * 1.15) / 12,
        line: salary,
        sacrificed: 1000,
      },
    ]);
    expect(flow.incomeTax).toBeCloseTo(3912.75, 10);
    expect(flow.insurance).toBeCloseTo(392.55, 10);
    expect(flow.expenses).toBe(3500);
    expect(flow.spent).toStrictEqual([{ amount: 3500, line: household }]);
    expect(pennies(flow.fixed)).toStrictEqual([
      { account: pension, amount: 2266.25 },
      { account: isa, amount: 1178.45 },
      { account: mortgage, amount: 0 },
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
    expect(flow.incomeTax).toBeCloseTo(2356, 10);
    expect(flow.insurance).toBeCloseTo(293.35, 10);
    expect(flow.left).toBeCloseTo(8450 - 2356 - 293.35, 10);
  });

  // £3,489.78 a month after the sacrifice and the tax on the rest, less
  // £2,500 of expenses, leaves £989.78, which is all the pension's
  // £2,266.25 can be paid: the sum is trimmed to what the month has
  // rather than drawn out of a wrapper, and the £575 the salary feeds
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
        amount: (6000 * 1.15) / 12,
        line: lean,
        sacrificed: 500,
      },
    ]);
    expect(pennies(flow.fixed)).toStrictEqual([
      { account: pension, amount: 989.78 },
    ]);
    expect(flow.left).toBe(0);
  });

  // £2,453.30 a month after its tax against the pension's £2,266.25 and
  // the ISA's £1,666.67: listed first the pension is paid whole and the
  // ISA takes the £187.05 left, and listed first the ISA is paid whole
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
      { account: pension, amount: 2266.25 },
      { account: isa, amount: 187.05 },
    ]);
    expect(flow.left).toBe(0);
    expect(pennies(reversed.fixed)).toStrictEqual([
      { account: isa, amount: 1666.67 },
      { account: pension, amount: 786.63 },
    ]);
    expect(reversed.left).toBe(0);
  });

  // 2049's consulting is £2,000 a month, £1,752.35 after £190.50 of
  // income tax and £57.15 of Class 4 NI, against the mortgage payment
  // and the retirement living, £8,201: the pension is paid nothing,
  // still listed at what it had, and the month is short by the
  // £6,448.65 of expenses the income does not cover and by nothing
  // else, the sum it could not pay adding nothing to it. The mortgage
  // states no sum by then at all, its £2,210 a month having cleared the
  // £182,940 it owes in July 2034, so it is out of the ledger rather
  // than listed at nothing for another thirty years.
  it("pays no fixed sum at all when the expenses alone outrun the income", () => {
    const flow = cashFlow([pension, mortgage], schedule, {
      at: { month: 0, year: 2049 },
      plan,
    });

    expect(flow.fixed).toStrictEqual([{ account: pension, amount: 0 }]);
    expect(flow.left).toBeCloseTo(-6448.65, 10);
  });

  // £5,000 a month with a tenth of its £60,000 base sacrificed leaves
  // £3,489.78 after the tax, and earned whole £3,779.78, so the £500
  // costs the month £290 once the tax saved on it is counted. Against
  // £3,400 of expenses the month covers itself with the £500 gone and
  // the pension is fed as ever, £89.78 left; against £3,700 it covers
  // itself only by keeping the £500, so the salary is earned and taxed
  // whole, the pension is fed nothing and £79.78 is left; and against
  // £4,000 it covers itself neither way, so the month is short by the
  // £220.22 the whole income does not cover rather than by the £510.22
  // a sacrifice on top of it would leave. A sacrifice the month cannot
  // afford would be a drawdown by another name, and the pension would
  // be fed in the very month a wrapper is sold to cover the spending.
  it("sacrifices nothing at all in a month the income would not cover the expenses", () => {
    const unpaid: Account = {
      balance: 412880,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
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
        amount: (6000 * 1.15) / 12,
        line: lean,
        sacrificed: 500,
      },
    ]);
    expect(against(3400).left).toBeCloseTo(89.78, 2);
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
  // £989.78 month is taken whole by the pension's trimmed sum, so the
  // ISA and the current account take nothing, while the £2,453.30 month
  // leaves the £187.05 the pension did not take for the ISA, and
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
      { account: pension, amount: 989.78 },
    ]);
    expect(short.spare).toStrictEqual([
      { account: spareIsa, amount: 0, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(short.left).toBe(0);
    expect(pennies(wide.spare)).toStrictEqual([
      { account: spareIsa, amount: 187.05, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(wide.left).toBe(0);
  });

  // The salary's £1,000 a month comes off the month whether or not the
  // pension is paid a fixed sum of its own, and is not the pension's
  // own sum, leaving £6,944.70 after the tax on the rest; a salary
  // naming a pension not among the accounts is earned whole, £7,474.70
  // after £4,362.75 of income tax and £412.55 of NI on all £147,000,
  // and a line giving up nothing feeds nothing whichever pension it
  // names.
  it("feeds the pension a salary names when it is among the accounts", () => {
    const unpaid: Account = {
      balance: 412880,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
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
        amount: (12000 * 1.15) / 12,
        line: salary,
        sacrificed: 1000,
      },
    ]);
    expect(fed.fixed).toStrictEqual([]);
    expect(fed.left).toBeCloseTo(6944.7, 10);
    expect(unlisted.fed).toStrictEqual([]);
    expect(unlisted.left).toBeCloseTo(7474.7 - 20000 / 12, 10);
    expect(nothing.fed).toStrictEqual([]);
    expect(nothing.left).toBeCloseTo(7474.7 - 2266.25, 10);
  });

  // The feed runs with the line: before its first year, and after the
  // month it ends in, the pension is fed nothing and the month is
  // short by nothing, though the pension is listed and the line names
  // it.
  it("stops feeding the pension when the salary is not running", () => {
    const unpaid: Account = {
      balance: 412880,
      growth: { kind: "plan" },
      id: pension.id,
      kind: "tax-deferred",
      name: "Workplace pension",
    };
    const ending = { ...salary, lastMonth: 5, lastYear: 2030 };
    const flowAt = (income: IncomeLine, at: Month): CashFlow =>
      cashFlow([unpaid], { expenses: [], income: [income] }, { at, plan });

    expect(flowAt(salary, { month: 0, year: 2049 }).fed).toStrictEqual([]);
    expect(flowAt(salary, { month: 0, year: 2049 }).left).toBe(0);
    expect(flowAt(salary, { month: 11, year: 2025 }).fed).toStrictEqual([]);
    expect(flowAt(ending, { month: 6, year: 2030 }).fed).toStrictEqual([]);
    expect(flowAt(ending, { month: 6, year: 2030 }).left).toBe(0);
    expect(flowAt(ending, { month: 5, year: 2030 }).fed).toHaveLength(1);
    expect(flowAt(ending, { month: 5, year: 2030 }).left).toBeCloseTo(
      6944.7,
      10,
    );
  });

  // 2035 runs both salaries, £147,000 and £168,000 a year, against the
  // household and the childcare; 2049 the consulting's £2,000 a month
  // against the mortgage payment and the retirement living's £60,000 a
  // year, since the salaries ended in 2048, the childcare in 2035 and
  // the household in 2047; and 2079, the plan's last year, the state
  // pension alone against the two open-ended lines.
  it("runs a line from its first year to its last, or to the end when it has none", () => {
    const [, , , ...none] = accounts;
    const earlier = cashFlow(none, schedule, {
      at: { month: 0, year: 2035 },
      plan,
    });
    const later = cashFlow(none, schedule, {
      at: { month: 0, year: 2049 },
      plan,
    });
    const last = cashFlow(none, schedule, {
      at: { month: 0, year: 2079 },
      plan,
    });

    expect(earlier.income).toBe(26250);
    expect(earlier.expenses).toBe(4650);
    expect(later.income).toBe(2000);
    expect(later.expenses).toBe(8201);
    expect(last.income).toBe(1950);
    expect(last.expenses).toBeCloseTo(7333.33, 2);
    expect([salary, stepUp, consulting, statePension]).toHaveLength(4);
    expect([
      household,
      childcare,
      mortgagePayment,
      retirement,
      care,
    ]).toHaveLength(5);
  });

  // £6,944.70 after the £1,000 sacrificed and the tax on the rest, less
  // the mortgage's £2,210, leaves £4,734.70 with nothing going out; the
  // ISA takes £1,666.67, a twelfth of its allowance; the pension has
  // £1,350 of room, a twelfth of its cap less the £1,150 the salary
  // already feeds it, and takes £1,080 of the month, which lands as
  // that £1,350 once the basic rate is claimed back on it; and the
  // current account takes the £1,988.03 left, leaving nothing.
  it("hands the spare money down the accounts that take it, each to a twelfth of its cap", () => {
    const flow = cashFlow(
      [spareIsa, sparePension, spareCash, home, mortgage],
      { expenses: [], income: [salary] },
      { at: { month: 0, year: 2026 }, plan },
    );
    expect(flow.fixed).toStrictEqual([{ account: mortgage, amount: 2210 }]);
    expect(pennies(flow.spare)).toStrictEqual([
      { account: spareIsa, amount: 1666.67, cap: 20000 },
      { account: sparePension, amount: 1080, cap: 30000 },
      { account: spareCash, amount: 1988.03, cap: null },
    ]);
    expect(flow.left).toBe(0);
  });

  // A sacrifice is an employer contribution and counts against the
  // pension's allowance: a pension at its £60,000 allowance fed £5,750
  // a month off a £600,000 base takes nothing of the spare money,
  // since the feeding alone is £69,000 a year, while one fed £1,150
  // has the £3,850 left of its £5,000 a month to fill, and one fed
  // nothing the whole twelfth. What the month pays fills it with the
  // basic rate claimed back on top, so it takes four fifths of that
  // room: £3,080 and £4,000.
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

    expect(at(600000, 0.1)).toBe(0);
    expect(at(120000, 0.1)).toBeCloseTo(3080, 10);
    expect(at(120000, 0)).toBe(4000);
  });

  // £187,787 a year is £15,648.92 a month, £9,276.13 after £5,892.26 of
  // income tax and £480.53 of NI, less the mortgage £7,066.13, of which
  // the ISA takes £1,666.67, the pension the £2,000 that lands as a
  // twelfth of its cap with the relief on it, and the current account
  // the £3,399.46 left: a month whose figures do not add back in
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
      1666.67, 2000, 3399.46,
    ]);
    expect(Object.is(flow.left, 0)).toBe(true);
  });

  // £1,752.35 a month after its tax less the mortgage payment and the
  // retirement living is £6,448.65 short; the ISA takes nothing of it
  // and the shortfall is what is left.
  it("pays a spare-money account nothing when the month does not cover its outgoings", () => {
    const flow = cashFlow([spareIsa, spareCash], schedule, {
      at: { month: 0, year: 2049 },
      plan,
    });

    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 0, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(flow.left).toBeCloseTo(-6448.65, 10);
  });

  // The salary feeds no pension listed here, so it is earned whole,
  // £7,474.70 after its tax, and less £3,500 leaves £3,974.70, of which
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
    expect(flow.left).toBeCloseTo(3974.7 - 20000 / 12, 10);
  });

  // The mortgage payment line paying the mortgage makes the line the
  // mortgage's payment, so the mortgage's own contribution is left out of
  // the month's fixed sums and the payment is counted once, as the line.
  // The salary runs, so the £6,944.70 a month it leaves after the
  // £1,000 sacrificed and the tax on the rest, less the line's £3,201,
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

    expect(flow.fixed).toStrictEqual([{ account: pension, amount: 2266.25 }]);
    expect(flow.expenses).toBe(3201);
  });

  // A month of the debts below, against the £2,453.30 the plain salary
  // leaves after its tax and nothing going out, so what the month
  // states is the debt's own sum and what the ISA beside it takes is
  // the rest.
  const owed = (held: readonly Account[], at: Month): CashFlow =>
    cashFlow(held, { expenses: [], income: [plain] }, { at, plan });

  // A £5,000 card at 22% paying £250 a month is cleared by its 26th
  // payment, which from January 2026 falls in February 2028: the sum is
  // charged in that month and in none after it, so the card costs
  // £6,500 rather than the £90,000 thirty years of it would. The month
  // after, the £250 is the ISA's to take.
  it("charges a debt's fixed sum to the month its payments clear it and no further", () => {
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
    expect(owed(held, { month: 1, year: 2028 }).fixed).toStrictEqual([
      { account: card, amount: 250 },
    ]);
    expect(owed(held, { month: 2, year: 2028 }).fixed).toStrictEqual([]);
    expect(owed(held, { month: 1, year: 2028 }).spare).toStrictEqual([
      { account: spareIsa, amount: 20000 / 12, cap: 20000 },
    ]);
    expect(owed(held, { month: 1, year: 2028 }).left).toBeCloseTo(536.63, 2);
    expect(owed(held, { month: 2, year: 2028 }).left).toBeCloseTo(786.63, 2);
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
  // payment, September 2027, where the same payment against no interest
  // at all would have been done in August.
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
    expect(owed([owing], { month: 8, year: 2027 }).fixed).toStrictEqual([
      charged,
    ]);
    expect(owed([owing], { month: 9, year: 2027 }).fixed).toStrictEqual([]);
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

  // The household ending in March 2047 runs through March and not
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

    expect(at(2, 2047)).toBe(3500);
    expect(at(3, 2047)).toBe(0);
    expect(at(11, 2046)).toBe(3500);
    expect(
      cashFlow(
        none,
        { expenses: [household], income: [] },
        { at: { month: 11, year: 2047 }, plan },
      ).expenses,
    ).toBe(3500);
    expect(
      cashFlow(
        none,
        { expenses: [], income: [ended] },
        { at: { month: 5, year: 2030 }, plan },
      ).income,
    ).toBe(12250);
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
  // it is read: the salary ended in 2048 and is refused in 2049, and a
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
        { at: { month: 0, year: 2049 }, plan },
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
  // list is earned whole: £7,474.70 a month after its tax less the
  // household's £3,500 leaves the ISA its £1,666.67.
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

  it("finds nothing in a year with no lines and no accounts", () => {
    expect(
      cashFlow([], schedule, { at: { month: 0, year: 2025 }, plan }),
    ).toStrictEqual({
      expenses: 0,
      fed: [],
      fixed: [],
      income: 0,
      incomeTax: 0,
      insurance: 0,
      left: 0,
      spare: [],
      spent: [],
    });
  });
});
