"use client";

import type { JSX } from "react";
import type { TooltipContentProps } from "recharts";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { Plan } from "@/data/plan";
import type { Anchor } from "@/data/rates";

import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { ageIn, endAge, yearAt } from "@/data/plan";
import { bondsAt } from "@/data/rates";
import { formatPercent, formatWholePercent } from "@/lib/money";

interface GlideChartProps {
  readonly glide: readonly Anchor[];
  readonly plan: Plan;
}

// An age along the plan, and the split the glide path holds at it.
interface Row {
  readonly age: number;
  readonly bonds: number;
  readonly stocks: number;
}

type RowTooltipProps = TooltipContentProps & {
  readonly plan: Plan;
  readonly rows: readonly Row[];
};

// The one series, in the chart's own palette token.
const config = { bonds: { color: "var(--chart-2)", label: "Bonds" } };

// The glide path drawn over the plan's years, from the age its owner is
// now to the age it runs to, a point a year: the share in bonds as a
// line over a wash of its own colour, straight between anchors and flat
// beyond them, as the plan reads it, washed as the progress chart washes
// its balances. Equities are what the line leaves, so they are not drawn
// as well; a slab of them filling the plot to the whole was most of its
// ink and said nothing the line did not. The share is scaled from
// nothing to the first quarter above the highest the path reaches
// within the plan, so a path of ten to thirty-five points fills the
// plot rather than its foot, and one that reaches all of the savings is
// scaled to the whole. Each
// anchor within the plan is ringed on the line, the ring the card's
// colour so it reads as a gap in it, and the owner's retirement is
// marked as the curve marks its horizon, with a faint rule. The ages
// are ruled at each decade. What a year holds is shown on hover or on
// the arrow keys, its age, its year and the split; the anchors are
// listed beneath, which is the table to read them from.
export function GlideChart({ glide, plan }: GlideChartProps): JSX.Element {
  const washId = useId();
  const from = ageIn(plan.from, plan);
  const to = endAge(plan);
  const rows = Array.from({ length: to - from + 1 }, (_, offset): Row => {
    const age = from + offset;
    const bonds = bondsAt(glide, age) ?? 0;
    return { age, bonds, stocks: 1 - bonds };
  });
  const axis = shareAxisOf(Math.max(...rows.map(({ bonds }) => bonds)));
  return (
    <ChartContainer className="aspect-[3/1] min-h-56 w-full" config={config}>
      <AreaChart
        data={rows}
        margin={{ bottom: 0, left: 0, right: 12, top: 20 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="age"
          domain={[from, to]}
          tickLine={false}
          tickMargin={8}
          ticks={rows.filter(({ age }) => age % 10 === 0).map(({ age }) => age)}
          type="number"
        />
        <YAxis
          axisLine={false}
          domain={axis.domain}
          tickFormatter={(share: number) => formatWholePercent(share)}
          tickLine={false}
          ticks={axis.ticks}
          width={48}
        />
        <ChartTooltip
          content={(props) => <RowTooltip {...props} plan={plan} rows={rows} />}
          cursor={false}
        />
        <defs>
          <linearGradient id={washId} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-bonds)"
              stopOpacity={0.35}
            />
            <stop
              offset="100%"
              stopColor="var(--color-bonds)"
              stopOpacity={0.05}
            />
          </linearGradient>
        </defs>
        <Area
          activeDot={false}
          dataKey="bonds"
          fill={`url(#${washId})`}
          isAnimationActive={false}
          stroke="var(--color-bonds)"
          strokeWidth={2}
          type="linear"
        />
        {plan.retires >= from && plan.retires <= to && (
          <ReferenceLine
            label={{
              fill: "var(--foreground)",
              fontSize: 12,
              position: "top",
              value: `Retires ${String(plan.retires)}`,
            }}
            stroke="var(--brand)"
            strokeOpacity={0.35}
            x={plan.retires}
          />
        )}
        {glide
          .filter(({ age }) => age >= from && age <= to)
          .map(({ age, bonds }) => (
            <ReferenceDot
              fill="var(--card)"
              key={age}
              r={4}
              stroke="var(--foreground)"
              strokeWidth={2}
              x={age}
              y={bonds}
              zIndex={700}
            />
          ))}
      </AreaChart>
    </ChartContainer>
  );
}

// What the pointer or the arrow keys rest on: the age, the year it falls
// in, and the split the glide path holds at it.
function RowTooltip({
  active: isActive,
  label,
  plan,
  rows,
}: RowTooltipProps): JSX.Element | null {
  const row = rows.find(({ age }) => age === label);
  if (!isActive || row === undefined) {
    return null;
  }
  return (
    <div
      className="grid gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
      data-slot="glide-tooltip"
    >
      <span className="label text-muted-foreground">{`Age ${String(row.age)} · ${String(yearAt(row.age, plan))}`}</span>
      <span className="figure">{`Bonds ${formatPercent(row.bonds)}`}</span>
      <span className="figure">{`Equities ${formatPercent(row.stocks)}`}</span>
    </div>
  );
}

// The share the axis reaches to and the shares it is ruled at: the
// first quarter above the highest the path reaches, so the line never
// runs along the top edge, or the whole, for a path reaching three
// quarters or more; ruled at every fifth of it up to a half, so each
// rule is a whole five or ten points, and at every quarter above.
function shareAxisOf(highest: number): {
  readonly domain: [number, number];
  readonly ticks: number[];
} {
  const top = [0.25, 0.5, 0.75].find((quarter) => quarter > highest) ?? 1;
  const step = top <= 0.5 ? top / 5 : 0.25;
  return {
    domain: [0, top],
    ticks: Array.from(
      { length: Math.round(top / step) + 1 },
      (_, place) => place * step,
    ),
  };
}
