import type { JSX } from "react";

import { useId } from "react";

import type { Plan } from "@/data/plan";
import type { Reading } from "@/engine/futures";

import { Ledger } from "@/components/app/atoms/ledger";
import { Panel } from "@/components/app/atoms/panel";
import { SectionCard } from "@/components/app/organisms/section-card";
import { CardContent } from "@/components/kit/card";
import { retiresBy, retiresOn } from "@/data/milestones";
import { ageIn, endAge } from "@/data/plan";
import { formatCount } from "@/lib/count";
import { formatChance, formatGbp } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";

interface FuturesCountProps {
  readonly count: number;
  readonly plan: Plan;
  readonly projected: number;
  readonly reading: Reading;
}

// The chance of success counted down as a ledger is: the futures run,
// less those that ran out of money, those kept going only by drawing a
// pension early and, for an owner retiring on conditions alone, those
// in which they never retired, since an age they retire by retires them
// in every future, leaving those that lasted, whose share of the run
// is the chance. The ran out say when the first did and by when half of
// them had, and the early draws what the chance would be counted as
// lasting, so the judgement that they fail shows. Beside it, what the
// middle future is worth at the plan's end against what the plan is
// worth there at its own rates, as the dashboard projects it. The card
// is drawn in its landed shape from the first paint: every row the plan
// has, each figure an ellipsis until the first futures are in, and a
// line beneath each of the first three rows throughout, so none comes
// or goes as the run lands. While the run is coming in the first counts
// the futures drawn so far, and once it is whole says all were; the ran
// out and the early draws say none has yet until one has, and once the
// run is whole with none, that none did.
export function FuturesCount({
  count,
  plan,
  projected,
  reading,
}: FuturesCountProps): JSX.Element {
  const isDone = reading.run >= count;
  const isEmpty = reading.run === 0;
  const held = (figure: string): string => (isEmpty ? "…" : figure);
  return (
    <SectionCard
      label={subsectionLabel(chance, 4)}
      title="How many futures last"
    >
      <CardContent>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <Ledger
            steps={[
              {
                detail: isDone
                  ? `All ${formatCount(count)} drawn`
                  : `${formatCount(reading.run)} of ${formatCount(count)} drawn so far`,
                figure: held(formatCount(reading.run)),
                label: "Futures run",
              },
              {
                detail:
                  reading.firstRanOut === null || reading.halfRanOut === null
                    ? noneYet(isDone, `None by ${String(endAge(plan))}`)
                    : `The first at ${String(ageIn(reading.firstRanOut, plan))}, half by ${String(ageIn(reading.halfRanOut, plan))}`,
                figure: held(lessBy(reading.ranOut)),
                label: "Ran out of money",
              },
              {
                detail:
                  reading.early === 0
                    ? noneYet(isDone, "None needed to")
                    : `${formatChance((reading.lasted + reading.early) / reading.run)} if counted as lasting`,
                figure: held(lessBy(reading.early)),
                label: "Kept going only by drawing a pension early",
              },
              ...(retiresOn(plan) === undefined || retiresBy(plan) !== undefined
                ? []
                : [
                    {
                      figure: held(lessBy(reading.unretired)),
                      label: "Never retired",
                    },
                  ]),
              {
                figure: held(formatCount(reading.lasted)),
                label: `Lasted to ${String(endAge(plan))}`,
              },
            ]}
            total={held(formatChance(reading.chance))}
            totalName="Chance of success"
          />
          <AgainstProjection
            age={endAge(plan)}
            middle={held(formatGbp(reading.middle))}
            projected={projected}
          />
        </div>
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
  readonly middle: string;
  readonly projected: number;
}): JSX.Element {
  const id = useId();
  return (
    <Panel aria-labelledby={id} className="self-start">
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
          <dd className="figure">{middle}</dd>
        </div>
      </dl>
    </Panel>
  );
}

// A count taken off the run, with a real minus, or nought for none.
function lessBy(count: number): string {
  return count === 0 ? "0" : `−${formatCount(count)}`;
}

// What a row counting none says beneath it: that none has so far while
// the run is coming in, and once it is whole, the words given.
function noneYet(isDone: boolean, once: string): string {
  return isDone ? once : "None so far";
}
