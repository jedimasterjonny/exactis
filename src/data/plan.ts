import type { Account } from "@/data/accounts";

// What the projection runs on: the rate every account on the plan rate
// grows at, the first year plotted, which holds today's balances, and
// the month of it the plan is read in, January being nought as the
// date gives it, so the first year runs from there rather than from
// its start; how many years it runs forward; and the year the plan's
// owner was born, which turns a year into an age. It sits beside the
// accounts and the lines rather than inside the engine, since the flow
// and the projection each read it and the flow is what the projection
// is built on.
export interface Plan {
  readonly born: number;
  readonly from: number;
  readonly month: number;
  readonly rate: number;
  readonly years: number;
}

// The rate an account is carried at, its own fixed one or the plan's,
// whichever it is carried on. A debt is charged at the same rate it
// grows at, so its payments are worked out against this one too.
export function rateFrom(account: Account, plan: Plan): number {
  switch (account.growth.kind) {
    case "fixed":
      return account.growth.rate;
    case "plan":
      return plan.rate;
  }
}
