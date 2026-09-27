"use client";

import type { JSX, ReactNode } from "react";
import type { TooltipContentProps } from "recharts";

import { cn } from "cn";
import { ChartArea, ChartColumnStacked } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  getNiceTickValues,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { Account, AccountKind } from "@/data/accounts";
import type { Marker } from "@/data/milestones";
import type { Tie } from "@/data/schedule";
import type { ProjectionPoint } from "@/engine/projection";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { LabelledSwitch } from "@/components/app/atoms/labelled-switch";
import { buttonVariants } from "@/components/kit/button";
import { Card, CardContent } from "@/components/kit/card";
import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { balanceIn, balanceOf, holdsAnything } from "@/engine/projection";
import { listed } from "@/lib/feeders";
import { formatAxisGbp, formatGbp } from "@/lib/money";
import { accountsAndAssets } from "@/lib/nav";

// The kinds of account that share a colour, and the hues they are drawn
// in, from the palette's tokens, which name a colour by what it means.
// The accounts of one family take its hues in turn, and once each hue
// has been taken are told from the ones before by lightness.
interface Family {
  readonly hues: Hues;
  readonly kinds: readonly AccountKind[];
}

// A family's hues: one at least.
type Hues = readonly [string, ...string[]];

// The mark each series is drawn as: a column per year, or an area
// under a line. The series stack either way, what is held up from nothing
// and what is owed down from it.
type Mark = "area" | "bar";

interface ProjectionChartProps {
  readonly accounts: readonly Account[];
  readonly choices?: ReactNode;
  readonly controls?: ReactNode;
  readonly milestones: readonly Marker[];
  readonly points: readonly ProjectionPoint[];
  readonly selected?: Tie | undefined;
}

// An account the chart draws on its own: its id, its name, whether it
// is a debt, the colour it is drawn in, and the key that colour is
// written under. The colour is named once: the container writes it into
// --color-<key> within its own scope, and everything drawn for the
// series, the tooltip's key included, reads it back from there.
interface Series {
  readonly color: string;
  readonly id: number;
  readonly isOwed: boolean;
  readonly key: string;
  readonly name: string;
}

// The families the chart stacks, in the order they stack, the first at
// the baseline: the pensions, then the ISAs, so the top of the two is
// where the balance a milestone is read at stands; then cash; then what
// the plan owns, a house, a car or another real asset, above them all.
// The wrappers keep the colours they had, and cash and the assets take
// the palette's colours for cash and for property. The debts stack down
// from nothing, the first listed nearest it, in the palette's reds and
// its orange: loss red, which the palette gives debt, then oxide, then
// ochre, since three debts in one red would be told apart by lightness
// alone.
const families: readonly Family[] = [
  { hues: ["var(--chart-2)"], kinds: ["tax-deferred"] },
  { hues: ["var(--chart-1)"], kinds: ["tax-free"] },
  { hues: ["var(--chart-4)"], kinds: ["cash"] },
  { hues: ["var(--chart-3)"], kinds: ["house", "car", "real-asset"] },
  {
    hues: ["var(--chart-5)", "var(--brand)", "var(--caution)"],
    kinds: ["debt"],
  },
];

// The height of the plot's box, the frames standing in for it and the
// empty state in its place: three times as wide as it is tall, down to a
// floor that is higher on a phone, where the choices take a row of
// their own above the plot.
const boxSize = "aspect-[3/1] min-h-90 sm:min-h-72";

