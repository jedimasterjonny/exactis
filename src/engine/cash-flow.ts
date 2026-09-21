import type { Account, Cadence } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";
import type { LineValues, Month } from "@/data/schedule";

import { allowanceOf, isPension, takesSpare } from "@/data/accounts";
import { contributionOf, sacrificeOf, totalOf } from "@/data/income";
import { runsIn } from "@/lib/lines";

// A month of a year's money, in pounds as the lines state them and
// unrounded, formatted where it is rendered: what comes in, what goes
// out, in sum and line by line, what each pension is fed and what each
// account is paid, and what is left after all of it.
export interface CashFlow {
  readonly expenses: number;
  readonly fed: readonly Fed[];
  readonly fixed: readonly Paid[];
  readonly income: number;
  readonly left: number;
  readonly spare: readonly Take[];
  readonly spent: readonly Spent[];
}

// A pension a salary feeds: what lands in it a month, the sacrifice
// with the employer's NI saved on it, the line it is fed from, and what
// that line gives up a month, which is what the month is short by.
export interface Fed extends Paid {
  readonly line: IncomeLine;
  readonly sacrificed: number;
}

// The two schedules the plan screen holds, as the engine reads them.
export interface Schedule {
  readonly expenses: readonly ExpenseLine[];
  readonly income: readonly IncomeLine[];
}

// An expense line running in the year and what it costs a month.
export interface Spent {
  readonly amount: number;
  readonly line: ExpenseLine;
}

// An account paid the spare money, what it takes a month, and the most
// it takes a year from every source: its cap, or the allowance its kind
// has, or nothing at all for cash.
export interface Take extends Paid {
  readonly cap: null | number;
}

// An account and what the month actually pays it, which for a fixed sum
// is the sum it states or as much of it as the month had. The stated sum
// is not carried alongside what was paid, since nothing reads it yet and
// the account itself still holds it.
interface Paid {
  readonly account: Account;
  readonly amount: number;
}

// A month's money: the income lines running that month, as they are
// earned, less what a salary sacrifices into its pension, less the
// expense lines, each kept as well as summed. What that leaves pays the
// fixed sums, in the order the accounts are listed, each taking its sum
// or what the month still has when it no longer covers it, and then the
// spare money to each account that takes it in the order they are
// listed, each up to its cap and passing the rest on, and what is left
// after them, which is negative by the expenses the income does not
// cover and by nothing else. A fixed sum is a contribution out of what
// the month has, not a drawdown: an account is paid only while the
// income funding it lasts, and selling out of one wrapper to keep a
// payment into another going would be a shortfall the ledger read back
// as saving. A yearly figure is spread over the twelve months. A loan
// whose payments are a line pays nothing as a fixed sum, since the line
// is its payment and the ledger shows the same figure against the loan:
// it is counted once, as the line, and stops when the line does. A
// salary feeding a pension among the accounts gives up its sacrifice
// before the month sees it, and the pension is fed the sacrifice with
// the employer's NI saved on it, over and above whatever fixed sum the
// pension is paid in its own right; a salary naming a pension not
// listed is earned whole, as a line paying a loan not listed pays
// nothing off it. A sacrifice is given up only while what is left of
// the income still covers the expenses: in a month it would not, no
// line sacrifices at all, every line is earned whole and every pension
// is fed nothing. All of them or none, rather than a share of each or
// the lines that fit, since a sacrifice a month cannot afford is a
// drawdown by another name and the pension would be fed in the very
// month a wrapper is sold to cover the spending. So a month that is
// short feeds nothing, pays no fixed sum and hands over no spare money,
// and what is left is short by the expenses the income does not cover
// and by nothing else. A salary naming an account that is no pension is
// refused, as the spare money into a real asset is: the action holds
// the link to a pension, so one that reached here is a caller's mistake
// rather than a result, and the sacrifice would otherwise leave the
// salary and land in no wrapper. Every line is taken at the amount it states, in
// today's money; how it grows against inflation waits on an inflation
// assumption the plan does not carry yet.
export function cashFlow(
  accounts: readonly Account[],
  schedule: Schedule,
  at: Month,
): CashFlow {
  const income = sumOf(schedule.income, at, totalOf);
  const feeding = schedule.income
    .filter((line) => runsIn(line, at))
    .flatMap((line) => {
      const account = accounts.find(({ id }) => id === line.feeds);
      if (account !== undefined && !isPension(account)) {
        throw new Error("A salary feeds a pension alone");
      }
      const sacrificed = monthly(sacrificeOf(line), line.cadence);
      return account === undefined || sacrificed === 0
        ? []
        : [
            {
              account,
              amount: monthly(contributionOf(line), line.cadence),
              line,
              sacrificed,
            },
          ];
    });
  const spent = schedule.expenses
    .filter((line) => runsIn(line, at))
    .map((line) => ({ amount: monthly(line.amount, line.cadence), line }));
  const expenses = total(spent);
  const givenUp = feeding.reduce((sum, entry) => sum + entry.sacrificed, 0);
  const isEarnedWhole = income - givenUp - expenses < 0;
  const fed = isEarnedWhole ? [] : feeding;
  const sacrificed = isEarnedWhole ? 0 : givenUp;
  const paid = new Set(
    schedule.expenses.flatMap((line) =>
      line.pays === undefined ? [] : [line.pays],
    ),
  );
  const { left: rest, sums: fixed } = fixedSums(
    accounts.filter((account) => !paid.has(account.id)),
    income - sacrificed - expenses,
  );
  const { left, takes } = spareMoney(accounts, rest, fed);
  return { expenses, fed, fixed, income, left, spare: takes, spent };
}

