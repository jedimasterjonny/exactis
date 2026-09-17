import type { Account, AccountKind } from "@/data/accounts";
import type { CashFlow, Schedule } from "@/engine/cash-flow";

import { cashFlow } from "@/engine/cash-flow";

// What the projection runs on: the rate every account on the plan rate
// grows at, the first year plotted, which holds today's balances, how
// many years it runs forward from there, and the year the plan's owner
// was born, which turns a year into an age.
export interface Plan {
  readonly born: number;
  readonly from: number;
  readonly rate: number;
  readonly years: number;
}

// A year of the projection: the balance the plan expects at the end of
// it, whole pounds, under the name the progress point gives the same
// balance, so a point recorded and a point projected can be laid over
// each other, and the age reached that year, since a plan is read by
// age as much as by year. The two wrappers are projected yet, each
// summed over its accounts.
export interface ProjectionPoint {
  readonly age: number;
  readonly deferred: number;
  readonly free: number;
  readonly year: number;
}

// An account and the balance the projection has carried it to.
interface Held {
  readonly account: Account;
  readonly balance: number;
}

// The last year the plan runs to, which is the last year plotted and the
// year an open-ended line runs to.
export function endYear(plan: Plan): number {
  return plan.from + plan.years;
}

// The plan's years, the first holding the balances as they are and each
// after it a year on: what the account is paid each month, then growth
// at its rate, a fixed one or the plan's. Each account is carried on
// its own and the year sums them by wrapper. What an account is paid a
// month is what that year's cash flow says, a fixed sum spread over the
// months as the flow spreads it or the spare money's take, and the flow
// is read over every account, since a fixed sum into any of them is
// money the month no longer has. Nothing is drawn out or taxed yet.
export function project(
  accounts: readonly Account[],
  schedule: Schedule,
  plan: Plan,
): ProjectionPoint[] {
  let held: readonly Held[] = accounts
    .filter(
      (account) =>
        account.kind === "tax-free" || account.kind === "tax-deferred",
    )
    .map((account) => ({ account, balance: account.balance }));
  return Array.from({ length: plan.years + 1 }, (_, offset) => {
    const year = plan.from + offset;
    const point = {
      age: year - plan.born,
      deferred: total(held, "tax-deferred"),
      free: total(held, "tax-free"),
      year,
    };
    const flow = cashFlow(accounts, schedule, year);
    held = held.map(({ account, balance }) => ({
      account,
      balance: grownAYear(
        balance,
        rateOf(account, plan),
        paidIn(account, flow),
      ),
    }));
    return point;
  });
}

// A year, month by month: what is paid in lands at the start of the
// month, and the balance then grows a month at the rate's twelfth root,
// so a year's growth compounds to the yearly rate and each month's sum
// earns the months it has been in for. A yearly sum is paid a twelfth
// at a time, as the cash flow spreads it, so it is paid as the spare
// money is and the two earn alike; the year in which it is really paid
// is not the model's to know.
function grownAYear(balance: number, rate: number, paid: number): number {
  const monthly = (1 + rate) ** (1 / 12);
  let grown = balance;
  for (let month = 0; month < 12; month += 1) {
    grown = (grown + paid) * monthly;
  }
  return grown;
}

// What lands in an account each month of the year: the fixed sum or
// the spare money's take the flow lists for it, and nothing for an
// account it lists nothing for. The entry is read off the flow as the
// one listed for the account itself, the same object the flow was read
// over, rather than for its id, which two accounts could share only by
// a caller's mistake; a sum over the one entry, so a miss needs no
// fallback that could never be reached.
function paidIn(account: Account, flow: CashFlow): number {
  return [...flow.fixed, ...flow.spare]
    .filter((paid) => paid.account === account)
    .reduce((sum, paid) => sum + paid.amount, 0);
}

function rateOf(account: Account, plan: Plan): number {
  switch (account.growth.kind) {
    case "fixed":
      return account.growth.rate;
    case "plan":
      return plan.rate;
  }
}

// The wrapper's balance this year, whole pounds.
function total(held: readonly Held[], kind: AccountKind): number {
  return Math.round(
    held
      .filter(({ account }) => account.kind === kind)
      .reduce((sum, { balance }) => sum + balance, 0),
  );
}
