"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { ChevronRight, Goal as GoalIcon, Plus } from "lucide-react";
import { Fragment, useState } from "react";

import type { Spread } from "@/components/app/atoms/spread-bar";
import type { Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Future } from "@/engine/futures";

import { removeMilestone } from "@/actions/milestones";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { RowOpener } from "@/components/app/atoms/row-opener";
import { SpanRuler } from "@/components/app/atoms/span-ruler";
import { SpreadBar } from "@/components/app/atoms/spread-bar";
import { YearAge } from "@/components/app/atoms/year-age";
import { SectionCard } from "@/components/app/molecules/section-card";
import { MilestoneDialog } from "@/components/app/organisms/milestone-dialog";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/kit/tooltip";
import { conditionOf, markersOf, yearsOf } from "@/data/milestones";
import { ageIn } from "@/data/plan";
import { reachedBy, reachedIn } from "@/engine/futures";
import { useRemover } from "@/hooks/use-remover";
import { formatWholePercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";
import { laneColumns } from "@/lib/span";

interface GoalListProps {
  readonly futures: readonly Future[];
  readonly goals: readonly Milestone[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
}

interface GoalRowProps {
  readonly futures: readonly Future[];
  readonly goal: Milestone;
  readonly marks: readonly number[];
  readonly onEdit: (goal: Milestone) => void;
  readonly plan: Plan;
}

// The goals and when the futures reach them, a lane apiece on the
// plan's span, as the plan screen lays its milestones and lines: the
// goal's name over its conditions in words, over where the futures
// reach it, the fan on its side, with the share of the run that
// reaches it at all and the median year beside, and the year and age
// at each share from the earliest 5% to the latest 5% on the bar,
// hovered or focused, all read over the futures drawn so far while
// the run comes in. The lanes are ruled at the milestones, so a median
// is read against retirement. A goal is added from the card's button
// and edited from its row, in the milestone dialog the plan screen
// opens too, opened on conditions here, since a goal is a milestone
// reached when they hold; the dialog of a saved goal offers a Delete
// that asks through the confirm dialog before the goal goes. A save
// goes to the store and comes back with the page re-read, which draws
// the run again. A phone folds each lane into lines, as the plan
// screen's fold, with the bar the row's width.
export function GoalList({
  futures,
  goals,
  milestones,
  plan,
}: GoalListProps): JSX.Element {
  const [opened, setOpened] = useState<"new" | Milestone | null>(null);
  const marks = yearsOf(markersOf(milestones, plan));
  const { ask, doomed, questionOf } = useRemover<Milestone>({
    describe: (goal) => goal.name,
    noun: "Milestone",
    remove: removeMilestone,
  });

  function close(): void {
    setOpened(null);
  }

  return (
    <>
      <SectionCard
        actions={
          <Button
            onClick={() => {
              setOpened("new");
            }}
            size="sm"
          >
            <Plus aria-hidden />
            Add goal
          </Button>
        }
        caption="Milestones the plan reaches rather than ones it is laid out by, each the first year a future meets its conditions: where on the plan's span the futures reach it, from the earliest 5% to the latest 5%, the middle four in five and the middle half banded as the fan bands them and the median the dot, which the Dashboard tiles; and the share of the run that reaches it at all."
        label={subsectionLabel(chance, 2)}
        title="When the goals are reached"
      >
        {goals.length === 0 ? (
          <CardContent>
            <EmptyState
              description="Add a goal, the first million or financial independence, to read the year the futures reach it by."
              icon={GoalIcon}
              title="No goals yet"
            />
          </CardContent>
        ) : (
          <CardContent className="@container grid gap-1">
            <div className={cn("grid gap-4 folded:grid-cols-1", laneColumns)}>
              <SpanRuler plan={plan} />
            </div>
            <ul className="@container divide-y">
              {goals.map((goal) => (
                <GoalRow
                  futures={futures}
                  goal={goal}
                  key={goal.id}
                  marks={marks}
                  onEdit={setOpened}
                  plan={plan}
                />
              ))}
            </ul>
          </CardContent>
        )}
      </SectionCard>
      {doomed !== null && (
        <ConfirmDialog {...questionOf(doomed)}>
          It cannot be brought back.
        </ConfirmDialog>
      )}
      {opened !== null && (
        <MilestoneDialog
          kind="conditions"
          milestone={opened === "new" ? null : opened}
          onDelete={(goal) => {
            close();
            ask(goal);
          }}
          onDismiss={close}
          onSaved={close}
          plan={plan}
        />
      )}
    </>
  );
}

// A goal's row, drawn in its columns and again in its folded lines,
// only one of which is shown at any width: its name, which opens it,
// over its conditions, over where the futures reach it on the plan's
// span; then the share of the run that reaches it at all, labelled,
// and the year by which half have, with the age beneath, a dash where
// half never do and an ellipsis before any future is drawn. The year
// and age at every share are read on the bar, hovered or focused, in a
// tooltip, since seven of them written beneath each bar crowded the
// card; the bar is the tooltip's trigger, a button named for the goal
// and tall enough to land on, over the press that opens the row.
// Folded, the share is the figure beside the name and the median a
// line of its own, since the columns that held them fold away.
function GoalRow({
  futures,
  goal,
  marks,
  onEdit,
  plan,
}: GoalRowProps): JSX.Element {
  const run = futures.length;
  const reached = futures.filter(
    (future) => reachedIn(future, goal, plan) !== null,
  ).length;
  const reaching = run === 0 ? "…" : formatWholePercent(reached / run);
  const yearBy = (share: number): null | number =>
    reachedBy(futures, goal, { plan, share });
  const spread: Spread = {
    ends: [yearBy(0.05), yearBy(0.95)],
    inner: [yearBy(0.25), yearBy(0.75)],
    median: yearBy(0.5),
    outer: [yearBy(0.1), yearBy(0.9)],
  };
  const conditions = goal.conditions.map(conditionOf).join(" · ");
  const year = spread.median ?? unreached(run);
  const age =
    spread.median === null
      ? ""
      : ` · age ${String(ageIn(spread.median, plan))}`;
  function open(): void {
    onEdit(goal);
  }
  const bar = (
    <Tooltip>
      <TooltipTrigger
        aria-label={`When the futures reach ${goal.name}`}
        className="relative block w-full rounded-full py-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
        delay={150}
      >
        <SpreadBar marks={marks} plan={plan} spread={spread} />
      </TooltipTrigger>
      <TooltipContent>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
          {reachesOf(spread, plan, run).map(([share, reach]) => (
            <Fragment key={share}>
              <dt>{share}</dt>
              <dd className="text-right figure">{reach}</dd>
            </Fragment>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
  return (
    <li
      className={cn(
        "relative grid items-center gap-4 py-3 first:pt-0 last:pb-0 folded:grid-cols-1",
        laneColumns,
      )}
    >
      <div className="unfolded:hidden">
        <FoldedLines figure={reaching} name={goal.name} onOpen={open}>
          <span>{conditions}</span>
          <span>{`Median ${String(year)}${age}`}</span>
          {bar}
        </FoldedLines>
      </div>
      <div className="grid min-w-0 gap-2 folded:hidden">
        <div className="grid gap-1">
          <RowOpener onOpen={open}>{goal.name}</RowOpener>
          <span className="text-xs text-muted-foreground">{conditions}</span>
        </div>
        {bar}
      </div>
      <span className="grid gap-0.5 text-right folded:hidden">
        <span className="figure">{reaching}</span>
        <span className="label text-muted-foreground">reach it</span>
      </span>
      <YearAge age={`Median${age}`} className="folded:hidden" year={year} />
      <span className="inline-flex size-7 items-center justify-center folded:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </span>
    </li>
  );
}

// The years a run reaches a goal by at each share, from the earliest
// 5% to the latest 5%, each named as the owner names it with the year
// and the age reached in it: "never" where that many never do, and an
// ellipsis before any future is drawn.
function reachesOf(
  { ends, inner, median, outer }: Spread,
  plan: Plan,
  run: number,
): readonly (readonly [string, string])[] {
  const listed: readonly (readonly [string, null | number])[] = [
    ["Earliest 5%", ends[0]],
    ["Earliest 10%", outer[0]],
    ["Earliest 25%", inner[0]],
    ["Median", median],
    ["Latest 25%", inner[1]],
    ["Latest 10%", outer[1]],
    ["Latest 5%", ends[1]],
  ];
  return listed.map(([share, year]) => {
    if (run === 0) {
      return [share, "…"];
    }
    return [
      share,
      year === null
        ? "never"
        : `${String(year)} · age ${String(ageIn(year, plan))}`,
    ];
  });
}

// What stands for a year the run never reaches a goal by: a dash, or an
// ellipsis while no future is drawn yet to say.
function unreached(run: number): string {
  return run === 0 ? "…" : "—";
}
