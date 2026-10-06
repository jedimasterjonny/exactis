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

import { MilestoneChips } from "@/components/app/atoms/milestone-chips";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { markersOf } from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { yearsIn } from "@/engine/futures";
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
// took the plot nearly three times past the card's edge.
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
  { key: "topTenth", name: "Top 10%", tone: "bg-chart-2/20" },
  { key: "topQuarter", name: "Top 25%", tone: "bg-chart-2/50" },
  { key: "middle", name: "Median", tone: "bg-chart-1" },
  { key: "bottomQuarter", name: "Bottom 25%", tone: "bg-chart-2/50" },
  { key: "bottomTenth", name: "Bottom 10%", tone: "bg-chart-2/20" },
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
// the one chosen is drawn solid until it is chosen again. The pounds on
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
  const markers = markersOf(milestones, plan).filter(
    (marker) => marker.year >= plan.from && marker.year <= end,
  );
  const years = useMemo(() => yearsIn(futures, plan), [futures, plan]);
  const axis = axisOf(
    Math.min(0, ...years.map(({ bottomTenth }) => bottomTenth)),
    Math.max(0, ...years.map(({ topTenth }) => topTenth)),
  );
  return (
    <SectionCard
      caption="What the futures are worth as each year opens, in today's money: the middle future as a line, the middle half of them shaded about it and the middle four in five more faintly. Hover or step along it to read a year."
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
          <ChartContainer className={plotBox} config={{}}>
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
        )}
        {markers.length > 0 && (
          <MilestoneChips
            markers={markers}
            onSelect={(tie) => {
              setChosen(tie === chosen ? undefined : tie);
            }}
            selected={chosen}
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
    <div
      className="grid min-w-48 gap-1.5 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      role="status"
    >
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
      {readings.map(({ key, name, tone }) => (
        <span className="flex items-center gap-2" key={key}>
          <span aria-hidden className={cn("size-2 rounded-full", tone)} />
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
