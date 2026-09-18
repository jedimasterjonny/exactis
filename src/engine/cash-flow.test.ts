import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";

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

describe("cashFlow", () => {
  // 2026 runs the salary alone, £147,000 a year with its parts, so
  // £12,250 a month, against the household's £3,500 a month; the
  // pension's £27,195 a year is £2,266.25 a month, the ISA's £20,000 is
  // £1,666.67 and the mortgage's £2,210 is monthly already, leaving
  // £2,607.08 with no account to take it.
  it("takes this year's lines a month at a time, less every fixed sum", () => {
    const flow = cashFlow(accounts, schedule, { month: 0, year: 2026 });

    expect(flow.income).toBe(12250);
    expect(flow.expenses).toBe(3500);
    expect(flow.spent).toStrictEqual([{ amount: 3500, line: household }]);
    expect(flow.fixed).toStrictEqual([
      { account: pension, amount: 2266.25 },
      { account: isa, amount: 20000 / 12 },
      { account: mortgage, amount: 2210 },
    ]);
    expect(flow.spare).toStrictEqual([]);
    expect(flow.left).toBeCloseTo(2607.08, 2);
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

  // £12,250 less £3,500 and the mortgage's £2,210 leaves £6,540; the
  // ISA takes £1,666.67, a twelfth of its allowance, the pension £2,500,
  // a twelfth of its cap, and the current account the £2,373.33 left,
  // leaving nothing.
  it("hands the spare money down the accounts that take it, each to a twelfth of its cap", () => {
    const flow = cashFlow(
      [spareIsa, sparePension, spareCash, home, mortgage],
      schedule,
      { month: 0, year: 2026 },
    );

    expect(flow.fixed).toStrictEqual([{ account: mortgage, amount: 2210 }]);
    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 20000 / 12, cap: 20000 },
      { account: sparePension, amount: 2500, cap: 30000 },
      { account: spareCash, amount: 6540 - 20000 / 12 - 2500, cap: null },
    ]);
    expect(flow.left).toBe(0);
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
        income: [{ ...salary, amount: 187787, bonus: 0, rsu: 0 }],
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
  it("leaves a loan a line pays out of the fixed sums", () => {
    const flow = cashFlow(
      [pension, mortgage],
      { expenses: [{ ...mortgagePayment, pays: mortgage.id }], income: [] },
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

  it("refuses to hand the spare money to a real asset or a debt", () => {
    const spareHome: Account = {
      ...home,
      contribution: { cap: null, kind: "spare" },
    };

    expect(() =>
      cashFlow([spareHome], schedule, { month: 0, year: 2026 }),
    ).toThrow("A real asset or a debt takes no spare money");
  });

  it("finds nothing in a year with no lines and no accounts", () => {
    expect(cashFlow([], schedule, { month: 0, year: 2025 })).toStrictEqual({
      expenses: 0,
      fixed: [],
      income: 0,
      left: 0,
      spare: [],
      spent: [],
    });
  });
});
