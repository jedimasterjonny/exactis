import type { Account } from "@/data/accounts";

// What the projection runs on: the rate every account on the plan rate
// grows at, the first year plotted, which holds today's balances, and
// the month of it the plan is read in, January being nought as the
// date gives it, so the first year runs from there rather than from
// its start; how many years it runs forward; the year the plan's owner
// was born, which turns a year into an age; and the age they retire at,
// from which they earn nothing by working. It sits beside the
// accounts and the lines rather than inside the engine, since the flow
// and the projection each read it and the flow is what the projection
// is built on.
export interface Plan {
  readonly born: number;
  readonly from: number;
  readonly month: number;
  readonly rate: number;
  readonly retires: number;
  readonly years: number;
}

// The ages the plan is set to, as the store keeps them: the age it runs
// to, from which the years it runs forward are worked out on the day it
// is read, so the plan ends at the same age however many years are left
// to it, and the age its owner retires at.
export interface PlanAges {
  readonly ends: number;
  readonly retires: number;
}

// The rest of the plan, until there is somewhere to set it: five per
// cent a year, for someone born in 1990.
const born = 1990;
const rate = 0.05;

// The age the plan runs to, the age its owner reaches in its last year.
export function endAge(plan: Plan): number {
  return endYear(plan) - plan.born;
}

// The oldest age a plan may run to: past any life it plans for, and
// short of a plan of centuries.
export const oldestAge = 120;

// The last year the plan runs to, which is the last year plotted, whose
// point is the balance entering it, and the year an open-ended line
// runs to. A fact about the plan rather than the engine, since a line's
// span, the fields and the rows read it as the projection does.
export function endYear(plan: Plan): number {
  return plan.from + plan.years;
}

// The plan as it stands on the day given, from that year and that month
// of it, to the age the ages say it runs to and with the age they say
// its owner retires at: what the projection runs on and what the plan
// screen lays its lines over. A plan whose age is already reached runs
// no years forward rather than a count below nothing.
export function planOf(ages: PlanAges, now: Date): Plan {
  const from = now.getFullYear();
  return {
    born,
    from,
    month: now.getMonth(),
    rate,
    retires: ages.retires,
    years: Math.max(0, born + ages.ends - from),
  };
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

// The year the plan's owner retires in, the first in which they earn
// nothing by working. The plan holds the year they were born and not
// the day, so the whole of the year they reach the age counts as
// retired, as the whole of the year they reach the pension age counts
// as reaching it, and the year before is their last working year.
export function retirementYear(plan: Plan): number {
  return plan.born + plan.retires;
}
