import type { Account } from "@/data/accounts";
import type { Curve } from "@/data/inflation";
import type { LineGrowth, Month } from "@/data/schedule";

import { inflationOf, target } from "@/data/inflation";
import { termOf } from "@/lib/loans";
import { monthsBetween } from "@/lib/months";

// What the projection runs on: the rate every account on the plan rate
// grows at, a nominal return as a fixed rate is, and the inflation the
// plan takes, which the lines, stated in today's money, rise with, each
// a fraction a year as every rate is; the first year plotted, which
// holds the balances, and the month of it they are as of, January being
// nought as the date gives it, so the first year runs from there rather
// than from its start; how many years it runs forward; the year the
// plan's owner was born, which turns a year into an age; and the age
// they retire at, from which they earn nothing by working. It sits
// beside the accounts and the lines rather than inside the engine,
// since the flow and the projection each read it and the flow is what
// the projection is built on.
export interface Plan {
  readonly born: number;
  readonly from: number;
  readonly inflation: number;
  readonly month: number;
  readonly rate: number;
  readonly retires: number;
  readonly years: number;
}

// The ages the plan is set to, as the store keeps them: the age it runs
// to, from which the years it runs forward are worked out from the
// month it starts in, so the plan ends at the same age wherever it
// starts, and the age its owner retires at.
export interface PlanAges {
  readonly ends: number;
  readonly retires: number;
}

// The rest of the plan, until there is somewhere to set it: five per
// cent a year, for someone born in 1990.
const born = 1990;
const rate = 0.05;

// The age the plan's owner reaches in a year. The plan holds the year
// they were born in and not the day, so it is the age reached that
// year, and the whole of the year counts as reaching it.
export function ageIn(year: number, plan: Pick<Plan, "born">): number {
  return year - plan.born;
}

// The years a debt's own payment takes to pay it down to the balloon a
// PCP leaves standing, at the rate it is charged, its own or the
// plan's, or null when the interest swallows the payment and it never
// does. The save holds a debt to one it pays down, and the engine
// charges the payment to the month it does so in, so the two read the
// term the same way.
export function debtTermOf(
  debt: Account,
  payment: number,
  plan: Plan,
): null | number {
  return termOf(
    { balance: -debt.balance, balloon: debt.balloon ?? 0 },
    payment,
    rateFrom(debt, plan),
  );
}

// The age the plan runs to, the age its owner reaches in its last year.
export function endAge(plan: Plan): number {
  return ageIn(endYear(plan), plan);
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

// The rate a line's amount rises at a year, in the pounds of the day the
// projection counts in: the plan's inflation for a line kept level in
// today's money, a point or two over it for one that outpaces prices,
// and nothing for one fixed in nominal terms, which so falls behind
// them. A line paying a loan grows at nothing whatever it says, since a
// loan's payment is the one sum for every month of its term, which is
// how the loan maths reads it and how the line's end is worked out; a
// payment rising with prices would clear the loan early and go on being
// paid after it. The dialogs write such a line fixed, so this holds
// one written any other way to the same.
export function growthFrom(
  line: { readonly growth: LineGrowth; readonly pays?: number },
  plan: Plan,
): number {
  if (line.pays !== undefined) {
    return 0;
  }
  switch (line.growth) {
    case "inflation":
      return plan.inflation;
    case "inflation-plus-1":
      return plan.inflation + 0.01;
    case "inflation-plus-2":
      return plan.inflation + 0.02;
    case "nominal":
      return 0;
  }
}

// The plan from the month given, the month the balances are as of,
// since they are what its first year opens with, to the age the ages
// say it runs to and with the age they say its owner retires at, taking
// the inflation the curve given makes, or the Bank's target when no
// curve has been pulled: what the projection runs on and what the plan
// screen lays its lines over. A plan whose age is already reached runs
// no years forward rather than a count below nothing.
export function planOf(
  ages: PlanAges,
  start: Month,
  curve: Curve | null,
): Plan {
  return {
    born,
    from: start.year,
    inflation: curve === null ? target : inflationOf(curve).rate,
    month: start.month,
    rate,
    retires: ages.retires,
    years: Math.max(0, born + ages.ends - start.year),
  };
}

// How far prices have risen by a month at the plan's inflation, from
// the month the plan starts in, whose money is today's money: what a
// pound of today's money costs in that month's pounds, and what a pound
// of that month's is divided by to be read in today's money.
export function pricesIn(
  plan: Pick<Plan, "from" | "inflation" | "month">,
  at: Month,
): number {
  return risenBy(plan.inflation, plan, at);
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

// How many times over a sum rising at a rate a year has risen by a
// month, from the month the plan starts in, compounding a month at a
// time as the projection carries a balance: once over in the plan's
// first month, and by a whole year's rate twelve months on.
export function risenBy(
  rate: number,
  plan: Pick<Plan, "from" | "month">,
  at: Month,
): number {
  return (
    (1 + rate) **
    (monthsBetween({ month: plan.month, year: plan.from }, at) / 12)
  );
}
