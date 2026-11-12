"use client";

import type { JSX } from "react";
import type { TooltipContentProps } from "recharts";

import { useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { runLength } from "@/engine/futures";
import { formatCount } from "@/lib/count";

interface FuturesLastingProps {
  readonly "aria-describedby": string;
  readonly caption: string;
  readonly done: number | undefined;
  readonly figure: undefined | { readonly cut: number; readonly label: string };
  readonly points: readonly Lasting[] | undefined;
}

// A cut to the spending and how many of the futures last with it.
interface Lasting {
  readonly cut: number;
  readonly lasted: number;
}

// A point of the line: a share of the spending planned and how many of
// the futures last on it.
interface Share {
  readonly lasted: number;
  readonly share: number;
}

// How many of the futures last on each share of the spending planned,
// from half the spending to half as much again, as a line in the
// series' colour over the shares counted, joined straight between them
// since what lies between is not counted, on a count of the run that
// never zooms, so a plan edited draws on the same scale. A rule at the
// plan's own spending and one at nine in ten, both in ink at half, the
// one named above the plot and the other in the count's gutter, where
// no line meets it; and the card's figure for the spending as a ring in
// ink where it sits on the line, named as the figure reads, and none
// where nine in ten fall short even on half. The ring's name ends
// beneath it, where the line, falling as the share rises, never runs,
// and starts beneath it at half the spending, the plot's left edge,
// where it would run past the plot otherwise. The pointer and the arrow
// keys read each share counted and its count, told to a screen reader as
// they move. The chart is named for one and described by the element
// whose id it is handed, the card's verdict, and the caption beneath
// says over what. While the shares are counted the box says so, and
// beneath the words a bar fills with how much of the counting is done,
// outlined where colours are forced. The words name the bar, and a
// screen reader hears them only as that name. The box keeps the height
// it has once drawn, so nothing beneath it moves. Before the count has
// begun, while the run it is counted over is drawn and searched, the box
// already stands at that height, saying when the shares are counted,
// with no bar, and its words are read as they are, since they name
// nothing; counts handed in before then are not drawn.
export function FuturesLasting({
  "aria-describedby": describedBy,
  caption,
  done,
  figure,
  points,
}: FuturesLastingProps): JSX.Element {
  const countingId = useId();
  const shares = points?.map(({ cut, lasted }) => ({
    lasted,
    share: 100 - cut,
  }));
  const ring =
    figure === undefined
      ? undefined
      : shares?.find(({ share }) => share === 100 - figure.cut);
  return (
    <div className="grid gap-2">
      {done === undefined || shares === undefined ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 lg:h-64">
          <div
            aria-hidden={done !== undefined}
            className="text-center text-sm text-balance text-muted-foreground"
            id={countingId}
          >
            {done === undefined
              ? "The futures are counted on each share of the spending once they are searched."
              : "Counting the futures on each share of the spending…"}
          </div>
          {done !== undefined && (
            <div
              aria-labelledby={countingId}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={done}
              className="h-1 w-full max-w-84 overflow-hidden rounded-full bg-input forced-colors:outline"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-chart-1 ease-linear motion-safe:transition-[width] forced-colors:bg-[CanvasText]"
                data-slot="counting-fill"
                style={{ width: `${String(done)}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-48 flex-col lg:h-64">
          <ChartContainer className="aspect-auto min-h-0 flex-1" config={{}}>
            <LineChart
              aria-describedby={describedBy}
              data={shares}
              margin={{ bottom: 0, left: 0, right: 20, top: 20 }}
              title="How many futures last on each share of the spending planned"
            >
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="share"
                domain={[50, 150]}
                tickFormatter={(share: number) => `${String(share)}%`}
                tickLine={false}
                tickMargin={8}
                ticks={[50, 75, 100, 125, 150]}
                type="number"
              />
              <YAxis
                axisLine={false}
                domain={[0, runLength]}
                tickFormatter={formatCount}
                tickLine={false}
                ticks={[0, 250, 500, 750, 1000]}
                width={52}
              />
              <ChartTooltip
                content={(props) => (
                  <LastingTooltip {...props} shares={shares} />
                )}
                cursor={false}
              />
              <ReferenceLine
                label={{
                  fill: "var(--muted-foreground)",
                  fontSize: 12,
                  position: "top",
                  value: "The plan",
                }}
                stroke="var(--foreground)"
                strokeOpacity={0.5}
                x={100}
              />
              <ReferenceLine
                label={{
                  fill: "var(--muted-foreground)",
                  fontSize: 12,
                  position: "left",
                  value: "9 in 10",
                }}
                stroke="var(--foreground)"
                strokeOpacity={0.5}
                y={900}
              />
              <Line
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                dataKey="lasted"
                dot={false}
                isAnimationActive={false}
                stroke="var(--chart-1)"
                strokeWidth={2}
                type="linear"
              />
              {ring !== undefined && (
                <ReferenceDot
                  fill="var(--card)"
                  label={{
                    fill: "var(--foreground)",
                    fontSize: 12,
                    position: "bottom",
                    textAnchor: ring.share === 50 ? "start" : "end",
                    value: figure?.label,
                  }}
                  r={4.5}
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  x={ring.share}
                  y={ring.lasted}
                  zIndex={700}
                />
              )}
            </LineChart>
          </ChartContainer>
        </div>
      )}
      <p className="text-sm text-pretty text-muted-foreground">{caption}</p>
    </div>
  );
}

// The share under the pointer and how many of the futures last on it,
// the same at every share, the ends among them. A status, so a screen
// reader reads it out as the arrow keys step, as recharts' own tooltip
// is. The share is found by the label the pointer names rather than read
// out of the entry recharts hands over, which is untyped.
function LastingTooltip({
  active: isActive,
  label,
  shares,
}: TooltipContentProps & {
  readonly shares: readonly Share[];
}): JSX.Element | null {
  const point = shares.find(({ share }) => share === label);
  if (!isActive || point === undefined) {
    return null;
  }
  return (
    <div className="grid gap-0.5 chart-tip whitespace-nowrap" role="status">
      <span className="font-medium">
        {`${String(point.share)}% of the spending planned`}
      </span>
      <span className="text-muted-foreground">
        <span className="figure text-foreground">
          {formatCount(point.lasted)}
        </span>
        {` of ${formatCount(runLength)} last`}
      </span>
    </div>
  );
}
