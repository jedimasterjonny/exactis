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
// with a tenth of it still going into the pension, and one of £36,000
// feeding nothing, so the month keeps all £3,000.
const lean: IncomeLine = { ...salary, amount: 60000, bonus: 0, rsu: 0 };

const plain: IncomeLine = {
  ...salary,
  amount: 36000,
  bonus: 0,
  feeds: null,
  rsu: 0,
  sacrifice: 0,
};

describe("cashFlow", () => {
  // 2026 runs the salary alone, £147,000 a year with its parts, so
  // £12,250 a month, of which a tenth of the £120,000 base, £1,000 a
  // month, is sacrificed into the pension and lands there as £1,150
  // with the NI saved, against the household's £3,500 a month; the
  // pension's £27,195 a year is £2,266.25 a month, the ISA's £20,000 is
  // £1,666.67 and the mortgage's £2,210 is monthly already, leaving
  // £1,607.08 with no account to take it.
  it("takes this year's lines a month at a time, less every sacrifice and fixed sum", () => {
    const flow = cashFlow(accounts, schedule, { month: 0, year: 2026 });

    expect(flow.income).toBe(12250);
    expect(flow.fed).toStrictEqual([
      {
        account: pension,
        amount: (12000 * 1.15) / 12,
        line: salary,
        sacrificed: 1000,
      },
    ]);
    expect(flow.expenses).toBe(3500);
    expect(flow.spent).toStrictEqual([{ amount: 3500, line: household }]);
    expect(flow.fixed).toStrictEqual([
      { account: pension, amount: 2266.25 },
      { account: isa, amount: 20000 / 12 },
      { account: mortgage, amount: 2210 },
    ]);
    expect(flow.spare).toStrictEqual([]);
    expect(flow.left).toBeCloseTo(1607.08, 2);
  });

  // £5,000 a month less the £500 sacrificed and the household's £3,500
  // leaves £1,000, which is all the pension's £2,266.25 can be paid: the
  // sum is trimmed to what the month has rather than drawn out of a
  // wrapper, and the £1,150 the salary feeds the pension is untouched by
  // it, being given up before the month sees the money at all.
  it("pays a fixed sum only as far as the month reaches", () => {
    const flow = cashFlow(
      [pension],
      { expenses: [household], income: [lean] },
      { month: 0, year: 2026 },
    );

    expect(flow.fed).toStrictEqual([
      {
        account: pension,
        amount: (6000 * 1.15) / 12,
        line: lean,
        sacrificed: 500,
      },
    ]);
    expect(flow.fixed).toStrictEqual([{ account: pension, amount: 1000 }]);
    expect(flow.left).toBe(0);
  });

  // £3,000 a month against the pension's £2,266.25 and the ISA's
  // £1,666.67: listed first the pension is paid whole and the ISA takes
  // the £733.75 left, and listed first the ISA is paid whole and the
  // pension takes the £1,333.33 left. Either way the month ends at
  // nothing, the remainder being the one the hand-down keeps.
  it("pays the fixed sums in the order the accounts are listed", () => {
    const flow = cashFlow(
      [pension, isa],
      { expenses: [], income: [plain] },
      { month: 0, year: 2026 },
    );
    const reversed = cashFlow(
      [isa, pension],
      { expenses: [], income: [plain] },
      { month: 0, year: 2026 },
    );

    expect(flow.fixed).toStrictEqual([
      { account: pension, amount: 2266.25 },
      { account: isa, amount: 733.75 },
    ]);
    expect(flow.left).toBe(0);
    expect(reversed.fixed).toStrictEqual([
      { account: isa, amount: 20000 / 12 },
      { account: pension, amount: 3000 - 20000 / 12 },
    ]);
    expect(reversed.left).toBe(0);
  });

  // 2049's consulting is £2,000 a month against the mortgage payment
  // and the retirement living, £8,201: the pension and the mortgage are
  // paid nothing, each still listed at what it had, and the month is
  // short by the £6,201 of expenses the income does not cover and by
  // nothing else, the sums it could not pay adding nothing to it.
  it("pays no fixed sum at all when the expenses alone outrun the income", () => {
    const flow = cashFlow([pension, mortgage], schedule, {
      month: 0,
      year: 2049,
    });

    expect(flow.fixed).toStrictEqual([
      { account: pension, amount: 0 },
      { account: mortgage, amount: 0 },
    ]);
    expect(flow.left).toBe(-6201);
  });

  // £5,000 a month with a tenth of its £60,000 base sacrificed: against
  // £4,500 of expenses the month covers itself with the £500 gone and
  // the pension is fed as ever; against £4,800 it covers itself only by
  // keeping the £500, so the salary is earned whole, the pension is fed
  // nothing and £200 is left; and against £5,500 it covers itself
  // neither way, so the month is short by the £500 the income does not
  // cover rather than by the £1,000 a sacrifice on top of it would
  // leave. A sacrifice the month cannot afford would be a drawdown by
  // another name, and the pension would be fed in the very month a
  // wrapper is sold to cover the spending.
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
        { month: 0, year: 2026 },
      );

    expect(against(4500).fed).toStrictEqual([
      {
        account: unpaid,
        amount: (6000 * 1.15) / 12,
        line: lean,
        sacrificed: 500,
      },
    ]);
    expect(against(4500).left).toBe(0);
    expect(against(4800).fed).toStrictEqual([]);
    expect(against(4800).left).toBe(200);
    expect(against(5500).fed).toStrictEqual([]);
    expect(against(5500).left).toBe(-500);
  });

  // £49,600 a year giving up a hundredth of its base against £49,104 a
  // year of expenses covers itself to the penny and is £4.5e-13 short in
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
      amount: 49600,
      bonus: 0,
      feeds: fed.id,
      rsu: 0,
      sacrifice: 0.01,
    };
    const flow = cashFlow(
      [fed, spareIsa],
      {
        expenses: [{ ...household, amount: 49104, cadence: "year" }],
        income: [earner],
      },
      { month: 0, year: 2026 },
    );

    expect(49600 / 12 - 496 / 12 - 49104 / 12).toBeLessThan(0);
    expect(flow.fed).toStrictEqual([
      {
        account: fed,
        amount: (496 * 1.15) / 12,
        line: earner,
        sacrificed: 496 / 12,
      },
    ]);
    expect(Object.is(flow.left, 0)).toBe(true);
  });

  // The spare money sees what the fixed sums leave and no more: the
  // £1,000 month is taken whole by the pension's trimmed sum, so the ISA
  // and the current account take nothing, while the £3,000 month leaves
  // the £733.75 the pension did not take for the ISA, and nothing after
  // it.
  it("hands the spare money what the fixed sums leave", () => {
    const held = [pension, spareIsa, spareCash];
    const short = cashFlow(
      held,
      { expenses: [household], income: [lean] },
      { month: 0, year: 2026 },
    );
    const wide = cashFlow(
      held,
      { expenses: [], income: [plain] },
      { month: 0, year: 2026 },
    );

    expect(short.fixed).toStrictEqual([{ account: pension, amount: 1000 }]);
    expect(short.spare).toStrictEqual([
      { account: spareIsa, amount: 0, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(short.left).toBe(0);
    expect(wide.spare).toStrictEqual([
      { account: spareIsa, amount: 733.75, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(wide.left).toBe(0);
  });

  // The salary's £1,000 a month comes off the month whether or not the
  // pension is paid a fixed sum of its own, and is not the pension's
  // own sum; a salary naming a pension not among the accounts is earned
  // whole, and a line giving up nothing feeds nothing whichever pension
  // it names.
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
      { month: 0, year: 2026 },
    );
    const unlisted = cashFlow(
      [isa],
      { expenses: [], income },
      { month: 0, year: 2026 },
    );
    const nothing = cashFlow(
      [pension],
      { expenses: [], income: [{ ...salary, sacrifice: 0 }] },
      { month: 0, year: 2026 },
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
    expect(fed.left).toBe(11250);
    expect(unlisted.fed).toStrictEqual([]);
    expect(unlisted.left).toBeCloseTo(12250 - 20000 / 12, 10);
    expect(nothing.fed).toStrictEqual([]);
    expect(nothing.left).toBe(12250 - 2266.25);
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
      cashFlow([unpaid], { expenses: [], income: [income] }, at);

    expect(flowAt(salary, { month: 0, year: 2049 }).fed).toStrictEqual([]);
    expect(flowAt(salary, { month: 0, year: 2049 }).left).toBe(0);
    expect(flowAt(salary, { month: 11, year: 2025 }).fed).toStrictEqual([]);
    expect(flowAt(ending, { month: 6, year: 2030 }).fed).toStrictEqual([]);
    expect(flowAt(ending, { month: 6, year: 2030 }).left).toBe(0);
    expect(flowAt(ending, { month: 5, year: 2030 }).fed).toHaveLength(1);
    expect(flowAt(ending, { month: 5, year: 2030 }).left).toBe(11250);
  });

  // 2035 runs both salaries, £147,000 and £168,000 a year, against the
  // household and the childcare; 2049 the consulting's £2,000 a month
  // against the mortgage payment and the retirement living's £60,000 a
  // year, since the salaries ended in 2048, the childcare in 2035 and
  // the household in 2047; and 2079, the plan's last year, the state
  // pension alone against the two open-ended lines.
  it("runs a line from its first year to its last, or to the end when it has none", () => {
    const [, , , ...none] = accounts;
    const earlier = cashFlow(none, schedule, { month: 0, year: 2035 });
    const later = cashFlow(none, schedule, { month: 0, year: 2049 });
    const last = cashFlow(none, schedule, { month: 0, year: 2079 });

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

  // £12,250 less the £1,000 sacrificed, £3,500 and the mortgage's
  // £2,210 leaves £5,540; the ISA takes £1,666.67, a twelfth of its
  // allowance, the pension £1,350, a twelfth of its cap less the £1,150
  // the salary already feeds it, and the current account the £2,523.33
  // left, leaving nothing.
  it("hands the spare money down the accounts that take it, each to a twelfth of its cap", () => {
    const flow = cashFlow(
      [spareIsa, sparePension, spareCash, home, mortgage],
      schedule,
      { month: 0, year: 2026 },
    );
    const fedPension = (12000 * 1.15) / 12;

    expect(flow.fixed).toStrictEqual([{ account: mortgage, amount: 2210 }]);
    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 20000 / 12, cap: 20000 },
      { account: sparePension, amount: 2500 - fedPension, cap: 30000 },
      {
        account: spareCash,
        amount: 5540 - 20000 / 12 - (2500 - fedPension),
        cap: null,
      },
    ]);
    expect(flow.left).toBe(0);
  });

  // A sacrifice is an employer contribution and counts against the
  // pension's allowance: a pension at its £60,000 allowance fed £5,750
  // a month off a £600,000 base takes nothing of the spare money,
  // since the feeding alone is £69,000 a year, while one fed £1,150
  // takes the £3,850 left of its £5,000 a month, and one fed nothing
  // takes the whole twelfth.
  it("counts what a salary feeds a pension against its allowance", () => {
    const uncapped: Account = {
      ...pension,
      contribution: { cap: null, kind: "spare" },
    };
    const at = (amount: number, sacrifice: number): number =>
      cashFlow(
        [uncapped],
        { expenses: [], income: [{ ...salary, amount, sacrifice }] },
        { month: 0, year: 2026 },
      ).spare.map((take) => take.amount)[0] ?? Number.NaN;

    expect(at(600000, 0.1)).toBe(0);
    expect(at(120000, 0.1)).toBeCloseTo(5000 - 1150, 10);
    expect(at(120000, 0)).toBe(5000);
  });

  // £187,787 a year is £15,648.92 a month, less the household and the
  // mortgage £9,938.92, of which the ISA takes £1,666.67, the pension
  // £2,500 and the current account the £5,772.25 left: a month whose
  // figures do not add back in floating point, so what is left is read
  // off the hand-down rather than subtracted from the whole, and is
  // exactly nothing.
  it("leaves exactly nothing when an account takes all there is", () => {
    const flow = cashFlow(
      [spareIsa, sparePension, spareCash, mortgage],
      {
        expenses: [household],
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
      { month: 0, year: 2026 },
    );

    expect(flow.spare.map(({ amount }) => amount)).toStrictEqual([
      20000 / 12,
      2500,
      187787 / 12 - 3500 - 2210 - 20000 / 12 - 2500,
    ]);
    expect(Object.is(flow.left, 0)).toBe(true);
  });

  // £2,000 a month less the mortgage payment and the retirement living
  // is £6,201 short; the ISA takes nothing of it and the shortfall is
  // what is left.
  it("pays a spare-money account nothing when the month does not cover its outgoings", () => {
    const flow = cashFlow([spareIsa, spareCash], schedule, {
      month: 0,
      year: 2049,
    });

    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 0, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(flow.left).toBe(-6201);
  });

  // £12,250 less £3,500 leaves £8,750, of which the ISA takes its
  // £1,666.67; the rest stays.
  it("leaves what the accounts do not take", () => {
    const flow = cashFlow(
      [spareIsa],
      { expenses: [household], income: [salary] },
      { month: 0, year: 2026 },
    );

    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 20000 / 12, cap: 20000 },
    ]);
    expect(flow.left).toBeCloseTo(8750 - 20000 / 12, 10);
  });

  // The mortgage payment line paying the mortgage makes the line the
  // mortgage's payment, so the mortgage's own contribution is left out of
  // the month's fixed sums and the payment is counted once, as the line.
  // The salary runs, so the £12,250 a month less the £1,000 sacrificed
  // and the line's £3,201 covers the pension's sum whole and what is left
  // out is read off the mortgage rather than off a month too thin to pay.
  it("leaves a loan a line pays out of the fixed sums", () => {
    const flow = cashFlow(
      [pension, mortgage],
      {
        expenses: [{ ...mortgagePayment, pays: mortgage.id }],
        income: [salary],
      },
      { month: 0, year: 2040 },
    );

    expect(flow.fixed).toStrictEqual([{ account: pension, amount: 2266.25 }]);
    expect(flow.expenses).toBe(3201);
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
      cashFlow(none, { expenses: [ending], income: [ended] }, { month, year })
        .expenses;

    expect(at(2, 2047)).toBe(3500);
    expect(at(3, 2047)).toBe(0);
    expect(at(11, 2046)).toBe(3500);
    expect(
      cashFlow(
        none,
        { expenses: [household], income: [] },
        { month: 11, year: 2047 },
      ).expenses,
    ).toBe(3500);
    expect(
      cashFlow(
        none,
        { expenses: [], income: [ended] },
        { month: 5, year: 2030 },
      ).income,
    ).toBe(12250);
    expect(
      cashFlow(
        none,
        { expenses: [], income: [ended] },
        { month: 6, year: 2030 },
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
          { month: 0, year: 2026 },
        ),
      ).toThrow("A salary feeds a pension alone");
      expect(() =>
        cashFlow(
          [account],
          {
            expenses: [],
            income: [{ ...salary, feeds: account.id, sacrifice: 0 }],
          },
          { month: 0, year: 2026 },
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
          { month: 0, year: 2026 },
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
        { month: 0, year: 2049 },
      ),
    ).toThrow("A salary feeds a pension alone");
    expect(() =>
      cashFlow(
        [isa],
        { expenses: [paying], income: [] },
        { month: 0, year: 2026 },
      ),
    ).toThrow("A line pays a debt alone");
  });

  // A line paying a loan the plan does not list pays nothing off it and
  // drops no account's sum, as a salary feeding a pension it does not
  // list is earned whole: £12,250 a month less the household's £3,500
  // leaves the ISA its £1,666.67.
  it("leaves an expense line paying an account that is not listed alone", () => {
    const flow = cashFlow(
      [isa],
      { expenses: [{ ...household, pays: 99 }], income: [salary] },
      { month: 0, year: 2026 },
    );

    expect(flow.fixed).toStrictEqual([{ account: isa, amount: 20000 / 12 }]);
  });

  it("refuses to hand the spare money to a real asset or a debt", () => {
    const spareHome: Account = {
      ...home,
      contribution: { cap: null, kind: "spare" },
    };

    expect(() =>
      cashFlow([spareHome], schedule, { month: 0, year: 2026 }),
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
      { month: 0, year: 2026 },
    );

    expect(0.3 - (0.1 + 0.2)).toBeLessThan(0);
    expect(Object.is(flow.left, 0)).toBe(true);
  });

  it("finds nothing in a year with no lines and no accounts", () => {
    expect(cashFlow([], schedule, { month: 0, year: 2025 })).toStrictEqual({
      expenses: 0,
      fed: [],
      fixed: [],
      income: 0,
      left: 0,
      spare: [],
      spent: [],
    });
  });
});
