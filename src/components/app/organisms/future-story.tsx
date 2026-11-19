"use client";

import type { JSX, ReactNode } from "react";
import type { TooltipContentProps } from "recharts";

import { cn } from "cn";
import { useId } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { Plan } from "@/data/plan";
import type { Future, FutureYear, Outcome } from "@/engine/futures";
import type { Story } from "@/lib/story";

import { Badge } from "@/components/kit/badge";
import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { ageIn } from "@/data/plan";
import { axisOf } from "@/lib/axis";
import { listed } from "@/lib/feeders";
import { formatAxisGbp, formatGbp, formatPercent } from "@/lib/money";
import { monthName } from "@/lib/months";
import { outcomeInks, outcomeNames } from "@/lib/outcomes";
import { heldLede } from "@/lib/story";

interface FutureStoryProps {
  readonly future: Future;
  readonly outcome: Outcome;
  readonly plan: Plan;
  readonly projected: Future;
  readonly stepper: ReactNode;
  readonly story: Story;
  readonly years: readonly FutureYear[];
}

interface Lived {
  readonly lived: number;
  readonly planned: number;
  readonly rate: number | undefined;
  readonly span: readonly [number, number];
  readonly year: number;
}

// The width the pounds' axis takes, held as the fan's is, and the room
// kept right of the plot, which the portfolio's strip beneath is inset
// by so its years fall under the plot's.
const axisWidth = 57;
const rightMargin = 12;

// What the chart draws, said beneath it, before the run is in as after.
const caption =
  "This future, the plan at its own rates dashed and the middle 80% of the futures shaded, in today's\u00a0money; beneath, its portfolio's return each year, before inflation";

// The dot each chapter hangs off, by how the year went.
const tones: Readonly<Record<Story["chapters"][number]["tone"], string>> = {
  caution: "bg-destructive",
  plain: "bg-muted-foreground",
  positive: "bg-positive",
};

const tenths = ({ span }: Lived): number[] => [...span];

