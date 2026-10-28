"use client";

import type { JSX } from "react";
import type { TooltipContentProps } from "recharts";

import { cn } from "cn";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { Marker, Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Tie } from "@/data/schedule";
import type { Future, FutureYear } from "@/engine/futures";

import { MilestoneChips } from "@/components/app/molecules/milestone-chips";
import { SectionCard } from "@/components/app/organisms/section-card";
import { CardContent } from "@/components/kit/card";
import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { ageOf } from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { markersIn, reachedIn, yearsIn } from "@/engine/futures";
import { axisOf } from "@/lib/axis";
import { listed } from "@/lib/feeders";
import { formatAxisGbp, formatGbp, formatWholePercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";

interface FanTooltipProps {
  readonly markers: readonly Marker[];
  readonly plan: Plan;
  readonly run: number;
  readonly years: readonly FutureYear[];
}

interface FuturesFanProps {
  readonly futures: readonly Future[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
}

// The width the pounds' axis takes, held rather than measured, as the
// dashboard's chart holds its own and for the same reason: measured,
// recharts drops it back to its own 60px whenever it renders afresh,
// which here is on every slice of the run landing.
const axisWidth = 57;

// The plot's box: three times as wide as it is tall, down to a floor,
// and held to the card's width, in a column that grows no wider than the
// card. A box given a ratio and a floor widens to keep the ratio, and a
// column sized to what it holds widened with it, so on a phone the floor
// took the plot nearly three times past the card's edge. The chart fills
// the box rather than being it, as the progress chart's does, and for
// the same reason.
const plotBox = "aspect-[3/1] min-h-72 w-full";

// What the band of the middle half spans in a year, as recharts reads a
// range. Made once, as the tenths' is, so each band keeps the dataKey it
// had and recharts does not register it afresh on every render.
const quarters = ({ bottomQuarter, topQuarter }: FutureYear): number[] => [
  bottomQuarter,
  topQuarter,
];

// The lines the crosshair reads a year at, from the top of the fan down
// as the plot reads, each keyed as the band it bounds is drawn: the
// tenths' at a fifth, and the quarters' where their band lies over the
// tenths', at about a half.
const readings = [
  { fill: "bg-chart-2/20", key: "topTenth", name: "Top 10%" },
  { fill: "bg-chart-2/50", key: "topQuarter", name: "Top 25%" },
  { fill: "bg-chart-1", key: "middle", name: "Median" },
  { fill: "bg-chart-2/50", key: "bottomQuarter", name: "Bottom 25%" },
  { fill: "bg-chart-2/20", key: "bottomTenth", name: "Bottom 10%" },
] as const;

// What the band of the middle four in five spans in a year.
const tenths = ({ bottomTenth, topTenth }: FutureYear): number[] => [
  bottomTenth,
  topTenth,
];

// The run laid on the plan's years as a fan of what the futures are
// worth as each year opens, their net worth in today's money: the
// middle future as a line, the middle half of the futures shaded about
// it, and the middle four in five more faintly beyond that. No marks
// hang beneath it for the futures falling short: how many have run out
// is read under the crosshair, and when they fall short is said where
// the screen opens. The crosshair reads the year, the age and the
// milestones falling in it, the five lines in full pounds, and the
// share of the run out of money by then, on hover and on the arrow keys,
// and is announced to a screen reader as it moves, the chart being
// named for one. The milestones in the plan's years are faint lines in
// oxide, as the dashboard draws them, named by the chips beneath, and
// the one chosen is drawn solid until it is chosen again: one reached
// at an age where the plan lays it, and one reached when conditions
// hold in the year by which half the futures drawn so far have reached
// it, moving as the run comes in, as the lanes beneath read it, and
// not drawn while fewer than half have, its chip dashed and giving the
// share of the futures drawn so far that reach it in place of a year,
// or an ellipsis before the first are in. The pounds on
// the axis reach below nothing only as far as the bottom of the fan
// does, as a plan whose debts outweigh it can, on the dashboard's scale.
// The years are read off the run once for each run and plan, rather
// than on every render, as choosing a milestone is.
// While the first futures are drawn there is nothing to fan, and the
// card says so in the plot's place. The card lets the crosshair's
// figures out past its edge rather than clipping them, as the
// dashboard's does.
export function FuturesFan({
  futures,
  milestones,
  plan,
}: FuturesFanProps): JSX.Element {
  const [chosen, setChosen] = useState<Tie | undefined>();
  const end = endYear(plan);
  const markers = markersIn(futures, milestones, plan).filter(
    (marker) => marker.year >= plan.from && marker.year <= end,
  );
  const unplaced = milestones
    .filter(
      (milestone) =>
        ageOf(milestone) === undefined &&
        !markers.some(({ id }) => id === milestone.id),
    )
    .map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      reached:
        futures.length === 0
          ? null
          : futures.filter(
              (future) => reachedIn(future, milestone, plan) !== null,
            ).length / futures.length,
    }));
  const years = useMemo(() => yearsIn(futures, plan), [futures, plan]);
  const axis = axisOf(
    Math.min(0, ...years.map(({ bottomTenth }) => bottomTenth)),
    Math.max(0, ...years.map(({ topTenth }) => topTenth)),
  );
  return (
    <SectionCard
      caption="Median, middle half and middle 80%, in today's money"
      className="min-w-0 overflow-visible"
      label={subsectionLabel(chance, 1)}
      title="Year by year"
    >
      <CardContent className="grid grid-cols-1 gap-4">
        {futures.length === 0 ? (
          <p
            className={cn(
              "flex items-center justify-center text-sm text-muted-foreground",
              plotBox,
            )}
          >
            Drawing the first futures…
          </p>
        ) : (
          <div className={cn("flex flex-col", plotBox)}>
            <ChartContainer className="aspect-auto min-h-0 flex-1" config={{}}>
              <ComposedChart
                data={years}
                margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
                title="What the futures are worth as each year opens"
              >
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
                  domain={axis.domain}
                  tickFormatter={formatAxisGbp}
                  tickLine={false}
                  ticks={axis.ticks}
                  width={axisWidth}
                />
                <ChartTooltip
                  content={(props) => (
                    <FanTooltip
                      {...props}
                      markers={markers}
                      plan={plan}
                      run={futures.length}
                      years={years}
                    />
                  )}
                />
                <Area
                  activeDot={false}
                  dataKey={tenths}
                  fill="var(--chart-2)"
                  fillOpacity={0.2}
                  isAnimationActive={false}
                  stroke="none"
                  type="monotone"
                />
                <Area
                  activeDot={false}
                  dataKey={quarters}
                  fill="var(--chart-2)"
                  fillOpacity={0.35}
                  isAnimationActive={false}
                  stroke="none"
                  type="monotone"
                />
                <Line
                  activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                  dataKey="middle"
                  dot={false}
                  isAnimationActive={false}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  type="monotone"
                />
                {markers.map((marker) => (
                  <ReferenceLine
                    key={marker.id}
                    stroke="var(--brand)"
                    strokeOpacity={marker.id === chosen ? 1 : 0.35}
                    strokeWidth={marker.id === chosen ? 1.5 : 1}
                    x={marker.year}
                  />
                ))}
              </ComposedChart>
            </ChartContainer>
          </div>
        )}
        {(markers.length > 0 || unplaced.length > 0) && (
          <MilestoneChips
            markers={markers}
            onSelect={(tie) => {
              setChosen(tie === chosen ? undefined : tie);
            }}
            selected={chosen}
            unplaced={unplaced}
          />
        )}
      </CardContent>
    </SectionCard>
  );
}

