"use client";

import type { JSX, ReactNode } from "react";
import type { TooltipContentProps } from "recharts";

import { cn } from "cn";
import { ChartArea, ChartColumnStacked, Droplet, Landmark } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
import { isAsset } from "@/data/accounts";
import { balanceIn, balanceOf, holdsAnything } from "@/engine/projection";
import { axisOf } from "@/lib/axis";
import { listed } from "@/lib/feeders";
import { formatAxisGbp, formatGbp } from "@/lib/money";
import { accountsAndAssets } from "@/lib/nav";

// What the chart counts: the money the plan could spend, its savings less
// every debt, with a house or a car left out and the loan on it owed as
// any debt is; or all it is worth, a house or a car counted at its
// equity, the loan secured on it drawn in it.
type Basis = "liquidity" | "net-worth";

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

// What the chart draws for an account: the ids of the accounts it sums,
// the account's own and, for a house, a car or another real asset, each
// loan secured on it, so it stands at its equity; the account's name;
// whether it is a debt; the colour it is drawn in, and the key that
// colour is written under. The colour is named once: the container
// writes it into --color-<key> within its own scope, and everything
// drawn for the series, the tooltip's key included, reads it back from
// there. Last, what the series stands at on a point, as a function of
// its own, which its column takes as the dataKey: made with the series,
// it is the same function for as long as the series is.
interface Series {
  readonly color: string;
  readonly ids: readonly number[];
  readonly isOwed: boolean;
  readonly key: string;
  readonly name: string;
  readonly valueAt: (point: ProjectionPoint) => number;
}

// The families the chart stacks, in the order they stack, the first at
// the baseline: the pensions, then the ISAs, so the top of the two is
// where the balance a milestone is read at stands; then cash; then what
// the plan owns, a house, a car or another real asset, above them all,
// each at its equity: what it is worth less the loans secured on it,
// which are drawn in it rather than on their own.
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

// What each basis is called, on its switch and on the total under the
// crosshair, which is what the stack comes to on it.
const basisNames: Record<Basis, string> = {
  liquidity: "Liquidity",
  "net-worth": "Net worth",
};

// The height of the plot's box, the frames standing in for it and the
// empty state in its place: three times as wide as it is tall, down to a
// floor that is higher on a phone, where the choices take a row of
// their own above the plot.
const boxSize = "aspect-[3/1] min-h-90 sm:min-h-72";

// The width the pounds' axis takes, held rather than measured. The
// widest label it writes, "−£2.55m", is 49px in the tick's face, and
// recharts sets a label 8px clear of the plot. Measured, the axis cost
// every column two more draws whenever the axis was drawn again, which
// is on every age dragged and every basis switched: recharts registers
// the axis afresh each time it renders, and registering it afresh drops
// the width it measured back to its own 60px until it measures again.
const axisWidth = 57;

