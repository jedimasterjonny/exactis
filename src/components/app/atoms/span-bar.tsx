import type { JSX } from "react";

import { cn } from "cn";

import type { Plan } from "@/data/plan";
import type { Side, Tie } from "@/data/schedule";

import { endYear } from "@/data/plan";
import { placed } from "@/lib/span";

interface SpanBarProps {
  readonly endsAt: null | Tie;
  readonly firstYear: number;
  readonly lastMonth: null | number;
  readonly lastYear: null | number;
  readonly plan: Plan;
  readonly side: Side;
  readonly startsAt: null | Tie;
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

// Where a line sits on the plan's span: a bar over a track, from where
// the line's first year begins to where its last ends, through the month
// it ends in when it ends part way through, or to the plan's end when it
// has no last year. So a line that ends the year before another starts
// meets it rather than stopping a year short of it. An end tied to a
// milestone carries a dot in oxide, the milestones' colour, where it
// meets the milestone's pin on the span above. A year outside the span
// is held to its edge rather than drawn past it.
// Decorative, since the years are written beside it: the bar is hidden
// from the accessibility tree.
export function SpanBar({
  endsAt,
  firstYear,
  lastMonth,
  lastYear,
  plan,
  side,
  startsAt,
}: SpanBarProps): JSX.Element {
  const left = placed(firstYear, plan);
  const right = placed(
    lastYear === null ? endYear(plan) : lastYear + ((lastMonth ?? 11) + 1) / 12,
    plan,
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
      {startsAt !== null && <TieDot at={left} />}
      {endsAt !== null && <TieDot at={right} />}
    </div>
  );
}

// Where a tied end meets its milestone: a dot the height of the track,
// centred on the end.
function TieDot({ at }: { readonly at: number }): JSX.Element {
  return (
    <span
      className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-brand"
      data-slot="span-bar-tie"
      style={{ left: `${String(at)}%` }}
    />
  );
}