// The fixed sum an account states a month, before the month is asked
// whether it has it, or nothing for an account paid the spare money or
// nothing.
function fixedSum(account: Account): Paid[] {
  const { contribution } = account;
  return contribution?.kind === "fixed"
    ? [{ account, amount: monthly(contribution.amount, contribution.cadence) }]
    : [];
}

// The fixed sums paid out of what the month has after the sacrifices and
// the expenses, handed down the accounts in the order they are listed as
// the spare money is: each takes its stated sum, or what is left when
// the month no longer reaches it, and passes the rest on. An account the
// month could not pay is still listed, at what it was paid and not at
// what it asked for, so the ledger says which sum went short rather than
// dropping the account out of the month altogether.
function fixedSums(
  accounts: readonly Account[],
  available: number,
): { readonly left: number; readonly sums: readonly Paid[] } {
  const sums: Paid[] = [];
  let left = available;
  for (const { account, amount } of accounts.flatMap(fixedSum)) {
    const sum = Math.max(0, Math.min(left, amount));
    sums.push({ account, amount: sum });
    left -= sum;
  }
  return { left, sums };
}

function monthly(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case "month":
      return amount;
    case "year":
      return amount / 12;
  }
}

// The spare money handed down the accounts that take it, each taking
// what is left up to a twelfth of its cap less what a salary already
// feeds it that month, since a sacrifice is an employer contribution
// and counts against the pension's allowance as the spare money does,
// and none of it once there is none left or the feeding has filled
// it, with what is left after them. The remainder is the one the
// hand-down keeps, rather than the sum taken back off the whole, so an
// account that takes all there is leaves exactly nothing and not the
// rounding of a subtraction. A real asset or a debt takes no spare
// money, and the action refuses to give it any; one that reached here
// with it would take everything, having no allowance to cap it, so it
// is a caller's mistake rather than a result.
function spareMoney(
  accounts: readonly Account[],
  available: number,
  fed: readonly Fed[],
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
      const room =
        cap === null
          ? left
          : cap / 12 - total(fed.filter((entry) => entry.account === account));
      const amount = Math.max(0, Math.min(left, room));
      takes.push({ account, amount, cap });
      left -= amount;
    }
  }
  return { left, takes };
}

// What the lines running in the month pay, taking each at what the
// schedule says it pays.
function sumOf<TLine extends LineValues>(
  lines: readonly TLine[],
  at: Month,
  amountOf: (line: TLine) => number,
): number {
  return lines
    .filter((line) => runsIn(line, at))
    .reduce((sum, line) => sum + monthly(amountOf(line), line.cadence), 0);
}

function total(amounts: readonly { readonly amount: number }[]): number {
  return amounts.reduce((sum, { amount }) => sum + amount, 0);
}
