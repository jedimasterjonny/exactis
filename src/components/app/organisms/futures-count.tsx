import type { JSX } from "react";

import { useId } from "react";

import type { Plan } from "@/data/plan";
import type { Reading } from "@/engine/futures";

import { Ledger } from "@/components/app/atoms/ledger";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent, CardFooter } from "@/components/kit/card";
import { ageIn, endAge } from "@/data/plan";
import { formatCount } from "@/lib/count";
import { formatGbp, formatWholePercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";

interface FuturesCountProps {
  readonly count: number;
  readonly plan: Plan;
  readonly projected: number;
  readonly reading: Reading;
}

// The chance of success counted down as a ledger is: the futures run,
// less those that ran out of money and those kept going only by drawing
// a pension early, leaving those that lasted, whose share of the run is
// the chance. Each step says what it counts, the ran out when the first
// did and by when half of them had, and the early draws what the chance
// would be counted as lasting, so the judgement that they fail shows.
// Beside it, what the middle future is worth at the plan's end against
// what the plan is worth there at its own rates, as the dashboard
// projects it.
// Beneath, how far the run alone may have the chance wrong. While the
// run is coming in the ledger counts the futures drawn so far, and
// says so, and before the first are drawn it says that much.
export function FuturesCount({
  count,
  plan,
  projected,
  reading,
}: FuturesCountProps): JSX.Element {
  const isDone = reading.run >= count;
  return (
    <SectionCard
      caption="Of the futures run, the ones that cover every year to the plan's end, counted down from all of them."
      label={subsectionLabel(chance, 1)}
      title="How many futures last"
    >
      <CardContent>
        {reading.run === 0 ? (
          <p className="text-sm text-muted-foreground">
            Drawing the first futures…
          </p>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <Ledger
              steps={[
                {
                  detail: isDone
                    ? `Each the plan run again over its own ${String(plan.years)} years of returns and inflation`
                    : `${formatCount(reading.run)} of ${formatCount(count)} drawn so far`,
                  figure: formatCount(reading.run),
                  label: "Futures run",
                },
                {
                  detail:
                    reading.firstRanOut === null || reading.halfRanOut === null
                      ? "None ran out"
                      : `A year no account could cover. The first at ${String(ageIn(reading.firstRanOut, plan))}, half of them by ${String(ageIn(reading.halfRanOut, plan))}`,
                  figure: lessBy(reading.ranOut),
                  label: "Ran out of money",
                },
                {
                  detail:
                    reading.early === 0
                      ? "None needed to"
                      : `Short before a pension can be drawn, and carried by the 55% charge, which lasts on paper only. Counted as lasting, the chance would be ${formatWholePercent((reading.lasted + reading.early) / reading.run)}`,
                  figure: lessBy(reading.early),
                  label: "Kept going only by drawing a pension early",
                },
                {
                  detail:
                    "Every year covered from the savings, to the plan's end",
                  figure: formatCount(reading.lasted),
                  label: `Lasted to ${String(endAge(plan))}`,
                },
              ]}
              total={formatWholePercent(reading.chance)}
              totalName="Chance of success"
            />
            <AgainstProjection
              age={endAge(plan)}
              middle={reading.middle}
              projected={projected}
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {isDone
          ? `± ${(reading.margin * 100).toFixed(1)} points is the run's own: ${formatCount(count)} futures pin the chance that closely 19 times in 20. Every run draws the same futures, so a chance that moves has moved with the plan.`
          : "The chance firms as the rest of the futures come in."}
      </CardFooter>
    </SectionCard>
  );
}

// What the middle future is worth at the plan's end beside what the
// plan is worth there at its own rates, which the middle future grows
// at, so the two sit close and what the one projection cannot show is
// the spread either side.
function AgainstProjection({
  age,
  middle,
  projected,
}: {
  readonly age: number;
  readonly middle: number;
  readonly projected: number;
}): JSX.Element {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 self-start rounded-lg bg-muted p-5"
    >
      <h3 className="label text-muted-foreground" id={id}>
        Net worth against the plan as projected
      </h3>
      <dl className="grid gap-3">
        <div className="flex justify-between gap-4">
          <dt>{`Projected, at ${String(age)}`}</dt>
          <dd className="figure">{formatGbp(projected)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{`Middle future, at ${String(age)}`}</dt>
          <dd className="figure">{formatGbp(middle)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        The plan rate is BlackRock&apos;s annualised return, the rate the middle
        future grows at, so the dashboard&apos;s one projection sits near it.
        What one projection cannot show is the spread either side.
      </p>
    </section>
  );
}

// A count taken off the run, with a real minus, or nought for none.
function lessBy(count: number): string {
  return count === 0 ? "0" : `−${formatCount(count)}`;
}
