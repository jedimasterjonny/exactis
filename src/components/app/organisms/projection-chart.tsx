"use client";

import type { JSX, ReactNode } from "react";
import type { TooltipContentProps } from "recharts";

import { ChartArea, ChartColumnStacked } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { ProjectionPoint } from "@/engine/projection";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { LabelledSwitch } from "@/components/app/atoms/labelled-switch";
import { buttonVariants } from "@/components/kit/button";
import { Card, CardContent } from "@/components/kit/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/kit/chart";
import { formatGbp } from "@/lib/money";
import { accountsAndAssets } from "@/lib/nav";

// The mark each series is drawn as: an area under a line, or a column
// per year. The series stack either way, so the top is the total.
type Mark = "area" | "bar";

interface ProjectionChartProps {
  readonly controls?: ReactNode;
  readonly points: readonly ProjectionPoint[];
  readonly retirement: number;
}

type Series = (typeof series)[number]["key"];

// The two series, in the order the progress table lists them and the
// order they stack, the first at the baseline. Each keeps its colour for
// good: a series is never recoloured by what else is plotted. The colour
// is named once: the container writes it into --color-<key> within its
// own scope, and everything drawn for the series, the tooltip's key
// included, reads it back from there.
const series = [
  { color: "var(--chart-2)", key: "deferred", label: "Tax-deferred" },
  { color: "var(--chart-1)", key: "free", label: "Tax-free" },
] as const;

const config = Object.fromEntries(
  series.map(({ color, key, label }) => [key, { color, label }]),
);

