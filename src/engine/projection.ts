import type { Account } from "@/data/accounts";

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
// age as much as by year. Only the tax-free balance is projected yet.
export interface ProjectionPoint {
  readonly age: number;
  readonly free: number;
  readonly year: number;
}

// The plan's years, the first holding the balances as they are and each
// after it a year on: what the account is paid, then growth at its rate,
// a fixed one or the plan's. Each account is carried on its own and the
// year sums them. Nothing is drawn out or taxed yet.
export function project(
  accounts: readonly Account[],
  plan: Plan,
): ProjectionPoint[] {
  let held = accounts
    .filter((account) => account.kind === "tax-free")
    .map((account) => ({ account, balance: account.balance }));
  return Array.from({ length: plan.years + 1 }, (_, offset) => {
    const point = {
      age: plan.from + offset - plan.born,
      free: Math.round(held.reduce((sum, { balance }) => sum + balance, 0)),
      year: plan.from + offset,
    };
    held = held.map(({ account, balance }) => ({
      account,
      balance: grownAYear(balance, account, plan),
    }));
    return point;
  });
}

// A year, month by month: what is paid in lands at the start of its
// month, and the balance then grows a month at the rate's twelfth root,
// so a year's growth compounds to the yearly rate and a monthly
// contribution earns the months it has been in for.
function grownAYear(balance: number, account: Account, plan: Plan): number {
  const monthly = (1 + rateOf(account, plan)) ** (1 / 12);
  let grown = balance;
  for (let month = 0; month < 12; month += 1) {
    grown = (grown + paidIn(account, month)) * monthly;
  }
  return grown;
}

// What lands in the month: a monthly contribution every month, a yearly
// one in the first, and nothing for an account with none.
function paidIn(account: Account, month: number): number {
  if (account.contribution === undefined) {
    return 0;
  }
  switch (account.contribution.cadence) {
    case "month":
      return account.contribution.amount;
    case "year":
      return month === 0 ? account.contribution.amount : 0;
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
