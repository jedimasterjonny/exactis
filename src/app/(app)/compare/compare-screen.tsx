"use client";

import type { JSX } from "react";

import { Equal } from "lucide-react";

import type { WorksheetRow } from "@/components/app/atoms/worksheet";
import type { Run } from "@/components/app/organisms/chance-tile";
import type { Household } from "@/data/household";
import type { Month } from "@/data/schedule";
import type { Line, Side } from "@/lib/moved";
import type { Slot } from "@/lib/slot";

import { Note } from "@/components/app/atoms/note";
import { Worksheet } from "@/components/app/atoms/worksheet";
import { Caution } from "@/components/app/molecules/caution";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { FuturesRun } from "@/components/app/organisms/futures-run";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Screen } from "@/components/app/templates/screen";
import { CardContent } from "@/components/kit/card";
import { readingOf, runLength } from "@/engine/futures";
import { formatCount } from "@/lib/count";
import { listed } from "@/lib/feeders";
import { formatChance, formatGbp } from "@/lib/money";
import { formatMonth } from "@/lib/months";
import { dashboard, sectionLabel, subsectionLabel } from "@/lib/nav";

interface CompareScreenProps {
  readonly actions: Slot;
  readonly asOf: Month;
  readonly household: Drawn;
  readonly lines: null | readonly Line[];
  readonly meta: string | undefined;
  readonly refusal: null | string;
  readonly scenario: Drawn | null;
  readonly title: string;
}

// What a side's futures are drawn over, and what it comes to at its own
// rates.
interface Drawn extends Pick<
  Household,
  "accounts" | "plan" | "schedule" | "spread"
> {
  readonly side: Side;
}

// What each change is called beside its line.
const changeNames: Record<Line["change"], string> = {
  added: "Added",
  changed: "Changed",
  removed: "Removed",
};

// What the lines card is headed with.
const changes = "What making it the household changes";

