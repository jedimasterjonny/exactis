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
// after it a year on: what the account is paid, then growth at its rate,
// a fixed one or the plan's. Each account is carried on its own and the
// year sums them by wrapper. An account paid the spare money is paid
// what that year's cash flow hands it, which is read over every
// account, since a fixed sum into any of them is money the month no
// longer has. Nothing is drawn out or taxed yet.
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
      balance: grownAYear(balance, rateOf(account, plan), (month) =>
        paidIn(account, month, flow),
      ),
    }));
    return point;
  });
}

// A year, month by month: what is paid in lands at the start of its
// month, and the balance then grows a month at the rate's twelfth root,
// so a year's growth compounds to the yearly rate and a monthly
// contribution earns the months it has been in for.
function grownAYear(
  balance: number,
  rate: number,
  paid: (month: number) => number,
): number {
  const monthly = (1 + rate) ** (1 / 12);
  let grown = balance;
  for (let month = 0; month < 12; month += 1) {
    grown = (grown + paid(month)) * monthly;
  }
  return grown;
}

// What lands in the month: a monthly sum every month, a yearly one in
// the first, the spare money's take every month, since the spare money
// is a month's, and nothing for an account with none. The take is read
// off the flow as the one listed for the account itself, the same
// object the flow was read over, rather than for its id, which two
// accounts could share only by a caller's mistake; a sum over the one
// take, so a miss needs no fallback that could never be reached.
function paidIn(account: Account, month: number, flow: CashFlow): number {
  const { contribution } = account;
  if (contribution === undefined) {
    return 0;
  }
  switch (contribution.kind) {
    case "fixed":
      return contribution.cadence === "month" || month === 0
        ? contribution.amount
        : 0;
    case "spare":
      return flow.spare
        .filter((take) => take.account === account)
        .reduce((sum, take) => sum + take.amount, 0);
  }
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
