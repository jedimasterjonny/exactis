import type { JSX } from "react";

import { cn } from "cn";

import type { Plan } from "@/data/plan";

import { placed } from "@/lib/span";

// The years a run reaches a goal by at the shares the bar draws: the
// ends at 5% and 95%, the outer band from 10% to 90%, the inner band
// from 25% to 75%, and the median.
export interface Spread {
  readonly ends: Pair;
  readonly inner: Pair;
  readonly median: null | number;
  readonly outer: Pair;
}

// Two years a run reaches a goal by, the smaller share's first, null
// where that many never do; as the years are sorted, the first is never
// null after the second.
type Pair = readonly [null | number, null | number];

interface SpreadBarProps {
  readonly marks?: readonly number[];
  readonly plan: Plan;
  readonly spread: Spread;
}

// Where the futures reach a goal on the plan's span: the fan turned on
// its side, over the track a line's bar is drawn on. The middle four in
// five are banded faintly and the middle half over them, in the fills
// the fan bands them, the earliest and latest 5% are small dots at the
// ends, and the median is the larger dot on top, in the fan's median
// colour and ringed in the card's as a milestone's pin is. A band whose
// far share never reaches the goal runs to the last year any share
// does and stops, with no dot past it, rather than fading to the plan's
// end, which would read as a year. The years given to mark, the
// milestones', are ruled across the track in faint ink, as every
// bar's are, so the median is read against retirement without looking
// up to its pin. Decorative, since the years are written beside it:
// hidden from the accessibility tree.
export function SpreadBar({
  marks = [],
  plan,
  spread,
}: SpreadBarProps): JSX.Element {
  const { ends, inner, median, outer } = spread;
  const last =
    [ends[1], outer[1], inner[1], median, inner[0], outer[0], ends[0]].find(
      (year) => year !== null,
    ) ?? null;
  return (
    <div
      aria-hidden
      className="relative h-1.5 rounded-full bg-muted"
      data-slot="spread-bar"
    >
      <Band fill="bg-chart-2/20" last={last} pair={outer} plan={plan} />
      <Band fill="bg-chart-2/50" last={last} pair={inner} plan={plan} />
      {marks.map((mark) => (
        <span
          className="absolute inset-y-0 mark"
          data-slot="spread-bar-mark"
          key={mark}
          style={{ left: `${String(placed(mark, plan))}%` }}
        />
      ))}
      <End plan={plan} year={ends[0]} />
      <End plan={plan} year={ends[1]} />
      {median !== null && (
        <span
          className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-chart-1 ring-2 ring-card motion-safe:transition-[left]"
          data-slot="spread-bar-median"
          style={{ left: `${String(placed(median, plan))}%` }}
        />
      )}
    </div>
  );
}

// A band from the year its smaller share reaches the goal by to the
// year its larger does, or to the last year any share does where the
// larger never reaches it; nothing while neither does.
function Band({
  fill,
  last,
  pair: [from, to],
  plan,
}: {
  readonly fill: string;
  readonly last: null | number;
  readonly pair: Pair;
  readonly plan: Plan;
}): JSX.Element | null {
  if (from === null || last === null) {
    return null;
  }
  const left = placed(from, plan);
  return (
    <span
      className={cn(
        "absolute inset-y-0 rounded-full motion-safe:transition-[left,width]",
        fill,
      )}
      data-slot="spread-bar-band"
      style={{
        left: `${String(left)}%`,
        width: `${String(placed(to ?? last, plan) - left)}%`,
      }}
    />
  );
}

// An end of the spread, the earliest or the latest 5%: a small dot
// where its year begins, or nothing where that many never reach it.
function End({
  plan,
  year,
}: {
  readonly plan: Plan;
  readonly year: null | number;
}): JSX.Element | null {
  if (year === null) {
    return null;
  }
  return (
    <span
      className="absolute top-1/2 size-2 -translate-1/2 rounded-full bg-chart-2 ring-2 ring-card motion-safe:transition-[left]"
      data-slot="spread-bar-end"
      style={{ left: `${String(placed(year, plan))}%` }}
    />
  );
}
