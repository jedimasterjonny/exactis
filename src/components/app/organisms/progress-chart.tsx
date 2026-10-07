"use client";

import type { JSX } from "react";
import type { TooltipContentProps } from "recharts";

import { cn } from "cn";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import type { Balance, ProgressPoint } from "@/data/progress";
import type { Month } from "@/data/schedule";

import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { balances, netWorthOf } from "@/data/progress";
import { axisOf } from "@/lib/axis";
import { balanceColors, balanceNames, balanceTones } from "@/lib/balances";
import { formatAxisGbp, formatGbp } from "@/lib/money";
import { formatMonthShort, monthsBetween } from "@/lib/months";
import { progress, subsectionLabel } from "@/lib/nav";

interface ProgressChartProps {
  readonly points: readonly ProgressPoint[];
}

// A month along the chart: where it falls, as its year and the share of
// the year before it, so a January falls on its year; whether a point
// was kept for it; the month; and its point, the one kept or, for a
// month not kept, one drawn between the months either side.
interface Row {
  readonly at: number;
  readonly isKept: boolean;
  readonly month: Month;
  readonly point: ProgressPoint;
}

type RowTooltipProps = TooltipContentProps & { readonly rows: readonly Row[] };

// The width the pounds' axis takes, held rather than measured, as the
// dashboard's chart and the fan hold theirs.
const axisWidth = 57;

// The plot's box, as the fan's: three times as wide as it is tall, down
// to a floor, held to the card's width.
const plotBox = "aspect-[3/1] min-h-72 w-full";

// The balances the chart stacks down from nothing, the rest stacking up.
const owed: readonly Balance[] = ["loans", "unsecured"];

// What each balance stands at in a month, as recharts reads a series,
// and net worth beside them. A debt owing nothing breaks, as the
// dashboard's does: split by sign, a series of nothing counts as held,
// and its line would leap to the top of the stack for the month. Made
// once, as the fan's bands are, so each series keeps the dataKey it had
// and recharts does not register it afresh on every render.
const series = balances.map((key) => ({
  key,
  valueAt: ({ point }: Row): null | number =>
    owed.includes(key) && point[key] === 0 ? null : point[key],
}));

const worthAt = ({ point }: Row): number => netWorthOf(point);

