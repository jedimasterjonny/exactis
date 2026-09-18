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
  // 2026 runs the salary alone, £144,000 a year with its parts, so
  // £12,000 a month, against the household's £3,350 a month; the
  // pension's £28,512 a year is £2,376 a month, the ISA's £20,000 is
  // £1,666.67 and the mortgage's £2,180 is monthly already, leaving
  // £2,538.58 with no account to take it.
  it("takes this year's lines a month at a time, less every fixed sum", () => {
    const flow = cashFlow(accounts, schedule, 2026);

    expect(flow.income).toBe(12000);
    expect(flow.expenses).toBe(3350);
    expect(flow.fixed).toStrictEqual([
      { account: pension, amount: 2376 },
      { account: isa, amount: 20000 / 12 },
      { account: mortgage, amount: 2180 },
    ]);
    expect(flow.spare).toStrictEqual([]);
    expect(flow.left).toBeCloseTo(2538.58, 2);
  });

  // 2039 runs both salaries, £144,000 and £174,000 a year, against the
  // household and the childcare; 2053 the consulting's £2,000 a month
  // against the mortgage payment and the retirement living's £58,000 a
  // year, since the salaries ended in 2052, the childcare in 2039 and
  // the household in 2051; and 2083, the plan's last year, the state
  // pension alone against the two open-ended lines.
  it("runs a line from its first year to its last, or to the end when it has none", () => {
    const [, , , ...none] = accounts;
    const earlier = cashFlow(none, schedule, 2039);
    const later = cashFlow(none, schedule, 2053);
    const last = cashFlow(none, schedule, 2083);

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

  // £12,000 less £3,350 and the mortgage's £2,180 leaves £6,470; the
  // ISA takes £1,666.67, a twelfth of its allowance, the pension £2,500,
  // a twelfth of its cap, and the current account the £2,303.33 left,
  // leaving nothing.
  it("hands the spare money down the accounts that take it, each to a twelfth of its cap", () => {
    const flow = cashFlow(
      [spareIsa, sparePension, spareCash, home, mortgage],
      schedule,
      2026,
    );

    expect(flow.fixed).toStrictEqual([{ account: mortgage, amount: 2180 }]);
    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 20000 / 12, cap: 20000 },
      { account: sparePension, amount: 2500, cap: 30000 },
      { account: spareCash, amount: 6470 - 20000 / 12 - 2500, cap: null },
    ]);
    expect(flow.left).toBe(0);
  });

  // £187,787 a year is £15,648.92 a month, less the household and the
  // mortgage £10,118.92, of which the ISA takes £1,666.67, the pension
  // £2,500 and the current account the £5,952.25 left: a month whose
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
      2026,
    );

    expect(flow.spare.map(({ amount }) => amount)).toStrictEqual([
      20000 / 12,
      2500,
      187787 / 12 - 3350 - 2180 - 20000 / 12 - 2500,
    ]);
    expect(Object.is(flow.left, 0)).toBe(true);
  });

  // £2,000 a month less the mortgage payment and the retirement living
  // is £5,898 short; the ISA takes nothing of it and the shortfall is
  // what is left.
  it("pays a spare-money account nothing when the month does not cover its outgoings", () => {
    const flow = cashFlow([spareIsa, spareCash], schedule, 2053);

    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 0, cap: 20000 },
      { account: spareCash, amount: 0, cap: null },
    ]);
    expect(flow.left).toBe(-5898);
  });

  // £12,000 less £3,350 leaves £8,650, of which the ISA takes its
  // £1,666.67; the rest stays.
  it("leaves what the accounts do not take", () => {
    const flow = cashFlow(
      [spareIsa],
      { expenses: [household], income: [salary] },
      2026,
    );

    expect(flow.spare).toStrictEqual([
      { account: spareIsa, amount: 20000 / 12, cap: 20000 },
    ]);
    expect(flow.left).toBeCloseTo(8650 - 20000 / 12, 10);
  });

  it("refuses to hand the spare money to a real asset or a debt", () => {
    const spareHome: Account = {
      ...home,
      contribution: { cap: null, kind: "spare" },
    };

    expect(() => cashFlow([spareHome], schedule, 2026)).toThrow(
      "A real asset or a debt takes no spare money",
    );
  });

  it("finds nothing in a year with no lines and no accounts", () => {
    expect(cashFlow([], schedule, 2025)).toStrictEqual({
      expenses: 0,
      fixed: [],
      income: 0,
      left: 0,
      spare: [],
    });
  });
});