// The dashboard's chart: the accounts the plan holds or owes, projected
// a year at a time and each drawn on its own, what it holds stacked up
// from nothing and what it owes down from it, as a column per year to
// begin with or, on the toggle, as areas under lines. It counts the
// plan's liquidity to begin with, the savings less every debt, and on
// a second toggle its net worth, a house or a car at its equity with
// the loans secured on it. The plot alone, with no figure
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
// and goes undrawn. The toggles take their row from
// inside the plot's box rather than adding one over it, so the box is
// the same height as the frames that stand in for it and nothing shifts
// when the chart arrives; whatever controls the caller gives for what
// is plotted share the row, at its left, the toggles keeping the right,
// side by side and on a phone one above the other,
// and the choices it gives between them, or on a row of their own
// beneath on a phone. The row centres what shares it, so a field there,
// its label above its box and its hint beneath a line each, stands with
// its box level with the choices and the toggles, where aligning their
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
  const [basis, setBasis] = useState<Basis>("liquidity");
  const [mark, setMark] = useState<Mark>("bar");
  // Memoised by hand, as the board memoises its points: left to the
  // compiler, the series shared one scope with the milestone chosen, so
  // choosing one gave every mark a new dataKey and recharts recomputed
  // every column to move a line. Both bases are made at once, from one
  // series for each account, so a column the basis switched to still
  // draws keeps the dataKey it had, and recharts does not draw it again
  // before its figures have moved.
  const bases = useMemo(() => seriesOf(accounts), [accounts]);
  const series = bases[basis];

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
  // only when the chart is a bar chart by name. Either mark stacks in
  // one, split by sign, so what is held stacks up from nothing and what
  // is owed down from it, and a series whose sign turns crosses nothing
  // rather than digging into the stack it left; two stacks, one a sign,
  // would set a year's columns side by side.
  const Plot = mark === "bar" ? BarChart : AreaChart;

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
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
            <BasisToggle basis={basis} onBasisChange={setBasis} />
            <MarkToggle mark={mark} onMarkChange={setMark} />
          </div>
        </div>
        <ChartContainer className="aspect-auto min-h-0 flex-1" config={config}>
          <Plot
            data={points}
            margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
            stackOffset="sign"
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
              width={axisWidth}
            />
            <ChartTooltip
              content={(props) => (
                <ProjectionTooltip
                  {...props}
                  milestones={milestones}
                  points={points}
                  series={series}
                  total={basisNames[basis]}
                />
              )}
            />
            {series.map((line) =>
              mark === "area" ? (
                <Area
                  activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                  dataKey={drawnIn(line)}
                  dot={false}
                  fill={`url(#${washOf(line.key)})`}
                  isAnimationActive={false}
                  key={line.key}
                  stackId="accounts"
                  stroke={`var(--color-${line.key})`}
                  strokeWidth={2}
                  type="monotone"
                />
              ) : (
                <Bar
                  dataKey={line.valueAt}
                  fill={`var(--color-${line.key})`}
                  isAnimationActive={false}
                  key={line.key}
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

// The switch between the two bases: the name of the one counted now,
// with the switch on for the net worth. It sits beside the marks'
// switch, before it, at the right of the plot's top row.
function BasisToggle({
  basis,
  onBasisChange,
}: {
  readonly basis: Basis;
  readonly onBasisChange: (basis: Basis) => void;
}): JSX.Element {
  const isNetWorth = basis === "net-worth";
  return (
    <LabelledSwitch
      icon={isNetWorth ? Landmark : Droplet}
      isChecked={isNetWorth}
      onCheckedChange={(isChecked) => {
        onBasisChange(isChecked ? "net-worth" : "liquidity");
      }}
    >
      {basisNames[basis]}
    </LabelledSwitch>
  );
}

// What an area draws for an account, a year at a time: its balance, and
// a break for a debt that owes nothing, which is a debt paid off, so a
// debt leaves the plot once it reaches nothing. Its line ends with the
// last year it owes anything. Split by sign, a series of nothing counts
// as held, and a debt at nothing would draw its line along the top of
// the stack for the rest of the plan. The stack reads a break as
// nothing, so the debts beneath it stack as before.
function drawnIn(
  line: Pick<Series, "ids" | "isOwed">,
): (point: ProjectionPoint) => null | number {
  return (point) => {
    const value = valueIn(point, line);
    return line.isOwed && value === 0 ? null : value;
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
// owed, with what they come to beneath, named for the basis they are
// counted on, and under that, for a
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
  total,
}: Pick<ProjectionChartProps, "milestones" | "points"> &
  TooltipContentProps & {
    readonly series: readonly Series[];
    readonly total: string;
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
        ...series.filter((line) => line.isOwed && valueIn(point, line) !== 0),
      ].map((line) => (
        <span className="flex items-center gap-2" key={line.key}>
          <span
            aria-hidden
            className="h-0.5 w-3 rounded-full"
            style={{ backgroundColor: `var(--color-${line.key})` }}
          />
          <span className="text-muted-foreground">{line.name}</span>
          <span className="ml-auto figure font-medium">
            {formatGbp(valueIn(point, line))}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-2 border-t pt-1.5">
        <span className="text-muted-foreground">{total}</span>
        <span className="ml-auto figure font-medium">
          {formatGbp(
            series.reduce((sum, line) => sum + valueIn(point, line), 0),
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

// The pounds the axis spans and the ticks it marks, from the most the
// stack ever holds above nothing to the deepest it ever goes below it,
// what is owed and any equity below nothing.
function scaleOf(
  points: readonly ProjectionPoint[],
  series: readonly Series[],
): { readonly domain: [number, number]; readonly ticks: number[] } {
  const sumOf = (
    point: ProjectionPoint,
    side: (value: number) => number,
  ): number =>
    series.reduce((sum, line) => sum + side(valueIn(point, line)), 0);
  return axisOf(
    Math.min(
      0,
      ...points.map((point) => sumOf(point, (value) => Math.min(0, value))),
    ),
    Math.max(
      0,
      ...points.map((point) => sumOf(point, (value) => Math.max(0, value))),
    ),
  );
}

// Each account the chart draws, family by family in the order they
// stack, and within a family in the order the accounts are listed. The
// accounts of a family take its hues in turn, and each round of them
// after the first recedes a further 30% toward the card, to 60% at
// most, so the family is told by hue and its accounts from each other
// by hue where it has more than one and by lightness after that, in
// either theme. An account's colour follows its place among every
// account of its kind, so neither what else the plan holds nor the
// basis it is counted on ever recolours it. On liquidity a house, a car
// or another real asset is left out, and every debt is drawn, the loans
// on them among them; on the net worth each asset is drawn at its
// equity, and a loan secured on it is drawn in it rather than among the
// debts. A loan is drawn in the asset it names only when the plan lists
// that asset; one naming an asset the plan does not list is a debt like
// any other. Each account's series is made once, for both bases, and
// each basis draws the ones it counts, so an account either basis draws
// is drawn from the one series on both.
function seriesOf(
  accounts: readonly Account[],
): Record<Basis, readonly Series[]> {
  const assets = new Set(accounts.filter(isAsset).map(({ id }) => id));
  const isSecured = ({ secures }: Account): boolean =>
    secures !== undefined && assets.has(secures);
  const drawn = families.flatMap(({ hues, kinds }) =>
    accounts
      .filter(({ kind }) => kinds.includes(kind))
      .map((account, place) => {
        const { id, kind, name } = account;
        const ids = [
          id,
          ...accounts
            .filter((loan) => isSecured(loan) && loan.secures === id)
            .map((loan) => loan.id),
        ];
        const series: Series = {
          color: `color-mix(in oklab, ${hueAt(hues, place)}, var(--card) ${String(Math.min(Math.floor(place / hues.length), 2) * 30)}%)`,
          ids,
          isOwed: kind === "debt",
          key: `account-${String(id)}`,
          name,
          valueAt: (point) => valueIn(point, { ids }),
        };
        return { account, series };
      }),
  );
  const counted = (isCounted: (account: Account) => boolean): Series[] =>
    drawn
      .filter(({ account }) => isCounted(account))
      .map(({ series }) => series);
  return {
    liquidity: counted((account) => !isAsset(account)),
    "net-worth": counted((account) => !isSecured(account)),
  };
}

// What a series stands at on a point: what the accounts it sums hold,
// less what they owe.
function valueIn(point: ProjectionPoint, { ids }: Pick<Series, "ids">): number {
  return ids.reduce((sum, id) => sum + balanceIn(point, id), 0);
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
