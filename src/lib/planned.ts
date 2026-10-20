import type { Household } from "@/data/household";
import type { Month } from "@/data/schedule";

import { balances, netWorthOf, sharedBy } from "@/data/progress";
import { monthsOn } from "@/engine/projection";
import { sumOf } from "@/lib/ledger";
import { monthAfter, monthsBetween } from "@/lib/months";

// A month past the latest point and the net worth the plan carries the
// household to by its end, in that month's pounds, to the whole pound.
export interface PlannedMonth {
  readonly month: Month;
  readonly worth: number;
}

// The twelve months after the latest point as the plan carries them:
// each the latest point's net worth, moved by what monthsOn carries the
// accounts by from where they stand to that month's end. None unless
// the latest point is the month the balances are as of, which The run
// in src/engine/README.md sets the plan's first month after, and
// carries every balance. monthsOn is called once per month ahead.
export function plannedOf({
  accounts,
  plan,
  points,
  schedule,
}: Pick<
  Household,
  "accounts" | "plan" | "points" | "schedule"
>): PlannedMonth[] {
  const latest = points.at(-1);
  if (
    latest === undefined ||
    monthsBetween(latest.month, { month: plan.month, year: plan.from }) !== 1 ||
    sharedBy(latest, latest).length !== balances.length
  ) {
    return [];
  }
  let month = latest.month;
  return Array.from({ length: 12 }, (_, index) => {
    month = monthAfter(month);
    const moved = sumOf(
      monthsOn(accounts, schedule, { months: index + 1, plan }),
      ({ account, balance }) => balance - account.balance,
    );
    return { month, worth: Math.round(netWorthOf(latest) + moved) };
  });
}
