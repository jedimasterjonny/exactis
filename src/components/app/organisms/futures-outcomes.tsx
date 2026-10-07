import type { JSX } from "react";

import type { LegendEntry } from "@/components/app/atoms/legend-table";
import type { Plan } from "@/data/plan";
import type { Grading, Outcome, Reading } from "@/engine/futures";

import { LegendTable } from "@/components/app/atoms/legend-table";
import { SegmentBar } from "@/components/app/atoms/segment-bar";
import { Card, CardContent } from "@/components/kit/card";
import { ageIn, endAge } from "@/data/plan";
import { formatCount } from "@/lib/count";
import { formatGbp, formatWholePercent } from "@/lib/money";
import {
  lastingOutcomes,
  outcomeNames,
  outcomeTones,
  shortOutcomes,
} from "@/lib/outcomes";

interface FuturesOutcomesProps {
  readonly count: number;
  readonly grading: Grading;
  readonly outcomes: Readonly<Record<Outcome, number>>;
  readonly plan: Plan;
  readonly reading: Reading;
}

// How the futures that came to each lasting outcome lasted, as a
// sentence says it.
const lastedAs: Readonly<Record<(typeof lastingOutcomes)[number], string>> = {
  barely: "only barely",
  comfortable: "comfortably",
  surplus: "with a large surplus",
};

// What the futures come to, at a glance, where the screen opens: the
// chance as a figure, with how far the run alone may have it wrong;
// beside it the run graded along a bar, with how many lasted and fell
// short, over a sentence saying how many last and how most of those do
// and another saying when most of the rest fall short and what the
// middle future leaves, the bar taking the sentences' width rather than
// the figure's; and each outcome's share of the run beside the pounds
// or the ages bounding it, which is where the bar's tones are named. Most is said only of more than half, many otherwise, and where
// two outcomes hold as many the better is said. Read over the futures
// drawn so far while the run comes in, the bar's rest shrinking as it
// does, and saying only that it is drawing before the first are in.
export function FuturesOutcomes({
  count,
  grading,
  outcomes,
  plan,
  reading,
}: FuturesOutcomesProps): JSX.Element {
  const short = reading.run - reading.lasted;
  const middle = ageIn(grading.middle, plan);
  const almost = ageIn(grading.almost, plan);
  const bounds: Readonly<Record<Outcome, string>> = {
    almost: `from ${String(almost)}`,
    barely: `under ${formatGbp(grading.comfortable)}`,
    comfortable: `${formatGbp(grading.comfortable)} to ${formatGbp(grading.surplus)}`,
    early: `before ${String(middle)}`,
    middle: agesOf(middle, almost - 1),
    surplus: `over ${formatGbp(grading.surplus)}`,
  };
  const fellWhen: Readonly<Record<(typeof shortOutcomes)[number], string>> = {
    almost: `at ${String(almost)} or later`,
    early: `before ${String(middle)}`,
    middle:
      middle === almost - 1
        ? `at ${String(middle)}`
        : `between ${String(middle)} and ${String(almost - 1)}`,
  };
  const shareOf = (outcome: Outcome): LegendEntry => ({
    figure: formatWholePercent(outcomes[outcome] / reading.run),
    key: outcome,
    name: outcomeNames[outcome],
    note: bounds[outcome],
    tone: outcomeTones[outcome],
  });
  const lasted = mostOf(lastingOutcomes, outcomes);
  const fell = mostOf(shortOutcomes, outcomes);
  const howMany = (part: number, whole: number): string =>
    part * 2 > whole ? "Most" : "Many";
  const lastedHow =
    reading.lasted === 0
      ? ""
      : `, ${howMany(outcomes[lasted], reading.lasted).toLowerCase()} of them ${lastedAs[lasted]}`;
  const verdict = `${formatCount(reading.lasted)} of ${formatCount(reading.run)} futures last to ${String(endAge(plan))}${lastedHow}.`;
  const shortfall =
    short === 0
      ? "None fall short."
      : `${howMany(outcomes[fell], short)} that fall short do so ${fellWhen[fell]}.`;
  return (
    <Card aria-label="What the futures come to" role="region">
      <CardContent className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-10 xl:grid-cols-[auto_minmax(0,1fr)_20rem]">
        {reading.run === 0 ? (
          <p className="text-sm text-muted-foreground">
            Drawing the first futures…
          </p>
        ) : (
          <>
            <div className="grid content-start gap-3">
              <p className="figure text-6xl font-medium tracking-tighter">
                {formatWholePercent(reading.chance)}
              </p>
              <p className="text-xs text-muted-foreground">
                {`± ${(reading.margin * 100).toFixed(1)} points`}
              </p>
            </div>
            <div className="grid content-start gap-3">
              <SegmentBar
                groups={[lastingOutcomes, shortOutcomes].map((group) =>
                  group.map((outcome) => ({
                    key: outcome,
                    tone: outcomeTones[outcome],
                    value: outcomes[outcome],
                  })),
                )}
                total={count}
              />
              <p className="flex justify-between gap-4 text-xs text-muted-foreground">
                <span>
                  <span className="figure text-foreground">
                    {formatCount(reading.lasted)}
                  </span>{" "}
                  lasted
                </span>
                <span>
                  <span className="figure text-foreground">
                    {formatCount(short)}
                  </span>{" "}
                  fell short
                </span>
              </p>
              <h2 className="mt-3 font-heading text-2xl font-semibold tracking-tight text-balance">
                {verdict}
              </h2>
              <p className="text-sm text-pretty text-muted-foreground">
                {`${shortfall} The middle one leaves ${formatGbp(reading.middle)}.`}
              </p>
            </div>
            <div className="grid content-start gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
              <LegendTable
                caption={`Lasted · ${formatCount(reading.lasted)}`}
                entries={lastingOutcomes.map(shareOf)}
              />
              <LegendTable
                caption={`Fell short · ${formatCount(short)}`}
                entries={shortOutcomes.map(shareOf)}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// The ages from the first to the last, as a share bounds its outcome:
// one age alone where they meet, and a dash where the span holds none,
// as the middle of a retirement a year long does.
function agesOf(first: number, last: number): string {
  if (last < first) {
    return "—";
  }
  return last === first
    ? `at ${String(first)}`
    : `${String(first)} to ${String(last)}`;
}

// The outcome of a group that the most futures came to, the first
// listed where two came to as many.
function mostOf<TOutcome extends Outcome>(
  group: readonly [TOutcome, ...TOutcome[]],
  outcomes: Readonly<Record<Outcome, number>>,
): TOutcome {
  return group.reduce((most, each) =>
    outcomes[each] > outcomes[most] ? each : most,
  );
}
