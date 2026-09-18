import type { Account, Cadence } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";
import type { LineValues } from "@/data/schedule";

import { allowanceOf, takesSpare } from "@/data/accounts";
import { totalOf } from "@/data/income";

// A month of a year's money, in pounds as the lines state them and
// unrounded, formatted where it is rendered: what comes in, what goes
// out, what each account is paid, and what is left after all of it.
export interface CashFlow {
  readonly expenses: number;
  readonly fixed: readonly Paid[];
  readonly income: number;
  readonly left: number;
  readonly spare: readonly Take[];
}

// The two schedules the plan screen holds, as the engine reads them.
export interface Schedule {
  readonly expenses: readonly ExpenseLine[];
  readonly income: readonly IncomeLine[];
}

// An account paid the spare money, what it takes a month, and the most
// it takes a year: its cap, or the allowance its kind has, or nothing
// at all for cash.
export interface Take extends Paid {
  readonly cap: null | number;
}

// An account and the fixed sum it is paid a month.
interface Paid {
  readonly account: Account;
  readonly amount: number;
}

// A year's money, a month at a time: the income lines running that year
// less the expense lines and every fixed sum, then the spare money to
// each account that takes it in the order they are listed, each up to
// its cap and passing the rest on, and what is left after them, which
// is negative when the month does not cover its outgoings. A yearly
// figure is spread over the twelve months. Every line is taken at the
// amount it states, in today's money; how it grows against inflation
// waits on an inflation assumption the plan does not carry yet.
export function cashFlow(
  accounts: readonly Account[],
  schedule: Schedule,
  year: number,
): CashFlow {
  const income = sumOf(schedule.income, year, totalOf);
  const expenses = sumOf(schedule.expenses, year, (line) => line.amount);
  const fixed = accounts.flatMap(fixedSum);
  const { left, takes } = spareMoney(
    accounts,
    income - expenses - total(fixed),
  );
  return { expenses, fixed, income, left, spare: takes };
}

// The fixed sum an account is paid a month, or nothing for an account
// paid the spare money or nothing.
function fixedSum(account: Account): Paid[] {
  const { contribution } = account;
  return contribution?.kind === "fixed"
    ? [{ account, amount: monthly(contribution.amount, contribution.cadence) }]
    : [];
}

function monthly(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case "month":
      return amount;
    case "year":
      return amount / 12;
  }
}

// Whether a line is paid in the year: from its first year to its last,
// or on for good when it has none.
function runsIn(line: LineValues, year: number): boolean {
  return (
    line.firstYear <= year && (line.lastYear === null || year <= line.lastYear)
  );
}

// The spare money handed down the accounts that take it, each taking
// what is left up to a twelfth of its cap, and none of it once there is
// none left, with what is left after them. The remainder is the one the
// hand-down keeps, rather than the sum taken back off the whole, so an
// account that takes all there is leaves exactly nothing and not the
// rounding of a subtraction. A real asset or a debt takes no spare
// money, and the action refuses to give it any; one that reached here
// with it would take everything, having no allowance to cap it, so it
// is a caller's mistake rather than a result.
function spareMoney(
  accounts: readonly Account[],
  available: number,
): { readonly left: number; readonly takes: readonly Take[] } {
  const takes: Take[] = [];
  let left = available;
  for (const account of accounts) {
    const { contribution } = account;
    if (contribution?.kind === "spare") {
      if (!takesSpare(account)) {
        throw new Error("A real asset or a debt takes no spare money");
      }
      const cap = contribution.cap ?? allowanceOf(account.kind);
      const amount = Math.max(
        0,
        cap === null ? left : Math.min(left, cap / 12),
      );
      takes.push({ account, amount, cap });
      left -= amount;
    }
  }
  return { left, takes };
}

// What the lines running in the year pay a month, taking each at what
// the schedule says it pays.
function sumOf<TLine extends LineValues>(
  lines: readonly TLine[],
  year: number,
  amountOf: (line: TLine) => number,
): number {
  return lines
    .filter((line) => runsIn(line, year))
    .reduce((sum, line) => sum + monthly(amountOf(line), line.cadence), 0);
}

function total(paid: readonly Paid[]): number {
  return paid.reduce((sum, { amount }) => sum + amount, 0);
}