// The dashboard's chart: the two wrappers, projected a year at a time,
// stacked so the top of the stack is the total, as areas under lines or,
// on the toggle, as a column per year. The plot alone, with no figure
// over it: a hairline grid, the years and the pounds as recessive ticks,
// a legend naming the series, and a crosshair with the year's figures on
// hover and on the arrow keys. The pounds are written in full, as money
// is everywhere here. The first year the plan cannot cover is marked
// where it falls, a dashed hairline under either mark, and that year's
// shortfall joins its figures under the crosshair rather than the
// stack, which carries balances alone. The first year that draws on a
// pension before the pension age is marked the same way in the caution
// tone, since a plan that lasts only by paying the charge on that is not
// one that works, and what a year drew so joins its figures too. The
// early mark's label sits a line beneath the run-out mark's and to the
// right of its own line where the other's is to the left, so neither
// writes over the other a year apart or in the one year. The year the
// plan's owner retires in is marked too, a milestone rather than a
// warning, so in the muted tone, and its label takes a third line to
// the right of its own, clear of both the others wherever they fall;
// a retirement outside the plan's years has no year to stand on and
// goes undrawn. The toggle takes its row from
// inside the plot's box rather than adding one over it, so the box is
// the same height as the frames that stand in for it and nothing shifts
// when the chart arrives; whatever controls the caller gives for what
// is plotted share the row, at its left, the toggle keeping the right,
// and the row stands a gap clear of the plot, so a figure box above
// the top tick does not crowd it. The box is three times as wide as it
// is tall down to a floor, and every frame with it: the row, the axis
// and the legend take the same height at any width, and on a phone a
// third of the width is less than they need, which left no plot at all.
// A projection of nothing, because no account
// is a wrapper yet, says so in the plot's place rather than drawing a
// flat zero over a column of £0 ticks, and points at the screen where
// the account is added: the dashboard has no way to add one itself.
export function ProjectionChart({
  controls,
  points,
  retirement,
}: ProjectionChartProps): JSX.Element {
  const [mark, setMark] = useState<Mark>("area");

  if (points.every((point) => totalOf(point) === 0)) {
    return (
      <Frame>
        <EmptyState
          className="aspect-[3/1] min-h-72"
          description="Add a tax-free or tax-deferred account to see it projected."
          icon={ChartArea}
          title="Nothing to project yet"
        >
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={accountsAndAssets.href}
          >
            {accountsAndAssets.label}
          </Link>
        </EmptyState>
      </Frame>
    );
  }

  // The bar chart rather than the composed one, which would hold either
  // mark: recharts draws the crosshair as a band over the year's columns
  // only when the chart is a bar chart by name.
  const Plot = mark === "bar" ? BarChart : AreaChart;

  // The first year that could not draw what it needed from anywhere,
  // which is the year the money runs out. Undefined while every year
  // covers itself, and the mark goes undrawn.
  const runsOut = points.find((point) => point.uncovered > 0);

  // The first year that drew on a pension before it could be drawn as
  // income, at the charge on taking it early. Undefined while no year
  // does, and the mark goes undrawn.
  const drawsEarly = points.find((point) => point.early > 0);

  // Whether the plan's years reach the year its owner retires in, which
  // is where the milestone stands.
  const isRetiring = points.some((point) => point.year === retirement);

  return (
    <Frame>
      <div className="flex aspect-[3/1] min-h-72 w-full flex-col gap-4">
        <div className="flex items-end gap-4">
          {controls}
          <MarkToggle mark={mark} onMarkChange={setMark} />
        </div>
        <ChartContainer className="aspect-auto min-h-0 flex-1" config={config}>
          <Plot
            data={points}
            margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
          >
            {mark === "area" && (
              <defs>
                {series.map(({ key }) => (
                  <linearGradient
                    id={washOf(key)}
                    key={key}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={`var(--color-${key})`}
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="100%"
                      stopColor={`var(--color-${key})`}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
            )}
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="year"
              minTickGap={40}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              axisLine={false}
              tickFormatter={formatGbp}
              tickLine={false}
              width="auto"
            />
            <ChartTooltip
              content={(props) => (
                <ProjectionTooltip {...props} points={points} />
              )}
            />
            <ChartLegend content={<ChartLegendContent />} />
            {series.map(({ key }) =>
              mark === "area" ? (
                <Area
                  activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                  dataKey={key}
                  dot={false}
                  fill={`url(#${washOf(key)})`}
                  isAnimationActive={false}
                  key={key}
                  stackId="wrappers"
                  stroke={`var(--color-${key})`}
                  strokeWidth={2}
                  type="monotone"
                />
              ) : (
                <Bar
                  dataKey={key}
                  fill={`var(--color-${key})`}
                  isAnimationActive={false}
                  key={key}
                  stackId="wrappers"
                />
              ),
            )}
            {isRetiring && (
              <ReferenceLine
                label={{
                  dy: 32,
                  fill: "var(--muted-foreground)",
                  fontSize: 12,
                  position: "insideTopLeft",
                  value: "Retirement",
                }}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                x={retirement}
              />
            )}
            {drawsEarly !== undefined && (
              <ReferenceLine
                label={{
                  dy: 16,
                  fill: "var(--caution)",
                  fontSize: 12,
                  position: "insideTopLeft",
                  value: "Early pension",
                }}
                stroke="var(--caution)"
                strokeDasharray="4 4"
                x={drawsEarly.year}
              />
            )}
            {runsOut !== undefined && (
              <ReferenceLine
                label={{
                  fill: "var(--destructive)",
                  fontSize: 12,
                  position: "insideTopRight",
                  value: "Runs out",
                }}
                stroke="var(--destructive)"
                strokeDasharray="4 4"
                x={runsOut.year}
              />
            )}
          </Plot>
        </ChartContainer>
      </div>
    </Frame>
  );
}

// What stands where the chart will be while the store answers: the same
// frame, so the screen does not shift when the chart arrives.
export function ProjectionPending(): JSX.Element {
  return (
    <Frame>
      <Placeholder>Reading the store…</Placeholder>
    </Frame>
  );
}

// The card around the plot.
function Frame({ children }: { readonly children: JSX.Element }): JSX.Element {
  return (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// The switch between the two marks: the name of the mark drawn now, with
// the switch on for the bars. It sits at the right of the plot's top row,
// where a screen keeps its actions, whatever is to the left of it.
function MarkToggle({
  mark,
  onMarkChange,
}: {
  readonly mark: Mark;
  readonly onMarkChange: (mark: Mark) => void;
}): JSX.Element {
  const isBars = mark === "bar";
  return (
    <LabelledSwitch
      className="ml-auto"
      icon={isBars ? ChartColumnStacked : ChartArea}
      isChecked={isBars}
      onCheckedChange={(isChecked) => {
        onMarkChange(isChecked ? "bar" : "area");
      }}
    >
      {isBars ? "Bars" : "Areas"}
    </LabelledSwitch>
  );
}

// The plot's place, holding a line of muted text instead. Not the note
// atom, which closes a section with an icon; this is sized as the plot.
function Placeholder({ children }: { readonly children: string }): JSX.Element {
  return (
    <p className="flex aspect-[3/1] min-h-72 w-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

// The year under the crosshair, the age reached that year, and each
// series' figure with the total beneath, and under that, for a year that
// drew on a pension early, what it drew so, and for a year that came up
// short, what it could not cover. The values lead, in mono, with
// a stroke of the series' colour keying the name beside each. The point
// is found by the year the crosshair names rather than read out of the
// entry recharts hands over, which is untyped.
function ProjectionTooltip({
  active: isActive,
  label,
  points,
}: Pick<ProjectionChartProps, "points"> &
  TooltipContentProps): JSX.Element | null {
  const point = points.find((candidate) => candidate.year === label);
  if (!isActive || point === undefined) {
    return null;
  }
  return (
    <div
      className="grid min-w-44 gap-1.5 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      data-slot="projection-tooltip"
    >
      <span className="font-medium">
        {`${String(point.year)} · Age ${String(point.age)}`}
      </span>
      {series.map(({ key, label: name }) => (
        <span className="flex items-center gap-2" key={key}>
          <span
            aria-hidden
            className="h-0.5 w-3 rounded-full"
            style={{ backgroundColor: `var(--color-${key})` }}
          />
          <span className="text-muted-foreground">{name}</span>
          <span className="ml-auto figure font-medium">
            {formatGbp(point[key])}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-2 border-t pt-1.5">
        <span className="text-muted-foreground">Total</span>
        <span className="ml-auto figure font-medium">
          {formatGbp(totalOf(point))}
        </span>
      </span>
      {point.early > 0 && (
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">Drawn early</span>
          <span className="ml-auto figure font-medium text-caution">
            {formatGbp(point.early)}
          </span>
        </span>
      )}
      {point.uncovered > 0 && (
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">Uncovered</span>
          <span className="ml-auto figure font-medium text-destructive">
            {formatGbp(point.uncovered)}
          </span>
        </span>
      )}
    </div>
  );
}

// The top of the stack: every series summed.
function totalOf(point: ProjectionPoint): number {
  return series.reduce((sum, { key }) => sum + point[key], 0);
}

// The area under each line is its series' colour fading from a quarter
// at the line to nothing at the baseline, rather than a flat tenth. The
// light theme's petrol has too little chroma for a flat tint to read as
// anything but grey, and the hue matters most along the curve. One chart
// per page, so the gradients' ids are constants.
function washOf(key: Series): string {
  return `projection-wash-${key}`;
}