// A scenario beside the household, as making it the household would
// leave it: the header the page worked out, its title the verdict on
// retirement, its meta line the decision kept on it, where there is
// one, and its actions the way to decide; where the merge is refused, a caution saying so in the refusal's
// words in place of the figures, since a sentence that long is no
// figure; and then two cards. The first sets the household and the
// scenario side by side in two columns, so a long name heads none:
// when each retires, the chance of success over the same thousand
// futures, and the net worth each holds entering its last year, the
// difference said in words on each row's line beneath, with no tone,
// since a plan trading money for time is not a loss; the futures are
// drawn here, the household's first, which the dashboard has usually
// drawn already, and the chance reads an ellipsis while either is
// drawn, with the count of both together, and a dash with the reason
// where a side has nothing to draw. Notes beneath say what the scenario
// is laid over, why the dashboard can read it otherwise, and what the
// figures are in. The second lists what making it the household would
// change, a line for each record or setting, or says nothing would.
export function CompareScreen({
  actions,
  asOf,
  household,
  lines,
  meta,
  refusal,
  scenario,
  title,
}: CompareScreenProps): JSX.Element {
  return (
    <Screen
      actions={actions}
      label={sectionLabel(dashboard)}
      meta={meta}
      title={title}
    >
      {refusal !== null && (
        <Caution title="It cannot be made the household as things stand">
          {lines === null
            ? `${refusal}.`
            : `${refusal}. What it changes is still listed below.`}
        </Caution>
      )}
      {scenario !== null && (
        <FuturesRun {...household}>
          {(theirs) => (
            <FuturesRun {...scenario}>
              {(ours) => (
                <SectionCard
                  caption={`Laid over the household's balances as of ${formatMonth(asOf)}`}
                  label={subsectionLabel(dashboard, 1)}
                  title="Beside the household"
                >
                  <CardContent className="grid gap-4">
                    <Worksheet
                      columns={["Household", "Scenario"]}
                      label="The scenario beside the household"
                      rows={[
                        retiresRow(household.side, scenario.side),
                        chanceRow(theirs, ours),
                        worthRow(household.side, scenario.side),
                      ]}
                    />
                    <Note>
                      The scenario is laid over the household&apos;s balances,
                      progress points and pulled figures as they stand, as
                      making it the household today would. The dashboard sets
                      the scenario&apos;s own balances, as they stood when it
                      was made, against the household, so its differences can
                      read otherwise.
                    </Note>
                    <Note>
                      {`Retirement and net worth are at each plan's own rates, in today's money. The chance of success runs both plans over the same ${formatCount(runLength)} futures.`}
                    </Note>
                  </CardContent>
                </SectionCard>
              )}
            </FuturesRun>
          )}
        </FuturesRun>
      )}
      {lines !== null && (
        <SectionCard
          {...(lines.length > 0 && { caption: countsOf(lines) })}
          label={subsectionLabel(dashboard, 2)}
          title={changes}
        >
          <CardContent>
            {lines.length === 0 ? (
              <EmptyState
                description="Nothing in the scenario's plan differs from the household's, so its figures are the household's too."
                icon={Equal}
                title="The same plan as the household's"
              />
            ) : (
              <ul aria-label={`${changes}, line by line`} className="divide-y">
                {lines.map(({ change, key, label }) => (
                  <li
                    className="flex items-baseline justify-between gap-3 py-2"
                    key={key}
                  >
                    <span>{label}</span>
                    <span className="label text-muted-foreground">
                      {changeNames[change]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </SectionCard>
      )}
    </Screen>
  );
}

// The chance of success on each side once its futures are drawn, an
// ellipsis while they are, and a dash where there are none to draw; the
// line beneath gives how many more or fewer of the same futures last,
// the count drawn so far of both runs together, or why a side has
// nothing to draw.
function chanceRow(theirs: Run, ours: Run): WorksheetRow {
  const label = "Chance of success";
  const figures = [theirs, ours].map((run) => {
    if ("unrun" in run) {
      return "—";
    }
    return run.isDone ? formatChance(readingOf(run.futures).chance) : "…";
  });
  if ("unrun" in theirs || "unrun" in ours) {
    return {
      detail: [
        { run: theirs, side: "household" },
        { run: ours, side: "scenario" },
      ]
        .flatMap(({ run, side }) =>
          "unrun" in run ? [`The ${side} has ${lowered(run.unrun)}`] : [],
        )
        .join(" · "),
      figures,
      label,
    };
  }
  if (!theirs.isDone || !ours.isDone) {
    const count = theirs.futures.length + ours.futures.length;
    return {
      detail: `Drawing ${formatCount(count)} of ${formatCount(runLength * 2)} futures…`,
      figures,
      label,
    };
  }
  const more =
    readingOf(ours.futures).lasted - readingOf(theirs.futures).lasted;
  const same = `of the same ${formatCount(runLength)} futures last`;
  const side = more > 0 ? "more" : "fewer";
  return {
    detail:
      more === 0
        ? `As many ${same}`
        : `${formatCount(Math.abs(more))} ${side} ${same}`,
    figures,
    label,
  };
}

// How many lines each change holds, as the lines card's caption counts
// them: "3 changed, 1 added and 1 removed".
function countsOf(lines: readonly Line[]): string {
  return listed.format(
    (["changed", "added", "removed"] as const).flatMap((change) => {
      const count = lines.filter((line) => line.change === change).length;
      return count === 0 ? [] : [`${String(count)} ${change}`];
    }),
  );
}

// A sentence's opening read on from another's, its first letter lowered.
function lowered(sentence: string): string {
  return `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}

// When each side retires, at its own rates, or never; the line beneath
// says how far the scenario moves it.
function retiresRow(theirs: Side, ours: Side): WorksheetRow {
  return {
    detail: yearsMoved(theirs.retires, ours.retires),
    figures: [theirs, ours].map(({ retires }) =>
      retires === null ? "Never" : String(retires),
    ),
    label: "Retires at",
  };
}

// The net worth each side holds entering its last year, at its own
// rates; the line beneath says how far apart they are, with each plan's
// end age where the two run to different ages.
function worthRow(theirs: Side, ours: Side): WorksheetRow {
  const apart = ours.worth - theirs.worth;
  const side = apart > 0 ? "more" : "less";
  const by = apart === 0 ? "The same" : `${formatGbp(Math.abs(apart))} ${side}`;
  const isSameEnd = theirs.ends === ours.ends;
  return {
    detail: isSameEnd
      ? by
      : `${by}, at ${String(ours.ends)} against ${String(theirs.ends)}`,
    figures: [formatGbp(theirs.worth), formatGbp(ours.worth)],
    label: isSameEnd
      ? `Net worth at ${String(ours.ends)}`
      : "Net worth at each plan's end",
  };
}

// How far the scenario moves the retirement, in words rather than a
// signed figure: a year or more sooner or later, the same, into never
// or out of it to an age.
function yearsMoved(theirs: null | number, ours: null | number): string {
  if (theirs === ours) {
    return "The same";
  }
  if (ours === null) {
    return "Now never";
  }
  if (theirs === null) {
    return `Now at ${String(ours)}`;
  }
  const years = ours - theirs;
  const count = Math.abs(years);
  const span = count === 1 ? "A year" : `${String(count)} years`;
  return `${span} ${years < 0 ? "sooner" : "later"}`;
}
