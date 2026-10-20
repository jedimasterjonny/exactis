"use client";

import type { JSX } from "react";
import type { TooltipContentProps } from "recharts";

import { cn } from "cn";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { Balance, ProgressPoint } from "@/data/progress";
import type { Month } from "@/data/schedule";
import type { PlannedMonth } from "@/lib/planned";

import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { balances, netWorthOf } from "@/data/progress";
import { axisOf } from "@/lib/axis";
import {
  balanceColors,
  balanceNames,
  balanceTones,
  formatBalance,
} from "@/lib/balances";
import { formatAxisGbp, formatGbp } from "@/lib/money";
import { formatMonthShort, monthsBetween } from "@/lib/months";
import { progress, subsectionLabel } from "@/lib/nav";

interface ProgressChartProps {
  readonly planned: readonly PlannedMonth[];
  readonly points: readonly ProgressPoint[];
}

// A month along the chart: where it falls, as its year and the share of
// the year before it, so a January falls on its year; the month; where
// the plan's line stands in it, or null where it is not drawn; and
// whether a point was kept for it, with its point, the one kept or, for
// a month not kept, one drawn between the months either side, or that
// it is a month past the latest point the plan carries net worth to,
// with no point, its net worth where the plan's line stands.
type Row =
  | {
      readonly at: number;
      readonly month: Month;
      readonly plan: null | number;
      readonly point: ProgressPoint;
      readonly state: "filled" | "kept";
    }
  | {
      readonly at: number;
      readonly month: Month;
      readonly plan: number;
      readonly state: "planned";
    };

type RowTooltipProps = TooltipContentProps & { readonly rows: readonly Row[] };

// The width the pounds' axis takes, held rather than measured, as the
// dashboard's chart and the fan hold theirs.
const axisWidth = 57;

// The plot's box, as the fan's: three times as wide as it is tall, down
// to a floor, held to the card's width. The chart fills the box as the
// dashboard's does rather than being it, since Safari reads the chart's
// full height off the ratio rather than the floor, and on a phone drew
// it a third of the card's width tall over an empty floor.
const plotBox = "aspect-[3/1] min-h-72 w-full";

// The balances the chart stacks down from nothing, and the rest, which
// stack up.
const owed: readonly Balance[] = ["loans", "unsecured"];

const held = balances.filter((key) => !owed.includes(key));

// What the crosshair says beneath a month's name: nothing for a month
// kept.
const states: Readonly<Record<Row["state"], string | undefined>> = {
  filled: "Not kept, filled in",
  kept: undefined,
  planned: "Planned, not yet kept",
};

// What each balance stands at in a month, as recharts reads a series,
// and net worth beside them. A debt owing nothing breaks, as the
// dashboard's does: split by sign, a series of nothing counts as held,
// and its line would leap to the top of the stack for the month. A
// balance the month's point was not read with is null too, which
// recharts stacks as nothing, so what is stacked above it stays where
// it is, and draws no line through. Made once, as the fan's bands are,
// so each series keeps the dataKey it had and recharts does not register
// it afresh on every render. A month the plan carries has no point, so
// no balance or net worth is drawn over it.
const series = balances.map((key) => ({
  key,
  valueAt: (row: Row): null | number => {
    if (row.state === "planned") {
      return null;
    }
    const value = row.point[key] ?? null;
    return owed.includes(key) && value === 0 ? null : value;
  },
}));

const worthAt = (row: Row): null | number =>
  row.state === "planned" ? null : netWorthOf(row.point);

// The dot the crosshair draws on net worth, kept or planned.
const worthDot = {
  fill: "var(--foreground)",
  r: 4,
  stroke: "var(--card)",
  strokeWidth: 2,
};

