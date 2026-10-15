"use client";

import type { JSX, ReactNode } from "react";

import { cn } from "cn";
import { ChevronRight, Flag, Plus } from "lucide-react";
import { useState } from "react";

import type { Spread } from "@/components/app/atoms/spread-bar";
import type { Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { PinBar } from "@/components/app/atoms/pin-bar";
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
import { ageOf, conditionOf, markersOf, yearsOf } from "@/data/milestones";
import { ageIn, yearAt } from "@/data/plan";
import { reachedBy, reachedIn } from "@/engine/futures";
import { formatWholePercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";
import { laneColumns, placed } from "@/lib/span";

interface MilestoneSpreadsProps {
  readonly futures: readonly Future[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

// A year named on a milestone's bar: one a share of the run reaches the
// milestone by, null where that many never do.
interface Named {
  readonly name: string;
  readonly year: null | number;
}

interface PinnedRowProps {
  readonly marks: readonly number[];
  readonly milestone: Milestone;
  readonly onEdit: (milestone: Milestone) => void;
  readonly plan: Plan;
  readonly year: number;
}

// A point on a milestone's bar: a year the run reaches it by, and the
// shares that reach it by then, keyed by them rather than the year,
// which moves while the run comes in.
interface Point {
  readonly key: string;
  readonly names: readonly string[];
  readonly year: number;
}

interface PointedBarProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly name: string;
  readonly onOpen: () => void;
  readonly plan: Plan;
  readonly points: readonly Point[];
}

interface SpreadRowProps {
  readonly futures: readonly Future[];
  readonly marks: readonly number[];
  readonly milestone: Milestone;
  readonly onEdit: (milestone: Milestone) => void;
  readonly plan: Plan;
}

// The lane every row is laid in: the schedules' columns, folded into
// one on a phone.
const lane =
  "relative grid items-center gap-4 py-3 first:pt-0 last:pb-0 folded:grid-cols-1";

// Every milestone and when it is reached, a lane apiece on the plan's
// span, as the plan screen lays its milestones and lines: those reached
// at an age first, in the order their years come, each its name over a
// pin where it falls, with the year and the age beside, as the plan
// screen pins it, since the plan says when it falls and the futures
// have nothing to add; then those reached when conditions hold, each
// its name over its conditions in words, over where the futures reach
// it, the fan on its side, with the share of the run that reaches it at
// all and the median year beside, and the year and age at each share
// from the earliest 5% to the latest 5% on the bar, hovered or focused,
// all read over the futures drawn so far while the run comes in. The
// lanes are ruled at the milestones reached at an age, so a median is
// read against retirement. A milestone is added from the card's button
// and edited from its row, in the dialog the plan screen opens too,
// opened on conditions here, since that is what this card reads, and
// handed the schedules as there, since a milestone reached at an age
// can be edited and deleted from here too. A save goes to the store
// and comes back with the page re-read, which draws the run again. A
// phone folds each lane into lines, as the plan screen's fold, with the
// bar the row's width.
export function MilestoneSpreads({
  futures,
  milestones,
  plan,
  schedule,
}: MilestoneSpreadsProps): JSX.Element {
  const [opened, setOpened] = useState<"new" | Milestone | null>(null);
  const marks = yearsOf(markersOf(milestones, plan));
  const pinned = milestones
    .flatMap((milestone) => {
      const age = ageOf(milestone);
      return age === undefined ? [] : [{ milestone, year: yearAt(age, plan) }];
    })
    .sort((first, second) => first.year - second.year);
  const reached = milestones.filter(
    (milestone) => ageOf(milestone) === undefined,
  );
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
            Add milestone
          </Button>
        }
        label={subsectionLabel(chance, 2)}
        title="When the milestones are reached"
      >
        {milestones.length === 0 ? (
          <CardContent>
            <EmptyState
              description="Add one to see when the futures reach it."
              icon={Flag}
              title="No milestones yet"
            />
          </CardContent>
        ) : (
          <CardContent className="@container grid gap-1">
            <div className={cn("grid gap-4 folded:grid-cols-1", laneColumns)}>
              <SpanRuler plan={plan} />
            </div>
            <ul className="@container divide-y">
              {pinned.map(({ milestone, year }) => (
                <PinnedRow
                  key={milestone.id}
                  marks={marks}
                  milestone={milestone}
                  onEdit={setOpened}
                  plan={plan}
                  year={year}
                />
              ))}
              {reached.map((milestone) => (
                <SpreadRow
                  futures={futures}
                  key={milestone.id}
                  marks={marks}
                  milestone={milestone}
                  onEdit={setOpened}
                  plan={plan}
                />
              ))}
            </ul>
          </CardContent>
        )}
      </SectionCard>
      {opened !== null && (
        <MilestoneDialog
          key={opened === "new" ? opened : opened.id}
          kind="conditions"
          milestone={opened === "new" ? null : opened}
          onClose={() => {
            setOpened(null);
          }}
          plan={plan}
          schedule={schedule}
        />
      )}
    </>
  );
}

// The row of a milestone reached at an age, drawn in its columns and
// again in its folded lines, only one of which is shown at any width:
// its name, which opens it, over a pin where it falls on the plan's
// span, with the year over the age reached in it beside, as the plan
// screen pins it; the share's column is empty, since every future
// reaches it in that year, and the pin says nothing on hover, since the
// year beside it is all there is to say.
function PinnedRow({
  marks,
  milestone,
  onEdit,
  plan,
  year,
}: PinnedRowProps): JSX.Element {
  const age = `Age ${String(ageIn(year, plan))}`;
  function open(): void {
    onEdit(milestone);
  }
  const bar = <PinBar marks={marks} plan={plan} year={year} />;
  return (
    <li className={cn(lane, laneColumns)}>
      <div className="unfolded:hidden">
        <FoldedLines figure={String(year)} name={milestone.name} onOpen={open}>
          <div className="pointer-events-none my-1">{bar}</div>
          <span>{age}</span>
        </FoldedLines>
      </div>
      <div className="grid min-w-0 gap-2 folded:hidden">
        <RowOpener onOpen={open}>{milestone.name}</RowOpener>
        <div className="pointer-events-none">{bar}</div>
      </div>
      <YearAge age={age} className="col-start-3 folded:hidden" year={year} />
      <span className="inline-flex size-7 items-center justify-center folded:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </span>
    </li>
  );
}

// A bar with its points over it, each a button where its year falls,
// named for the row's milestone and what is named there, which opens a
// tooltip above it on hover or focus with those names over the year and
// the age, and opens the row when pressed, as the rest of the bar lets
// a press through to do. A point is no wider than the gap to the
// nearest, so where years fall close on a narrow bar no point's target
// covers another's.
function PointedBar({
  children,
  className,
  name,
  onOpen,
  plan,
  points,
}: PointedBarProps): JSX.Element {
  return (
    <div className={cn("pointer-events-none relative", className)}>
      {children}
      {points.map(({ key, names, year }, index) => {
        const named = names.join(" · ");
        const reach = `${String(year)} · age ${String(ageIn(year, plan))}`;
        const at = placed(year, plan);
        const gap = Math.min(
          ...[points[index - 1], points[index + 1]].map((other) =>
            other === undefined ? 100 : Math.abs(placed(other.year, plan) - at),
          ),
        );
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              aria-label={`${name}, ${named}: ${reach}`}
              className="pointer-events-auto absolute top-1/2 size-4 -translate-1/2 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
              delay={150}
              onClick={onOpen}
              style={{ left: `${String(at)}%`, maxWidth: `${String(gap)}%` }}
            />
            <TooltipContent>
              <span className="grid gap-0.5">
                <span>{named}</span>
                <span className="figure">{reach}</span>
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// The points on a bar, from the years named on it, which come in
// order: those reached in the same year are one point, since they fall
// on the bar together, and a year that is null, where that many never
// reach the milestone, has none, since the bar draws it nowhere.
function pointsOf(named: readonly Named[]): readonly Point[] {
  const drawn = named.flatMap(({ name, year }) =>
    year === null ? [] : [{ name, year }],
  );
  return [...Map.groupBy(drawn, ({ year }) => year)].map(([year, entries]) => {
    const names = entries.map(({ name }) => name);
    return { key: names.join(), names, year };
  });
}

// The years a run reaches a milestone by at the shares the bar draws,
// from the earliest 5% to the latest 5%, each named as the owner names
// it, null where that many never reach it.
function sharesOf({ ends, inner, median, outer }: Spread): readonly Named[] {
  const listed: readonly (readonly [string, null | number])[] = [
    ["Earliest 5%", ends[0]],
    ["Earliest 10%", outer[0]],
    ["Earliest 25%", inner[0]],
    ["Median", median],
    ["Latest 25%", inner[1]],
    ["Latest 10%", outer[1]],
    ["Latest 5%", ends[1]],
  ];
  return listed.map(([name, year]) => ({ name, year }));
}

// The row of a milestone reached when conditions hold, drawn in its
// columns and again in its folded lines, only one of which is shown at
// any width: its name, which opens it, over its conditions, over where
// the futures reach it on the plan's span; then the share of the run
// that reaches it at all, labelled, and the year by which half have,
// with the age beneath, a dash where half never do and an ellipsis
// before any future is drawn. The year and age at each share are read
// on the bar, its point hovered or focused, since seven of them written
// beneath each bar crowded the card. Folded, the
// share is the figure beside the name and the median a line of its own,
// since the columns that held them fold away.
function SpreadRow({
  futures,
  marks,
  milestone,
  onEdit,
  plan,
}: SpreadRowProps): JSX.Element {
  const run = futures.length;
  const reached = futures.filter(
    (future) => reachedIn(future, milestone, plan) !== null,
  ).length;
  const reaching = run === 0 ? "…" : formatWholePercent(reached / run);
  const yearBy = (share: number): null | number =>
    reachedBy(futures, milestone, { plan, share });
  const spread: Spread = {
    ends: [yearBy(0.05), yearBy(0.95)],
    inner: [yearBy(0.25), yearBy(0.75)],
    median: yearBy(0.5),
    outer: [yearBy(0.1), yearBy(0.9)],
  };
  const conditions = milestone.conditions.map(conditionOf).join(" · ");
  const year = spread.median ?? unreached(run);
  const age =
    spread.median === null
      ? ""
      : ` · age ${String(ageIn(spread.median, plan))}`;
  function open(): void {
    onEdit(milestone);
  }
  const bar = (
    <PointedBar
      className="py-2"
      name={milestone.name}
      onOpen={open}
      plan={plan}
      points={pointsOf(sharesOf(spread))}
    >
      <SpreadBar marks={marks} plan={plan} spread={spread} />
    </PointedBar>
  );
  return (
    <li className={cn(lane, laneColumns)}>
      <div className="unfolded:hidden">
        <FoldedLines figure={reaching} name={milestone.name} onOpen={open}>
          <span>{conditions}</span>
          <span>{`Median ${String(year)}${age}`}</span>
          {bar}
        </FoldedLines>
      </div>
      <div className="grid min-w-0 gap-2 folded:hidden">
        <div className="grid gap-1">
          <RowOpener onOpen={open}>{milestone.name}</RowOpener>
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

// What stands for a year the run never reaches a milestone by: a dash,
// or an ellipsis while no future is drawn yet to say.
function unreached(run: number): string {
  return run === 0 ? "…" : "—";
}
