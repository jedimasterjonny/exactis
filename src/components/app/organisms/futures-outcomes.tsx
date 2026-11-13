import type { JSX } from "react";

import { cn } from "cn";

import type { LegendEntry } from "@/components/app/atoms/legend-table";
import type { Plan } from "@/data/plan";
import type { Grading, Outcome, Reading } from "@/engine/futures";

import { LegendTable } from "@/components/app/atoms/legend-table";
import { SegmentBar } from "@/components/app/atoms/segment-bar";
import { Card, CardContent } from "@/components/kit/card";
import { ageIn, endAge } from "@/data/plan";
import { formatCount } from "@/lib/count";
import { formatChance, formatGbp, formatWholePercent } from "@/lib/money";
import {
  lastingOutcomes,
  outcomeFills,
  outcomeNames,
  shortOutcomes,
} from "@/lib/outcomes";

interface FuturesOutcomesProps {
  readonly count: number;
  readonly grading: Grading;
  readonly headlineId?: string;
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
// or the ages bounding it, which is where the bar's fills are named. Most is said only of more than half, many otherwise, and where
// two outcomes hold as many the better is said. Drawn whole from the
// first paint, so nothing beneath or beside it moves as the run comes
// in or is drawn again, the figure's column held at the width of 100%:
// the figure, the bar, the counts and the shares read the futures drawn
// so far, the bar's rest shrinking as they come, with an ellipsis for a
// figure or a share of none, while the two sentences wait in their
// places, muted, saying what they will say once the whole run is in.
// Said over part of the run, they wrapped to another line as its counts
// grew and its words turned, and said of a few futures what only the
// run can. The sentence saying how many last takes the id it is handed,
// so a chart can be described by it.
export function FuturesOutcomes({
  count,
  grading,
  headlineId,
  outcomes,
  plan,
  reading,
}: FuturesOutcomesProps): JSX.Element {
  const isDrawing = reading.run < count;
  const isEmpty = reading.run === 0;
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
    figure: isEmpty ? "…" : formatWholePercent(outcomes[outcome] / reading.run),
    fill: outcomeFills[outcome],
    key: outcome,
    name: outcomeNames[outcome],
    note: bounds[outcome],
  });
  const lasted = mostOf(lastingOutcomes, outcomes);
  const fell = mostOf(shortOutcomes, outcomes);
  const howMany = (part: number, whole: number): string =>
    part * 2 > whole ? "Most" : "Many";
  const lastedHow =
    reading.lasted === 0
      ? ""
      : `, ${howMany(outcomes[lasted], reading.lasted).toLowerCase()} of them ${lastedAs[lasted]}`;
  const verdict = isDrawing
    ? `Drawing the futures to count how many of ${formatCount(count)} last to ${String(endAge(plan))}…`
    : `${formatCount(reading.lasted)} of ${formatCount(reading.run)} futures last to ${String(endAge(plan))}${lastedHow}.`;
  const shortfall =
    short === 0
      ? "None fall short."
      : `${howMany(outcomes[fell], short)} that fall short do so ${fellWhen[fell]}.`;
  return (
    <Card aria-label="What the futures come to" role="region">
      <CardContent className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-10 xl:grid-cols-[auto_minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-3">
          <p className="min-w-[2.5em] display-figure text-6xl font-medium tracking-tighter">
            {isEmpty ? "…" : formatChance(reading.chance)}
          </p>
          <p className="text-xs text-muted-foreground">
            {isEmpty
              ? "± … points"
              : `± ${(reading.margin * 100).toFixed(1)} points`}
          </p>
        </div>
        <div className="grid content-start gap-3">
          <SegmentBar
            groups={[lastingOutcomes, shortOutcomes].map((group) =>
              group.map((outcome) => ({
                fill: outcomeFills[outcome],
                key: outcome,
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
          <h2
            className={cn(
              "mt-3 heading text-2xl text-balance",
              isDrawing && "text-muted-foreground",
            )}
            id={headlineId}
          >
            {verdict}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {isDrawing
              ? "Then when most that fall short do so, and what the middle one leaves."
              : `${shortfall} The middle one leaves ${formatGbp(reading.middle)}.`}
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