// The dashboard's chart: every account the plan holds or owes, projected
// a year at a time and each drawn on its own, what it holds stacked up
// from nothing and what it owes down from it, as a column per year to
// begin with or, on the toggle, as areas under lines. The plot alone,
// with no figure
// over it: a hairline grid, the years and the pounds as recessive ticks,
// and a crosshair with the year's figures on hover and on the arrow
// keys, which names each series beside its figure, so no legend names
// them again beneath the plot. The pounds on the axis are shortened to
// millions and thousands, "£12m" and "£500k", since a tick marks a place
// on the scale and full pounds took a quarter of a phone's plot; every
// figure under the crosshair is written in full, as money is everywhere
// else here. The first year the plan cannot cover is marked
// where it falls, a dashed hairline under either mark, and that year's
// shortfall joins its figures under the crosshair rather than the
// stack, which carries balances alone. The first year that draws on a
// pension before the pension age is marked the same way in the caution
// tone, since a plan that lasts only by paying the charge on that is not
// one that works, and what a year drew so joins its figures too. The
// early mark's label sits a line beneath the run-out mark's and to the
// right of its own line where the other's is to the left, so neither
// writes over the other a year apart or in the one year. Every
// milestone is marked too, retirement among them, as a faint hairline
// in oxide, the palette's colour for milestones, and the one the caller
// says is chosen as a solid line with a dot on the top of the wrappers,
// where the balance it is read at stands. A milestone's line carries no
// name: on a phone a year is a few pixels wide and a name spans more
// than a decade, so the names are the caller's to give, as the choices
// it sets above the plot, and the crosshair names the milestones in its
// year. A milestone outside the plan's years has no year to stand on
// and goes undrawn. The toggle takes its row from
// inside the plot's box rather than adding one over it, so the box is
// the same height as the frames that stand in for it and nothing shifts
// when the chart arrives; whatever controls the caller gives for what
// is plotted share the row, at its left, the toggle keeping the right,
// and the choices it gives between them, or on a row of their own
// beneath on a phone. The row centres what shares it, so a field there,
// its label above its box and its hint beneath a line each, stands with
// its box level with the choices and the toggle, where aligning their
// feet set them level with its hint. The rows stand a gap clear of the
// plot, so a figure box above the top tick does not crowd it. The box is three
// times as wide as it is tall down to a floor, and every frame with it:
// the rows and the axis take the same height at any width,
// and on a phone a third of the width is less than they need, which
// left no plot at all, so the floor there is higher again.
// A projection of nothing, because the plan
// holds nothing yet, says so in the plot's place rather than drawing a
// flat zero over a column of £0 ticks, and points at the screen where
// an account is added: the dashboard has no way to add one itself.
export function ProjectionChart({
  accounts,
  choices,
  controls,
  milestones,
  points,
  selected,
}: ProjectionChartProps): JSX.Element {
  const [mark, setMark] = useState<Mark>("bar");

  if (!points.some(holdsAnything)) {
    return (
      <Frame>
        <EmptyState
          className={boxSize}
          description="Add an account or an asset to see it projected."
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
  // only when the chart is a bar chart by name. The columns stack in one,
  // split by sign, since two stacks set a year's columns side by side;
  // the areas stack in two, what is held and what is owed, since split
  // by sign a series of nothing counts as held, and a debt paid off would
  // draw its line along the top of the stack from the year it cleared. A
  // column of nothing draws nothing wherever it stands.
  const Plot = mark === "bar" ? BarChart : AreaChart;

  const series = seriesOf(accounts);
  const config = Object.fromEntries(
    series.map(({ color, key, name }) => [key, { color, label: name }]),
  );
  const scale = scaleOf(points, series);

  // The first year that could not draw what it needed from anywhere,
  // which is the year the money runs out. Undefined while every year
  // covers itself, and the mark goes undrawn.
  const runsOut = points.find((point) => point.uncovered > 0);

  // The first year that drew on a pension before it could be drawn as
  // income, at the charge on taking it early. Undefined while no year
  // does, and the mark goes undrawn.
  const drawsEarly = points.find((point) => point.early > 0);

  // The milestones the plan's years reach, and the point the chosen one
  // stands on, if it is among them.
  const marked = milestones.filter((marker) =>
    points.some((point) => point.year === marker.year),
  );
  const chosen = points.find(
    (point) => point.year === marked.find(({ id }) => id === selected)?.year,
  );

  return (
    <Frame>
      <div className={cn("flex w-full flex-col gap-4", boxSize)}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div>{controls}</div>
          {choices !== undefined && (
            <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              {choices}
            </div>
          )}
          <MarkToggle mark={mark} onMarkChange={setMark} />
        </div>
        <ChartContainer className="aspect-auto min-h-0 flex-1" config={config}>
          <Plot
            data={points}
            margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
            stackOffset={mark === "bar" ? "sign" : "none"}
          >
            {mark === "area" && (
              <defs>
                {series.map(({ isOwed, key }) => (
                  <linearGradient
                    id={washOf(key)}
                    key={key}
                    x1="0"
                    x2="0"
                    y1={isOwed ? "1" : "0"}
                    y2={isOwed ? "0" : "1"}
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
              domain={scale.domain}
              tickFormatter={formatAxisGbp}
              tickLine={false}
              ticks={scale.ticks}
              width="auto"
            />
            <ChartTooltip
              content={(props) => (
                <ProjectionTooltip
                  {...props}
                  milestones={milestones}
                  points={points}
                  series={series}
                />
              )}
            />
            {series.map(({ id, isOwed, key }) =>
              mark === "area" ? (
                <Area
                  activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                  dataKey={drawnIn({ id, isOwed })}
                  dot={false}
                  fill={`url(#${washOf(key)})`}
                  isAnimationActive={false}
                  key={key}
                  stackId={isOwed ? "owed" : "held"}
                  stroke={`var(--color-${key})`}
                  strokeWidth={2}
                  type="monotone"
                />
              ) : (
                <Bar
                  dataKey={(point: ProjectionPoint) => balanceIn(point, id)}
                  fill={`var(--color-${key})`}
                  isAnimationActive={false}
                  key={key}
                  stackId="accounts"
                />
              ),
            )}
            {marked.map((marker) => (
              <ReferenceLine
                key={marker.id}
                stroke="var(--brand)"
                strokeOpacity={marker.id === selected ? 1 : 0.35}
                strokeWidth={marker.id === selected ? 1.5 : 1}
                x={marker.year}
              />
            ))}
            {chosen !== undefined && (
              <ReferenceDot
                fill="var(--brand)"
                r={4}
                stroke="var(--card)"
                strokeWidth={2}
                x={chosen.year}
                y={balanceOf(chosen)}
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

// What an area draws for an account, a year at a time: its balance, and
// a break for a debt that owes nothing, which is a debt paid off, so a
// debt leaves the plot once it reaches nothing rather than running
// along the axis for the rest of the plan. Its line ends with the last
// year it owes anything. The stack reads a break as nothing, so the
// debts beneath it stack as before.
function drawnIn({
  id,
  isOwed,
}: Pick<Series, "id" | "isOwed">): (point: ProjectionPoint) => null | number {
  return (point) => {
    const balance = balanceIn(point, id);
    return isOwed && balance === 0 ? null : balance;
  };
}

// The card around the plot, which lets what is drawn over the plot out
// past its edge rather than clipping it as a card clips its contents:
// the crosshair's figures run to a line for every account, taller than
// the plot beside a plan of a few, and the last of them is the total.
// Clipping is also what held the card to the width of its column,
// since an item that clips may shrink below its contents, so it is
// held there by name: unheld, it took the width of what it holds, and a
// phone's page scrolled sideways to nearly three times its width.
function Frame({ children }: { readonly children: JSX.Element }): JSX.Element {
  return (
    <Card className="min-w-0 overflow-visible">
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// The hue a family draws the account at a place among its kind in: its
// hues taken in turn, the first again once each has been taken.
function hueAt(hues: Hues, place: number): string {
  return hues.reduce(
    (hue, next, index) => (index === place % hues.length ? next : hue),
    hues[0],
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
    <p
      className={cn(
        "flex w-full items-center justify-center text-sm text-muted-foreground",
        boxSize,
      )}
    >
      {children}
    </p>
  );
}

// The year under the crosshair, the age reached that year and the
// milestones falling in it, and each account's figure, from the top of
// the stack down as the plot reads, what is held and then what is
// owed, with the net worth they come to beneath, and under that, for a
// year that drew on a pension early, what
// it drew so, and for a year that came up short, what it could not
// cover. The values lead, in mono, with
// a stroke of the series' colour keying the name beside each. The point
// is found by the year the crosshair names rather than read out of the
// entry recharts hands over, which is untyped.
function ProjectionTooltip({
  active: isActive,
  label,
  milestones,
  points,
  series,
}: Pick<ProjectionChartProps, "milestones" | "points"> &
  TooltipContentProps & {
    readonly series: readonly Series[];
  }): JSX.Element | null {
  const point = points.find((candidate) => candidate.year === label);
  if (!isActive || point === undefined) {
    return null;
  }
  const falling = milestones
    .filter((marker) => marker.year === point.year)
    .map(({ name }) => name);
  return (
    <div
      className="grid min-w-44 gap-1.5 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      data-slot="projection-tooltip"
    >
      <span className="grid gap-0.5">
        <span className="font-medium">
          {`${String(point.year)} · Age ${String(point.age)}`}
        </span>
        {falling.length > 0 && (
          <span className="text-muted-foreground">
            {listed.format(falling)}
          </span>
        )}
      </span>
      {[
        ...series.filter(({ isOwed }) => !isOwed).reverse(),
        ...series.filter(
          ({ id, isOwed }) => isOwed && balanceIn(point, id) !== 0,
        ),
      ].map(({ id, key, name }) => (
        <span className="flex items-center gap-2" key={key}>
          <span
            aria-hidden
            className="h-0.5 w-3 rounded-full"
            style={{ backgroundColor: `var(--color-${key})` }}
          />
          <span className="text-muted-foreground">{name}</span>
          <span className="ml-auto figure font-medium">
            {formatGbp(balanceIn(point, id))}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-2 border-t pt-1.5">
        <span className="text-muted-foreground">Net worth</span>
        <span className="ml-auto figure font-medium">
          {formatGbp(
            series.reduce((sum, { id }) => sum + balanceIn(point, id), 0),
          )}
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

// The pounds the axis spans and the ticks it marks. Above nothing they
// are the ticks recharts would choose itself for the most the stack
// ever holds, the last at or above it. Below nothing the axis reaches
// only as deep as the debts ever go, marked at the same step as far as
// they reach one: recharts spaces its ticks evenly either side of
// nothing, so £400,000 owed under £10m held took the axis down to
// minus £3.5m and gave a quarter of the plot to nothing. The step is set
// by the deeper of the two sides, so a plan of debts alone is marked
// as one of savings alone would be.
function scaleOf(
  points: readonly ProjectionPoint[],
  series: readonly Series[],
): { readonly domain: [number, number]; readonly ticks: number[] } {
  const sumOf = (point: ProjectionPoint, isOwed: boolean): number =>
    series
      .filter((line) => line.isOwed === isOwed)
      .reduce((sum, { id }) => sum + balanceIn(point, id), 0);
  const top = Math.max(0, ...points.map((point) => sumOf(point, false)));
  const bottom = Math.min(0, ...points.map((point) => sumOf(point, true)));
  const nice = getNiceTickValues(
    [0, Math.max(top, -bottom)],
    5,
    true,
    "adaptive",
  );
  const step = Math.max(...nice) / (nice.length - 1);
  const above = nice.filter((tick) => tick - step < top);
  const below = Array.from(
    { length: Math.floor(-bottom / step) },
    (_, place) => -(place + 1) * step,
  ).reverse();
  return { domain: [bottom, Math.max(...above)], ticks: [...below, ...above] };
}

// Each account the chart draws, family by family in the order they
// stack, and within a family in the order the accounts are listed. The
// accounts of a family take its hues in turn, and each round of them
// after the first recedes a further 30% toward the card, to 60% at
// most, so the family is told by hue and its accounts from each other
// by hue where it has more than one and by lightness after that, in
// either theme. An account's colour follows its place among its own
// kind, so what else the plan holds never recolours it.
function seriesOf(accounts: readonly Account[]): Series[] {
  return families.flatMap(({ hues, kinds }) =>
    accounts
      .filter(({ kind }) => kinds.includes(kind))
      .map(({ id, kind, name }, place) => ({
        color: `color-mix(in oklab, ${hueAt(hues, place)}, var(--card) ${String(Math.min(Math.floor(place / hues.length), 2) * 30)}%)`,
        id,
        isOwed: kind === "debt",
        key: `account-${String(id)}`,
        name,
      })),
  );
}

// The area under each line is its series' colour fading from a quarter
// at the line to nothing at the edge it stacks from, the line beneath
// it for what is held and the one above it for what is owed, rather
// than a flat tenth. The light theme's petrol has too little chroma for a flat tint
// to read as anything but grey, and the hue matters most along the
// curve. One chart per page, so the gradients' ids are the series' own.
function washOf(key: string): string {
  return `projection-wash-${key}`;
}
