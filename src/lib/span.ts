import type { Plan } from "@/data/plan";

import { endYear } from "@/data/plan";

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
