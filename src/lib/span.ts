import type { Plan } from "@/data/plan";

import { endYear } from "@/data/plan";

// The columns a row on the plan's span is laid out in, by the milestones
// and by both schedules alike: the name over the row's bar, the figure,
// the years, and the row's chevron or lock. Every column but the first is a fixed
// width, so every bar on the screen is as wide as every other and a year
// falls in the same place on each. The action column was sized by what
// it held, so a row with a pencil and a bin drew its bar narrower, by
// the bin, than a row with a pencil or a lock alone, and the plan's end
// fell about three years apart from one row to the next.
export const laneColumns = "grid-cols-[minmax(0,1fr)_9rem_11rem_1.75rem]";

// The years a ruler over the plan's span marks: each decade the span
// reaches past its first year, 2030 to 2070 for a plan from 2026 to 2079,
// so the marks fall at round years, and at round ages for an owner born
// in a round year, and stand far enough apart to read on a phone.
export function decadesOf(plan: Plan): number[] {
  const first = Math.floor(plan.from / 10) * 10 + 10;
  return Array.from(
    { length: Math.max(0, Math.floor((endYear(plan) - first) / 10) + 1) },
    (_, index) => first + index * 10,
  );
}

// A year's place along the plan's span, as a percentage from its start,
// held within it, so a year outside the span is placed at its edge
// rather than past it. A year is placed where it begins, and a fraction
// of one is placed that far into it. Whatever is drawn over the span
// places its years here, so a bar and a mark on the same span meet
// where their years do.
export function placed(year: number, plan: Plan): number {
  const share = (year - plan.from) / (endYear(plan) - plan.from);
  return Math.min(Math.max(share, 0), 1) * 100;
}
