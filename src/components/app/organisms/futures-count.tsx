import type { JSX } from "react";

import { useId } from "react";

import type { Plan } from "@/data/plan";
import type { Reading } from "@/engine/futures";

import { Ledger } from "@/components/app/atoms/ledger";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { retiresOn } from "@/data/milestones";
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
// less those that ran out of money, those kept going only by drawing a
// pension early and, for an owner retiring on conditions, those in which
// they never retired, leaving those that lasted, whose share of the run
// is the chance. The ran out say when the first did and by when half of
// them had, and the early draws what the chance would be counted as
// lasting, so the judgement that they fail shows. Beside it, what the
// middle future is worth at the plan's end against what the plan is
// worth there at its own rates, as the dashboard projects it. While the
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
      label={subsectionLabel(chance, 3)}
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
                    ? undefined
                    : `${formatCount(reading.run)} of ${formatCount(count)} drawn so far`,
                  figure: formatCount(reading.run),
                  label: "Futures run",
                },
                {
                  detail:
                    reading.firstRanOut === null || reading.halfRanOut === null
                      ? undefined
                      : `The first at ${String(ageIn(reading.firstRanOut, plan))}, half by ${String(ageIn(reading.halfRanOut, plan))}`,
                  figure: lessBy(reading.ranOut),
                  label: "Ran out of money",
                },
                {
                  detail:
                    reading.early === 0
                      ? undefined
                      : `${formatWholePercent((reading.lasted + reading.early) / reading.run)} if counted as lasting`,
                  figure: lessBy(reading.early),
                  label: "Kept going only by drawing a pension early",
                },
                ...(retiresOn(plan) === undefined
                  ? []
                  : [
                      {
                        figure: lessBy(reading.unretired),
                        label: "Never retired",
                      },
                    ]),
                {
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
        {`Net worth at ${String(age)}`}
      </h3>
      <dl className="grid gap-3">
        <div className="flex justify-between gap-4">
          <dt>Projected</dt>
          <dd className="figure">{formatGbp(projected)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Middle future</dt>
          <dd className="figure">{formatGbp(middle)}</dd>
        </div>
      </dl>
    </section>
  );
}

// A count taken off the run, with a real minus, or nought for none.
function lessBy(count: number): string {
  return count === 0 ? "0" : `−${formatCount(count)}`;
}
