"use client";

import type { JSX } from "react";
import type { TooltipContentProps } from "recharts";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { Curve } from "@/data/inflation";

import { ChartContainer, ChartTooltip } from "@/components/kit/chart";
import { horizon, maturities } from "@/data/inflation";
import { formatCurveRate, formatPercent } from "@/lib/money";

interface CurveChartProps {
  readonly curve: Curve;
  readonly derived: number;
}

// The series the chart draws, in the chart's own palette token.
const config = {
  implied: { color: "var(--chart-1)", label: "Implied inflation" },
};

// The curve drawn: the implied inflation at each maturity the plan reads,
// on a scale of years from the shortest to the longest, joined straight,
// since nothing is read between them, the horizon's point marked as the
// dashboard marks retirement, with a rule up to it and its rate beside
// it, and the inflation derived from it as a dashed line across, named
// where it ends. The gap between the curve at the horizon and the dashed
// line is then what the wedge and the premium take off, the steps of the
// ledger beside it drawn as one distance. The horizon's point is set
// apart by its rule, its size, its ring and its label as well as by its
// colour, since the brand and the series' green are near for a reader
// without red. Its ring, and the one on a point the pointer rests on,
// are the sunken panel's colour, so each reads as a gap in the line, and
// it is drawn a layer above the line's own dots, which share recharts'
// layer for dots with it and would otherwise cover it. A rate is shown on hover or on the arrow keys, its
// maturity and its figure. One series, named by the panel's heading, so
// there is no legend; the figures are listed beneath, which is the
// table to read them from.
export function CurveChart({ curve, derived }: CurveChartProps): JSX.Element {
  const points = maturities.map((years) => ({
    implied: curve.implied[years],
    years,
  }));
  return (
    <ChartContainer className="aspect-[4/3] w-full" config={config}>
      <LineChart
        data={points}
        margin={{ bottom: 0, left: 0, right: 16, top: 20 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="years"
          domain={[Math.min(...maturities), Math.max(...maturities)]}
          padding={{ left: 12, right: 12 }}
          tickFormatter={(years: number) => `${String(years)}y`}
          tickLine={false}
          tickMargin={8}
          ticks={[...maturities]}
          type="number"
        />
        <YAxis
          axisLine={false}
          domain={["auto", "auto"]}
          tickFormatter={(rate: number) => formatPercent(rate)}
          tickLine={false}
          width={48}
        />
        <ChartTooltip
          content={(props) => <CurveTooltip {...props} curve={curve} />}
          cursor={false}
        />
        <ReferenceLine
          ifOverflow="extendDomain"
          label={{
            fill: "var(--muted-foreground)",
            fontSize: 12,
            position: "insideBottomRight",
            value: `Derived ${formatPercent(derived)}`,
          }}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          y={derived}
        />
        <ReferenceLine stroke="var(--brand)" strokeOpacity={0.35} x={horizon} />
        <Line
          activeDot={{ r: 5, stroke: "var(--muted)", strokeWidth: 2 }}
          dataKey="implied"
          dot={{ fill: "var(--color-implied)", r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
          stroke="var(--color-implied)"
          strokeWidth={2}
          type="linear"
        />
        <ReferenceDot
          fill="var(--brand)"
          label={{
            fill: "var(--foreground)",
            fontSize: 12,
            position: "top",
            value: `${String(horizon)}y ${formatCurveRate(curve.implied[horizon])}`,
          }}
          r={5}
          stroke="var(--muted)"
          strokeWidth={2}
          x={horizon}
          y={curve.implied[horizon]}
          zIndex={700}
        />
      </LineChart>
    </ChartContainer>
  );
}

// What the pointer or the arrow keys rest on: the maturity and the rate
// the curve implies there.
function CurveTooltip({
  active: isActive,
  curve,
  label,
}: TooltipContentProps & { readonly curve: Curve }): JSX.Element | null {
  const years = maturities.find((maturity) => maturity === label);
  if (!isActive || years === undefined) {
    return null;
  }
  return (
    <div
      className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
      data-slot="curve-tooltip"
    >
      <span className="figure">{`${String(years)}y ${formatCurveRate(curve.implied[years])}`}</span>
    </div>
  );
}
