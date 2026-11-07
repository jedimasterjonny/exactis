"use client";

import type { JSX } from "react";
import type { TooltipContentProps } from "recharts";

import { cn } from "cn";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { Month } from "@/data/schedule";

import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { formatWholePercent } from "@/lib/money";
import { atOf, formatMonthShort, labelOf } from "@/lib/months";

// A month of the track record, as the caller lays it: the month; the
// share of the futures its reading landed above, or null where it has
// none; whether that reading looks back less than a year; and what the
// crosshair says of it, a line beneath the month where one applies, the
// reading's lines, and the figures under a rule, each its label and the
// figure.
export interface TrackRow {
  readonly figures: readonly (readonly [string, string])[];
  readonly isShort: boolean;
  readonly lines: readonly string[];
  readonly month: Month;
  readonly note: null | string;
  readonly share: null | number;
}

// A month placed along the plot, with the dot its reading is drawn
// with, solid, hollow or none.
type Placed = TrackRow & {
  readonly at: number;
  readonly dot: "hollow" | "none" | "solid";
};

type PlacedTooltipProps = TooltipContentProps & {
  readonly rows: readonly Placed[];
};

interface TrackRecordProps {
  readonly rows: readonly TrackRow[];
  readonly title: string;
}

// The plot's box, as the fan's and the progress chart's: three times as
// wide as it is tall, down to a floor, held to the card's width.
const plotBox = "aspect-[3/1] min-h-72 w-full";

// How many readings are each drawn with a dot. Past that the dots
// crowd one another at a phone's width, so only those the line alone
// would not show keep one.
const dotted = 24;

// The shares the axis is ruled at: the edges of the middle 80% and the
// middle half, and the middle future between them.
const ticks = [0.1, 0.25, 0.5, 0.75, 0.9];

// What each series draws in a month, as recharts reads it: the reading,
// for the line through them, and the reading again where it is drawn
// with a solid dot or a hollow one, for the dots alone. Made once, as
// the progress chart's are, so each keeps the dataKey it had and
// recharts does not register it afresh on every render.
const shareAt = ({ share }: Placed): null | number => share;
const solidAt = ({ dot, share }: Placed): null | number =>
  dot === "solid" ? share : null;
const hollowAt = ({ dot, share }: Placed): null | number =>
  dot === "hollow" ? share : null;

// The dots: a reading over a year solid in ink, as the progress chart's
// net worth is, and one over less hollow, the card's colour inside an
// ink ring.
const solid = {
  fill: "var(--foreground)",
  r: 4,
  stroke: "var(--card)",
  strokeWidth: 2,
};
const hollow = {
  fill: "var(--card)",
  r: 4,
  stroke: "var(--foreground)",
  strokeWidth: 2,
};