// The points laid month by month: what is held stacked up from nothing,
// the pensions first, then the ISAs, the GIAs and the cash, then the
// property and vehicles, and what is owed stacked down from it, the
// loans secured on them nearest, each in the colour the dashboard draws
// its family in under a wash of it; net worth drawn over them as a line
// in ink. A balance is drawn over the months whose points carry it, and
// nothing where one does not. A month not kept is drawn between the
// months either side, each balance both carry an even step from the one
// before to the one after, so the stack runs on unbroken; the crosshair
// says it was not kept. The months the plan carries, where it does,
// run on from the latest point: net worth drawn dashed in ink from it,
// and nothing else, with the latest month marked where the dash begins.
// The crosshair reads the month, each balance and net worth, or net
// worth alone for a month planned, on hover and on the arrow keys, and
// is announced to a screen reader as it moves.
// The pounds reach below nothing only as far as the debts or the plan
// do, and above it as far as everything held or the plan does. The
// years are marked at each January, the plan's among them, where the
// months kept cross one, or otherwise every month by name, the plan's
// too, since a span kept with no January would otherwise be marked by
// no more than the year the plan runs into, or not at all.
export function ProgressChart({
  planned,
  points,
}: ProgressChartProps): JSX.Element {
  const rows = rowsOf(points, planned);
  const januaries = rows.filter(({ month }) => month.month === 0);
  const isByYear = januaries.some(({ state }) => state !== "planned");
  const axis = axisOf(
    Math.min(
      0,
      ...points.map((point) => netWorthOf(point, owed)),
      ...planned.map(({ worth }) => worth),
    ),
    Math.max(
      0,
      ...points.map((point) => netWorthOf(point, held)),
      ...planned.map(({ worth }) => worth),
    ),
  );
  const latest = points.at(-1);
  const isPlanned = latest !== undefined && planned.length > 0;
  return (
    <SectionCard
      caption={
        isPlanned
          ? "Held above the rule, owed below, net worth between, and the plan dashed ahead"
          : "Held above the rule, owed below, net worth between"
      }
      className="min-w-0 overflow-visible"
      label={subsectionLabel(progress, 1)}
      title="Month by month"
    >
      <CardContent className="grid grid-cols-1">
        <div className={cn("flex flex-col", plotBox)}>
          <ChartContainer className="aspect-auto min-h-0 flex-1" config={{}}>
            <ComposedChart
              data={rows}
              margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
              stackOffset="sign"
              title={
                isPlanned
                  ? "What each balance stood at as each month ended, and where the plan carries net worth over the year ahead"
                  : "What each balance stood at as each month ended"
              }
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
                ticks={(isByYear ? januaries : rows).map(({ at }) => at)}
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
                activeDot={worthDot}
                dataKey={worthAt}
                dot={false}
                isAnimationActive={false}
                stroke="var(--foreground)"
                strokeWidth={2}
                type="monotone"
              />
              {isPlanned && (
                <>
                  <ReferenceLine
                    label={{
                      fill: "var(--muted-foreground)",
                      fontSize: 12,
                      position: "insideTopLeft",
                      value: formatMonthShort(latest.month),
                    }}
                    stroke="var(--border)"
                    x={atOf(latest.month)}
                  />
                  <Line
                    activeDot={worthDot}
                    dataKey="plan"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--foreground)"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    type="monotone"
                  />
                </>
              )}
            </ComposedChart>
          </ChartContainer>
        </div>
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
// them; then the months planned, where the plan's line runs on from
// the latest point's net worth.
function rowsOf(
  points: readonly ProgressPoint[],
  planned: readonly PlannedMonth[],
): Row[] {
  return [
    ...points.flatMap((point, index): Row[] => {
      const kept = {
        at: atOf(point.month),
        month: point.month,
        plan:
          index === points.length - 1 && planned.length > 0
            ? netWorthOf(point)
            : null,
        point,
        state: "kept" as const,
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
            month,
            plan: null,
            point: { ...stepOf(before, point, (gap + 1) / steps), month },
            state: "filled" as const,
          };
        }),
        kept,
      ];
    }),
    ...planned.map(({ month, worth }) => ({
      at: atOf(month),
      month,
      plan: worth,
      state: "planned" as const,
    })),
  ];
}

// The month under the crosshair, and for a month not kept that it was
// not, then each balance, from the top of the stack down as the plot
// reads, a dash for one its point was not read with, and net worth
// beneath a rule; for a month planned, that it was planned and net
// worth alone. A status, so a
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
  const state = states[row.state];
  return (
    <div
      className="grid min-w-48 gap-1.5 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      role="status"
    >
      <span className="grid gap-0.5">
        <span className="font-medium">{formatMonthShort(row.month)}</span>
        {state !== undefined && (
          <span className="text-muted-foreground">{state}</span>
        )}
      </span>
      {row.state !== "planned" &&
        [...held.toReversed(), ...owed].map((key) => (
          <span className="flex items-center gap-2" key={key}>
            <span
              aria-hidden
              className={cn("h-0.5 w-3 rounded-full", balanceTones[key])}
            />
            <span className="text-muted-foreground">{balanceNames[key]}</span>
            <span className="ml-auto figure font-medium">
              {formatBalance(row.point[key])}
            </span>
          </span>
        ))}
      <span className="flex items-center gap-2 border-t pt-1.5">
        <span className="font-medium">Net worth</span>
        <span className="ml-auto figure font-medium">
          {formatGbp(
            row.state === "planned" ? row.plan : netWorthOf(row.point),
          )}
        </span>
      </span>
    </div>
  );
}

// The balances the share given of the way from one point to the next,
// and the house's share of the property with them, each stepped evenly
// and held to whole pounds as a point kept is; cash and the GIAs only
// where both points carry them, and otherwise not at all.
function stepOf(
  from: ProgressPoint,
  to: ProgressPoint,
  share: number,
): Omit<ProgressPoint, "month"> {
  const at = (one: number, other: number): number =>
    Math.round(one + (other - one) * share);
  const { cash, taxable } = from;
  return {
    assets: at(from.assets, to.assets),
    deferred: at(from.deferred, to.deferred),
    free: at(from.free, to.free),
    house: at(from.house, to.house),
    loans: at(from.loans, to.loans),
    unsecured: at(from.unsecured, to.unsecured),
    ...(cash !== undefined &&
      to.cash !== undefined && { cash: at(cash, to.cash) }),
    ...(taxable !== undefined &&
      to.taxable !== undefined && { taxable: at(taxable, to.taxable) }),
  };
}

// The id of the wash a balance's area is filled with.
function washOf(key: Balance): string {
  return `progress-wash-${key}`;
}
