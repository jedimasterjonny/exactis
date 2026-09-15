"use client";

import type { JSX, ReactNode } from "react";
import type { TooltipContentProps } from "recharts";

import { cn } from "cn";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { ProjectionPoint } from "@/engine/projection";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import { formatGbp } from "@/lib/money";

interface FrameProps {
  readonly caption?: string;
  readonly children: ReactNode;
  readonly figure: string;
  readonly unit?: string;
}

interface ProjectionChartProps {
  readonly points: readonly ProjectionPoint[];
}

type Series = (typeof series)[number]["key"];

// The projection's two ends: today's total and the total at the horizon,
// which the header leads with.
interface Span {
  readonly first: ProjectionPoint;
  readonly last: ProjectionPoint;
}

// The two series, in the order the progress table lists them and the
// order they stack, the first at the baseline. Each keeps its colour for
// good: a series is never recoloured by what else is plotted. The swatch
// is the same token as a class, for the tooltip, which sits outside the
// scope the chart's own variables are set in.
const series = [
  {
    color: "var(--chart-2)",
    key: "deferred",
    label: "Tax-deferred",
    swatch: "bg-chart-2",
  },
  {
    color: "var(--chart-1)",
    key: "free",
    label: "Tax-free",
    swatch: "bg-chart-1",
  },
] as const;

const config = Object.fromEntries(
  series.map(({ color, key, label }) => [key, { color, label }]),
);

// The dashboard's chart: the two wrappers, projected a year at a time,
// stacked as areas so the top of the stack is the total. The header
// carries the figure that matters, the total at the horizon, and the
// plot carries the years between: a hairline grid, the years and the
// pounds as recessive ticks, a legend naming the series, and a crosshair
// with the year's figures on hover and on the arrow keys. The pounds are
// written in full, as money is everywhere here.
export function ProjectionChart({ points }: ProjectionChartProps): JSX.Element {
  const span = spanOf(points);

  if (span === undefined) {
    return (
      <Frame figure="—">
        <Note>Add a tax-free or tax-deferred account to see it projected.</Note>
      </Frame>
    );
  }

  return (
    <Frame
      caption={`From ${formatGbp(totalOf(span.first))} today`}
      figure={formatGbp(totalOf(span.last))}
      unit={`in ${String(span.last.year)}`}
    >
      <ChartContainer className="aspect-[3/1] w-full" config={config}>
        <AreaChart
          data={points}
          margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
        >
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
          {series.map(({ key }) => (
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
          ))}
        </AreaChart>
      </ChartContainer>
    </Frame>
  );
}

// What stands where the chart will be while the store answers: the same
// frame, so the screen does not shift when the chart arrives.
export function ProjectionPending(): JSX.Element {
  return (
    <Frame figure="—">
      <Note>Reading the store…</Note>
    </Frame>
  );
}

// The card around the plot, headed as a stat tile is: the label, the
// figure with its unit, and a caption beneath.
function Frame({ caption, children, figure, unit }: FrameProps): JSX.Element {
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1.5">
        <span className="label text-muted-foreground">Tax wrappers</span>
        <span className="flex items-baseline gap-1.5">
          <span className="figure text-3xl font-medium tracking-tight">
            {figure}
          </span>
          {unit !== undefined && (
            <span className="figure text-base text-muted-foreground">
              {unit}
            </span>
          )}
        </span>
        {caption !== undefined && (
          <span className="text-xs text-muted-foreground">{caption}</span>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// The plot's place, holding a line of muted text instead.
function Note({ children }: { readonly children: string }): JSX.Element {
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
      {series.map(({ key, label: name, swatch }) => (
        <span className="flex items-center gap-2" key={key}>
          <span aria-hidden className={cn("h-0.5 w-3 rounded-full", swatch)} />
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

// A projection of nothing, because no account is a wrapper yet, has no
// span, and the frame says so instead of plotting a flat zero.
function spanOf(points: readonly ProjectionPoint[]): Span | undefined {
  const [first] = points;
  const last = points.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    points.every((point) => totalOf(point) === 0)
  ) {
    return undefined;
  }
  return { first, last };
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
