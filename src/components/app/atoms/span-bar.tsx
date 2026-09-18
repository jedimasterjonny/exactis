import type { JSX } from "react";

import { cn } from "cn";

import type { Side } from "@/data/schedule";
import type { Plan } from "@/engine/projection";

import { endYear } from "@/engine/projection";

interface SpanBarProps {
  readonly firstYear: number;
  readonly lastMonth: null | number;
  readonly lastYear: null | number;
  readonly plan: Plan;
  readonly side: Side;
}

// The fill takes the series' colour the reference draws each schedule
// in: bonds for income, debt for expenses.
const fills: Record<Side, string> = {
  expense: "bg-chart-5",
  income: "bg-chart-2",
};

// The least of the span a line is drawn over, as a share of the track, so
// a single year is still seen.
const sliver = 1.2;

// Where a line sits on the plan's span: a bar over a track, from the
// line's first year to its last, into it by the month it ends in when it
// ends part way through, or to the plan's end when it has no last year.
// A year outside the span is held to its edge rather than drawn past it.
// Decorative, since the years are written beside it: the bar is hidden
// from the accessibility tree.
export function SpanBar({
  firstYear,
  lastMonth,
  lastYear,
  plan,
  side,
}: SpanBarProps): JSX.Element {
  const end = endYear(plan);
  const left = placed(firstYear, plan.from, end);
  const right = placed(
    lastYear === null ? end : lastYear + (lastMonth ?? 0) / 12,
    plan.from,
    end,
  );
  return (
    <div
      aria-hidden
      className="relative h-1.5 overflow-hidden rounded-full bg-muted"
      data-slot="span-bar"
    >
      <span
        className={cn("absolute inset-y-0 rounded-full", fills[side])}
        data-slot="span-bar-fill"
        style={{
          left: `${String(left)}%`,
          width: `${String(Math.max(right - left, sliver))}%`,
        }}
      />
    </div>
  );
}

// A year's place along the span, as a percentage from its start, held
// within it.
function placed(year: number, from: number, end: number): number {
  const share = (year - from) / (end - from);
  return Math.min(Math.max(share, 0), 1) * 100;
}
