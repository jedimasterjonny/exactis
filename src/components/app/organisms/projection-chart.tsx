"use client";

import type { JSX } from "react";
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
  readonly points: readonly ProjectionPoint[];
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
// is everywhere here. The toggle takes its row from inside the plot's
// box rather than adding one over it, so the box is the same height as
// the frames that stand in for it and nothing shifts when the chart
// arrives. A projection of nothing, because no account is a wrapper yet,
// says so in the plot's place rather than drawing a flat zero over a
// column of £0 ticks, and points at the screen where the account is
// added: the dashboard has no way to add one itself.
export function ProjectionChart({ points }: ProjectionChartProps): JSX.Element {
  const [mark, setMark] = useState<Mark>("area");

  if (points.every((point) => totalOf(point) === 0)) {
    return (
      <Frame>
        <EmptyState
          className="aspect-[3/1]"
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

  return (
    <Frame>
      <div className="flex aspect-[3/1] w-full flex-col">
        <MarkToggle mark={mark} onMarkChange={setMark} />
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
// where a screen keeps its actions.
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
      className="self-end"
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
    <p className="flex aspect-[3/1] w-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

// The year under the crosshair, the age reached that year, and each
// series' figure with the total beneath. The values lead, in mono, with
// a stroke of the series' colour keying the name beside each. The point
// is found by the year the crosshair names rather than read out of the
// entry recharts hands over, which is untyped.
function ProjectionTooltip({
  active: isActive,
  label,
  points,
}: ProjectionChartProps & TooltipContentProps): JSX.Element | null {
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
