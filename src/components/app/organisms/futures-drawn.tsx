import type { JSX } from "react";

import type { Plan, Spread } from "@/data/plan";

import { Worksheet } from "@/components/app/atoms/worksheet";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { statedSpread } from "@/data/plan";
import { formatPercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";

interface FuturesDrawnProps {
  readonly plan: Plan;
  readonly spread: Spread;
}

// How many spreads a year one in ten lies from the middle year, below
// or above it: the normal distribution's tenth from the top.
const tenth = 1.2815515655446004;

// What the futures are drawn from, as a worksheet of the portfolio and
// prices: the rate each grows at in the middle year, how far a year
// strays from it, as its source states it rather than in the logs the
// draw takes, and where a year one in ten falls below and above it,
// so the spread reads as years rather than as a figure. The rates and
// the spread are set where they are sourced, on Assumptions.
export function FuturesDrawn({ plan, spread }: FuturesDrawnProps): JSX.Element {
  const yearAt = (rate: number, by: number, spreads: number): string =>
    formatPercent((1 + rate) * Math.exp(spreads * by) - 1);
  return (
    <SectionCard
      label={subsectionLabel(chance, 4)}
      title="What the futures are drawn from"
    >
      <CardContent>
        <Worksheet
          columns={["Portfolio", "Inflation"]}
          label="What the futures are drawn from"
          rows={[
            {
              figures: [
                formatPercent(plan.rate),
                formatPercent(plan.inflation),
              ],
              label: "Return, a year",
            },
            {
              figures: [
                formatPercent(statedSpread(plan.rate, spread.rate)),
                formatPercent(statedSpread(plan.inflation, spread.inflation)),
              ],
              label: "Strays by, a year",
            },
            {
              figures: [
                yearAt(plan.rate, spread.rate, -tenth),
                yearAt(plan.inflation, spread.inflation, -tenth),
              ],
              label: "Low year, one in ten",
            },
            {
              figures: [
                yearAt(plan.rate, spread.rate, tenth),
                yearAt(plan.inflation, spread.inflation, tenth),
              ],
              label: "High year, one in ten",
            },
          ]}
        />
      </CardContent>
    </SectionCard>
  );
}