// One future lived through: what it came to and what its portfolio
// returned, in the story's two sentences, under what it is graded as,
// with the stepper handed in at the row's end; what it is worth as each
// year opens, drawn in the text's ink over the band the middle four in
// five of the run fall in and beside the plan at its own rates, dashed,
// ruled at the years its milestones and its retirement fall in, as the
// fan rules them, with what its portfolio returned each year as the
// plan lives it as a strip of bars beneath, a rise up and a fall down,
// each year under its own on the plot; and its years worth telling,
// down a line, each with the age reached in it. The crosshair reads a
// year's age and what is ruled in it, what the future and the plan's
// own rates are worth entering it, and what its portfolio returns in
// it, from the month the plan opens in its first. The chart is
// described by its caption, as the fan is. Where colours are forced,
// the line is drawn in the text's colour as the rest of the text is,
// and the dots keep their inks on the page's own ground.
export function FutureStory({
  future,
  outcome,
  plan,
  projected,
  stepper,
  story,
  years,
}: FutureStoryProps): JSX.Element {
  const lived: readonly Lived[] = years.map(
    ({ bottomTenth, topTenth, year }, offset) => ({
      lived: future.measured[offset]?.worth ?? 0,
      planned: projected.measured[offset]?.worth ?? 0,
      rate: story.returns[offset],
      span: [bottomTenth, topTenth],
      year,
    }),
  );
  const axis = axisOf(
    Math.min(0, ...lived.map((year) => Math.min(year.lived, year.planned))),
    Math.max(0, ...lived.map((year) => Math.max(year.lived, year.planned))),
  );
  const captionId = useId();
  const steepest = Math.max(
    ...story.returns.map((rate) => Math.abs(rate)),
    Number.EPSILON,
  );
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-2">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <Badge variant="outline">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full bg-current forced-color-adjust-none",
                outcomeInks[outcome],
              )}
              data-slot="outcome-dot"
            />
            {outcomeNames[outcome]}
          </Badge>
          {stepper}
        </div>
        <h3 className="heading text-2xl text-balance">{story.headline}</h3>
        <p className="text-sm text-pretty text-muted-foreground">
          {story.lede}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-1">
          <div className="flex aspect-[2/1] min-h-64 w-full flex-col text-foreground">
            <ChartContainer className="aspect-auto min-h-0 flex-1" config={{}}>
              <ComposedChart
                aria-describedby={captionId}
                data={[...lived]}
                margin={{ bottom: 0, left: 0, right: rightMargin, top: 8 }}
                title="What this future is worth as each year opens"
              >
                <XAxis
                  axisLine={false}
                  dataKey="year"
                  minTickGap={40}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  allowDataOverflow
                  axisLine={false}
                  domain={axis.domain}
                  tickFormatter={formatAxisGbp}
                  tickLine={false}
                  ticks={axis.ticks}
                  width={axisWidth}
                />
                <ChartTooltip
                  content={(props) => (
                    <LivedTooltip
                      {...props}
                      lived={lived}
                      marks={story.marks}
                      plan={plan}
                    />
                  )}
                />
                <Area
                  activeDot={false}
                  dataKey={tenths}
                  fill="var(--chart-2)"
                  fillOpacity={0.15}
                  isAnimationActive={false}
                  stroke="none"
                  type="monotone"
                />
                {story.marks.map(({ name, year }) => (
                  <ReferenceLine
                    key={`${name} ${String(year)}`}
                    stroke="var(--foreground)"
                    strokeOpacity={0.35}
                    x={year}
                  />
                ))}
                <Line
                  activeDot={false}
                  dataKey="planned"
                  dot={false}
                  isAnimationActive={false}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  type="monotone"
                />
                <Line
                  activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                  dataKey="lived"
                  dot={false}
                  isAnimationActive={false}
                  stroke="currentColor"
                  strokeWidth={2.5}
                  type="monotone"
                />
              </ComposedChart>
            </ChartContainer>
          </div>
          <svg
            aria-hidden
            className="h-10 w-full"
            data-slot="returns"
            preserveAspectRatio="none"
            style={{ paddingLeft: axisWidth, paddingRight: rightMargin }}
            viewBox={`0 0 ${String(Math.max(story.returns.length, 1))} 2`}
          >
            {lived.flatMap(({ rate, year }, offset) =>
              rate === undefined
                ? []
                : [
                    <rect
                      className={
                        rate < 0 ? "fill-destructive" : "fill-positive"
                      }
                      height={Math.abs(rate) / steepest}
                      key={year}
                      width={0.7}
                      x={offset + 0.15}
                      y={rate < 0 ? 1 : 1 - rate / steepest}
                    />,
                  ],
            )}
          </svg>
          <p className="text-xs text-muted-foreground" id={captionId}>
            {caption}
          </p>
        </div>
        <ol className="grid content-start">
          {story.chapters.map(({ body, title, tone, year }) => (
            <li
              className="relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 pb-5 last:pb-0"
              key={`${String(year)} ${title}`}
            >
              <span className="grid content-start text-right">
                <span className="figure text-sm">{year}</span>
                <span className="label text-muted-foreground">
                  {`Age\u00a0${String(ageIn(year, plan))}`}
                </span>
              </span>
              <span className="relative grid content-start gap-0.5 border-l pl-5">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[4.5px] size-2 rounded-full ring-4 ring-card forced-color-adjust-none forced-colors:ring-[Canvas]",
                    tones[tone],
                  )}
                  data-slot="chapter-dot"
                />
                <span className="text-sm font-medium">{title}</span>
                {body !== undefined && (
                  <span className="text-sm text-pretty text-muted-foreground">
                    {body}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// The story's frame while the run is drawn, the shape it lands in: the
// stepper handed in at the badge's row's end, the line saying what will
// be told in the headline's place and style, the lede with the plan's
// own rates and an ellipsis for each of the future's, the chart's box,
// the strip's and the caption. No years are told, since there is no
// future yet to tell.
export function HeldStory({
  plan,
  stepper,
}: {
  readonly plan: Plan;
  readonly stepper: ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-2">
        <div className="flex min-h-7 items-center justify-end gap-2">
          {stepper}
        </div>
        <h3 className="heading text-2xl text-balance text-muted-foreground">
          The middle future is told here once all are drawn.
        </h3>
        <p className="text-sm text-pretty text-muted-foreground">
          {heldLede(plan)}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-1">
          <div
            className="flex aspect-[2/1] min-h-64 w-full flex-col"
            data-slot="story-chart-held"
          />
          <div className="h-10 w-full" />
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
      </div>
    </div>
  );
}

// The year under the crosshair, the age reached in it and what is
// ruled in it, what the future and the plan at its own rates are worth
// entering it, and what its portfolio returns in it, where it has a
// year of it, over the months the plan holds of its first. A status,
// as the fan's is.
function LivedTooltip({
  active: isActive,
  label,
  lived,
  marks,
  plan,
}: Pick<FutureStoryProps, "plan"> &
  Pick<Story, "marks"> &
  TooltipContentProps & {
    readonly lived: readonly Lived[];
  }): JSX.Element | null {
  const year = lived.find((candidate) => candidate.year === label);
  if (!isActive || year === undefined) {
    return null;
  }
  const falling = marks
    .filter((mark) => mark.year === year.year)
    .map(({ name }) => name);
  return (
    <div className="grid min-w-48 gap-1.5 chart-tip" role="status">
      <span className="grid gap-0.5">
        <span className="font-medium">
          {`${String(year.year)} · Age ${String(ageIn(year.year, plan))}`}
        </span>
        {falling.length > 0 && (
          <span className="text-muted-foreground">
            {listed.format(falling)}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <span className="font-medium">This future</span>
        <span className="ml-auto figure font-medium">
          {formatGbp(year.lived)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-muted-foreground">
          {"At the plan's own rates"}
        </span>
        <span className="ml-auto figure font-medium">
          {formatGbp(year.planned)}
        </span>
      </span>
      {year.rate !== undefined && (
        <span className="flex items-center gap-2 border-t pt-1.5">
          <span className="text-muted-foreground">
            {year.year === plan.from && plan.month > 0
              ? `Portfolio return from ${monthName(plan.month, "long")}`
              : "Portfolio return"}
          </span>
          <span className="ml-auto figure font-medium">
            {formatPercent(year.rate)}
          </span>
        </span>
      )}
    </div>
  );
}
