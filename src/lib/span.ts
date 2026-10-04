import type { Plan } from "@/data/plan";

import { endYear } from "@/data/plan";

// The columns a row on the plan's span is laid out in, by the milestones
// and by both schedules alike: the name over the row's bar, the figure,
// the years, and the row's action. Every column but the first is a fixed
// width, so every bar on the screen is as wide as every other and a year
// falls in the same place on each. The action column was sized by what
// it held, so a row with a pencil and a bin drew its bar narrower, by
// the bin, than a row with a pencil or a lock alone, and the plan's end
// fell about three years apart from one row to the next.
export const laneColumns = "grid-cols-[minmax(0,1fr)_9rem_11rem_3.75rem]";

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