// Where each month end's invested balances landed among the futures of
// a close up to a year before, the fan of each flattened to the same
// height: the share of the futures from none at the foot to all at the
// top, ruled at the edges of the middle 80% and the middle half, each
// washed as the fan washes it, with the middle future a hairline. The
// readings are a line in ink, broken at a month with none, through a
// dot each while there are no more than 24 of them, solid for a reading
// over a year and hollow for one over less; past 24, only a hollow
// reading and one with no reading either side, which a line alone draws
// nothing for, keep a dot. The months run from the first given to the
// last, or eleven months on where that is later, so a record's first
// readings sit at the left of a year rather than stretching across it,
// marked at each January where the months given cross one and
// otherwise every month by name. The crosshair reads what the caller
// says of each month, on hover and on the arrow keys, and is announced
// to a screen reader as it moves.
export function TrackRecord({ rows, title }: TrackRecordProps): JSX.Element {
  const isDotted = rows.filter(({ share }) => share !== null).length <= dotted;
  const placed = rows.map((row, index): Placed => ({
    ...row,
    at: atOf(row.month),
    dot: dotOf(row, isDotted || isAlone(rows, index)),
  }));
  const first = Math.min(...placed.map(({ at }) => at));
  const last = Math.max(...placed.map(({ at }) => at), first + 11 / 12);
  const januaries = placed.filter(({ month }) => month.month === 0);
  return (
    <div className={cn("flex flex-col", plotBox)}>
      <ChartContainer className="aspect-auto min-h-0 flex-1" config={{}}>
        <ComposedChart
          data={placed}
          margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
          title={title}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="at"
            domain={[first, last]}
            minTickGap={24}
            tickFormatter={labelOf}
            tickLine={false}
            tickMargin={8}
            ticks={
              januaries.length > 0
                ? januaries.map(({ at }) => at)
                : Array.from(
                    { length: Math.round((last - first) * 12) + 1 },
                    (_, month) => first + month / 12,
                  )
            }
            type="number"
          />
          <YAxis
            axisLine={false}
            domain={[0, 1]}
            tickFormatter={(share: number) => formatWholePercent(share)}
            tickLine={false}
            ticks={ticks}
            width={40}
          />
          <ChartTooltip
            content={(props) => <PlacedTooltip {...props} rows={placed} />}
            filterNull={false}
          />
          <ReferenceArea
            fill="var(--chart-2)"
            fillOpacity={0.2}
            y1={0.1}
            y2={0.9}
          />
          <ReferenceArea
            fill="var(--chart-2)"
            fillOpacity={0.35}
            y1={0.25}
            y2={0.75}
          />
          <ReferenceLine stroke="var(--chart-1)" strokeWidth={1} y={0.5} />
          <Line
            activeDot={solid}
            dataKey={shareAt}
            dot={false}
            isAnimationActive={false}
            stroke="var(--foreground)"
            strokeWidth={2}
            type="linear"
          />
          <Line
            activeDot={false}
            dataKey={solidAt}
            dot={solid}
            isAnimationActive={false}
            stroke="none"
          />
          <Line
            activeDot={false}
            dataKey={hollowAt}
            dot={hollow}
            isAnimationActive={false}
            stroke="none"
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

// What stands where the plot will be while this month's reading is
// drawn: the same box, so the cards below it do not move when it lands.
export function TrackRecordPending(): JSX.Element {
  return (
    <div className={cn("grid place-items-center", plotBox)}>
      <p className="text-sm text-muted-foreground">
        Waiting on this month&apos;s reading…
      </p>
    </div>
  );
}

// The dot a month's reading is drawn with: none for a month with no
// reading, hollow for one over less than a year, and solid for one over
// a year where it is to have one.
function dotOf({ isShort, share }: TrackRow, isDotted: boolean): Placed["dot"] {
  if (share === null) {
    return "none";
  }
  if (isShort) {
    return "hollow";
  }
  return isDotted ? "solid" : "none";
}

// Whether neither month beside a month has a reading, so a line alone
// draws nothing for its own.
function isAlone(rows: readonly TrackRow[], index: number): boolean {
  return (
    (rows[index - 1]?.share ?? null) === null &&
    (rows[index + 1]?.share ?? null) === null
  );
}

// The month under the crosshair, the line beneath it where the caller
// gives one, the reading's lines, and its figures beneath a rule. A
// status, so a screen reader reads it out as the crosshair steps. The
// month is found by where the crosshair stands rather than read out of
// the entry recharts hands over, which is untyped.
function PlacedTooltip({
  active: isActive,
  label,
  rows,
}: PlacedTooltipProps): JSX.Element | null {
  const row = rows.find(({ at }) => at === label);
  if (!isActive || row === undefined) {
    return null;
  }
  return (
    <div className="grid min-w-48 gap-1.5 chart-tip" role="status">
      <span className="grid gap-0.5">
        <span className="font-medium">{formatMonthShort(row.month)}</span>
        {row.note !== null && (
          <span className="text-muted-foreground">{row.note}</span>
        )}
      </span>
      {row.lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
      {row.figures.length > 0 && (
        <span className="grid gap-0.5 border-t pt-1.5">
          {row.figures.map(([name, figure]) => (
            <span className="flex items-center gap-2" key={name}>
              <span className="text-muted-foreground">{name}</span>
              <span className="ml-auto figure font-medium">{figure}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