// The year under the crosshair, the age reached that year and the
// milestones falling in it; what the futures are worth at each of the
// fan's lines, the median heavier; and the share of the run out of
// money by then. A status, so a screen reader reads it out as the
// crosshair steps, as recharts' own tooltip is. The year is found by the label the crosshair names
// rather than read out of the entry recharts hands over, which is
// untyped.
function FanTooltip({
  active: isActive,
  label,
  markers,
  plan,
  run,
  years,
}: FanTooltipProps & TooltipContentProps): JSX.Element | null {
  const year = years.find((candidate) => candidate.year === label);
  if (!isActive || year === undefined) {
    return null;
  }
  const falling = markers
    .filter((marker) => marker.year === year.year)
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
      {readings.map(({ fill, key, name }) => (
        <span className="flex items-center gap-2" key={key}>
          <span aria-hidden className={cn("size-2 rounded-full", fill)} />
          <span
            className={
              key === "middle" ? "font-medium" : "text-muted-foreground"
            }
          >
            {name}
          </span>
          <span className="ml-auto figure font-medium">
            {formatGbp(year[key])}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-2 border-t pt-1.5">
        <span aria-hidden className="size-2 rounded-full bg-destructive" />
        <span className="text-muted-foreground">Out of money</span>
        <span className="ml-auto figure font-medium">
          {formatWholePercent(year.outOfMoney / run)}
        </span>
      </span>
    </div>
  );
}
