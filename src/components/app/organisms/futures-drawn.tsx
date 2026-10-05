import type { JSX } from "react";

import type { Plan, Spread } from "@/data/plan";

import { Worksheet } from "@/components/app/atoms/worksheet";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { statedSpread } from "@/data/plan";
import { formatCount } from "@/lib/count";
import { formatPercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";

interface FuturesDrawnProps {
  readonly count: number;
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
// so the spread reads as years rather than as a figure. Beneath, how the
// run is made, which is fixed rather than set: how many futures, how
// each is drawn, that every run draws the same ones, and what counts as
// lasting. The rates and the spread are set where they are sourced, on
// Assumptions.
export function FuturesDrawn({
  count,
  plan,
  spread,
}: FuturesDrawnProps): JSX.Element {
  const yearAt = (rate: number, by: number, spreads: number): string =>
    formatPercent((1 + rate) * Math.exp(spreads * by) - 1);
  return (
    <SectionCard
      caption="Each future draws a year of returns and a year of prices at a time, about the plan's own rates, as far either side as the markets are expected to stray."
      label={subsectionLabel(chance, 3)}
      title="What the futures are drawn from"
    >
      <CardContent className="grid gap-6">
        <Worksheet
          columns={["Portfolio", "Inflation"]}
          label="What the futures are drawn from"
          rows={[
            {
              detail:
                "The plan rate and the inflation it runs on, as Assumptions sets them. The middle year of the draws grows at them.",
              figures: [
                formatPercent(plan.rate),
                formatPercent(plan.inflation),
              ],
              label: "Return, a year",
            },
            {
              detail:
                "The portfolio by the CMA's volatilities, blended by the target allocation and held in the plan's split; prices by a standing figure, about as far as UK CPI has strayed since 1997. Each is drawn in logs about the year's rate.",
              figures: [
                formatPercent(statedSpread(plan.rate, spread.rate)),
                formatPercent(statedSpread(plan.inflation, spread.inflation)),
              ],
              label: "Strays by, a year",
            },
            {
              detail: "One year in ten comes in under this.",
              figures: [
                yearAt(plan.rate, spread.rate, -tenth),
                yearAt(plan.inflation, spread.inflation, -tenth),
              ],
              label: "Low year, one in ten",
            },
            {
              detail: "One year in ten comes in over this.",
              figures: [
                yearAt(plan.rate, spread.rate, tenth),
                yearAt(plan.inflation, spread.inflation, tenth),
              ],
              label: "High year, one in ten",
            },
          ]}
        />
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Futures", `${formatCount(count)}, each the plan run again`],
            [
              "Drawn",
              "A year at a time, log-normal, prices apart from returns",
            ],
            ["Every run", "The same futures, so a change is the plan's"],
            [
              "A future lasts",
              "With no year short, and no pension drawn early",
            ],
          ].map(([name, value]) => (
            <div className="grid gap-1" key={name}>
              <dt className="label text-muted-foreground">{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </SectionCard>
  );
}