// The points laid month by month: what is held stacked up from nothing,
// the pensions first, then the ISAs, then the property and vehicles, and
// what is owed stacked down from it, the loans secured on them nearest,
// each in the colour the dashboard draws its family in under a wash of
// it; net worth drawn over them as a line in ink. A month not kept is
// drawn between the months either side, each balance an even step from
// the one before to the one after, so the stack runs on unbroken; the
// crosshair says it was not kept. The crosshair reads the month, each
// balance and net worth, on hover and on the arrow keys, and is
// announced to a screen reader as it moves.
// The pounds reach below nothing only as far as the debts do, and the
// years are marked at each January, or, over months that cross none,
// each month by name, since a span with no January would otherwise
// leave the axis unmarked.
export function ProgressChart({ points }: ProgressChartProps): JSX.Element {
  const rows = rowsOf(points);
  const januaries = rows.filter(({ month }) => month.month === 0);
  const axis = axisOf(
    Math.min(0, ...points.map(({ loans, unsecured }) => loans + unsecured)),
    Math.max(
      0,
      ...points.map(({ assets, deferred, free }) => assets + deferred + free),
    ),
  );
  return (
    <SectionCard
      caption="What each balance stood at as each month ended, what is held stacked up from nothing and what is owed down from it, with net worth drawn between, and a month not kept drawn between the months either side. Hover or step along it to read a month."
      className="min-w-0 overflow-visible"
      label={subsectionLabel(progress, 1)}
      title="Month by month"
    >
      <CardContent className="grid grid-cols-1">
        <ChartContainer className={plotBox} config={{}}>
          <ComposedChart
            data={rows}
            margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
            stackOffset="sign"
            title="What each balance stood at as each month ended"
          >
            <defs>
              {series.map(({ key }) => (
                <linearGradient
                  id={washOf(key)}
                  key={key}
                  x1="0"
                  x2="0"
                  y1={owed.includes(key) ? "1" : "0"}
                  y2={owed.includes(key) ? "0" : "1"}
                >
                  <stop
                    offset="0%"
                    stopColor={balanceColors[key]}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor={balanceColors[key]}
                    stopOpacity={0.05}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="at"
              domain={["dataMin", "dataMax"]}
              minTickGap={24}
              tickFormatter={labelOf}
              tickLine={false}
              tickMargin={8}
              ticks={(januaries.length > 0 ? januaries : rows).map(
                ({ at }) => at,
              )}
              type="number"
            />
            <YAxis
              axisLine={false}
              domain={axis.domain}
              tickFormatter={formatAxisGbp}
              tickLine={false}
              ticks={axis.ticks}
              width={axisWidth}
            />
            <ChartTooltip
              content={(props) => <RowTooltip {...props} rows={rows} />}
            />
            {series.map(({ key, valueAt }) => (
              <Area
                activeDot={false}
                dataKey={valueAt}
                fill={`url(#${washOf(key)})`}
                isAnimationActive={false}
                key={key}
                stackId="balances"
                stroke={balanceColors[key]}
                strokeWidth={1.5}
                type="monotone"
              />
            ))}
            <Line
              activeDot={{
                fill: "var(--foreground)",
                r: 4,
                stroke: "var(--card)",
                strokeWidth: 2,
              }}
              dataKey={worthAt}
              dot={false}
              isAnimationActive={false}
              stroke="var(--foreground)"
              strokeWidth={2}
              type="monotone"
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </SectionCard>
  );
}

// Where a month falls along the chart.
function atOf({ month, year }: Month): number {
  return year + month / 12;
}

// What the axis writes where a month falls: a January's year, or any
// other month by name.
function labelOf(at: number): string {
  const year = Math.floor(at);
  const month = Math.round((at - year) * 12);
  return month === 0 ? String(year) : formatMonthShort({ month, year });
}

// A month as many months before another as given.
function monthsBack({ month, year }: Month, count: number): Month {
  const from = month - count;
  return { month: ((from % 12) + 12) % 12, year: year + Math.floor(from / 12) };
}

// The months the points span, each with the point kept for it, and
// those between two points that were not kept with one drawn between
// them.
function rowsOf(points: readonly ProgressPoint[]): Row[] {
  return points.flatMap((point, index) => {
    const kept = {
      at: atOf(point.month),
      isKept: true,
      month: point.month,
      point,
    };
    const before = points[index - 1];
    if (before === undefined) {
      return [kept];
    }
    const steps = monthsBetween(before.month, point.month);
    return [
      ...Array.from({ length: steps - 1 }, (_, gap) => {
        const month = monthsBack(point.month, steps - 1 - gap);
        return {
          at: atOf(month),
          isKept: false,
          month,
          point: { ...stepOf(before, point, (gap + 1) / steps), month },
        };
      }),
      kept,
    ];
  });
}

// The month under the crosshair, and for a month not kept that it was
// not, then each balance, from the top of the stack down as the plot
// reads, and net worth beneath a rule. A status, so a
// screen reader reads it out as the crosshair steps. The month is found
// by where the crosshair stands rather than read out of the entry
// recharts hands over, which is untyped.
function RowTooltip({
  active: isActive,
  label,
  rows,
}: RowTooltipProps): JSX.Element | null {
  const row = rows.find(({ at }) => at === label);
  if (!isActive || row === undefined) {
    return null;
  }
  const { isKept, month, point } = row;
  return (
    <div
      className="grid min-w-48 gap-1.5 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      role="status"
    >
      <span className="grid gap-0.5">
        <span className="font-medium">{formatMonthShort(month)}</span>
        {!isKept && (
          <span className="text-muted-foreground">
            Not kept, drawn between the months either side
          </span>
        )}
      </span>
      {[
        ...balances.filter((key) => !owed.includes(key)).toReversed(),
        ...owed,
      ].map((key) => (
        <span className="flex items-center gap-2" key={key}>
          <span
            aria-hidden
            className={cn("h-0.5 w-3 rounded-full", balanceTones[key])}
          />
          <span className="text-muted-foreground">{balanceNames[key]}</span>
          <span className="ml-auto figure font-medium">
            {formatGbp(point[key])}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-2 border-t pt-1.5">
        <span className="font-medium">Net worth</span>
        <span className="ml-auto figure font-medium">
          {formatGbp(netWorthOf(point))}
        </span>
      </span>
    </div>
  );
}

// The balances the share given of the way from one point to the next,
// each stepped evenly and held to whole pounds as a point kept is.
function stepOf(
  from: ProgressPoint,
  to: ProgressPoint,
  share: number,
): Omit<ProgressPoint, "month"> {
  const at = (key: Balance): number =>
    Math.round(from[key] + (to[key] - from[key]) * share);
  return {
    assets: at("assets"),
    deferred: at("deferred"),
    free: at("free"),
    loans: at("loans"),
    unsecured: at("unsecured"),
  };
}

// The id of the wash a balance's area is filled with.
function washOf(key: Balance): string {
  return `progress-wash-${key}`;
}
