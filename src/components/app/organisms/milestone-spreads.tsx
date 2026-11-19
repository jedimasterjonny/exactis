"use client";

import type { Route } from "next";
import type { JSX, ReactNode } from "react";

import { cn } from "cn";
import { ChevronRight, Flag, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Spread } from "@/components/app/atoms/spread-bar";
import type { Condition, Marker, Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";

import { PinBar } from "@/components/app/atoms/pin-bar";
import { RowLock } from "@/components/app/atoms/row-lock";
import { RowOpener } from "@/components/app/atoms/row-opener";
import { SpanRuler } from "@/components/app/atoms/span-ruler";
import { SpreadBar } from "@/components/app/atoms/spread-bar";
import { YearAge } from "@/components/app/atoms/year-age";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { FoldedLines } from "@/components/app/molecules/folded-lines";
import { MilestoneDialog } from "@/components/app/organisms/milestone-dialog";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/kit/tooltip";
import {
  ageOf,
  conditionsOf,
  markersOf,
  retiresOn,
  yearOf,
  yearsOf,
} from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { reachedIn, yearBy } from "@/engine/futures";
import { listed as inWords } from "@/lib/feeders";
import { formatWholePercent } from "@/lib/money";
import { chance, plan as planScreen, subsectionLabel } from "@/lib/nav";
import { laneColumns } from "@/lib/span";

interface MilestoneSpreadsProps {
  readonly futures: readonly Future[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

// A year named on a milestone's bar: one a share of the run reaches the
// milestone by, null where that many never do, or one a milestone is
// reached at an age in, with what tells it from every other.
interface Named {
  readonly id: number | string;
  readonly name: string;
  readonly year: null | number;
}

// What a row opens: the dialog a milestone listed here is edited in, or
// the screen retirement is set on.
type Opens = { readonly href: Route } | { readonly onOpen: () => void };

interface PinnedRowProps {
  readonly markers: readonly Marker[];
  readonly milestone: Milestone;
  readonly onEdit: (milestone: Milestone) => void;
  readonly plan: Plan;
  readonly year: number;
}

interface PointedBarProps {
  readonly children: ReactNode;
  readonly name: string;
  readonly named: readonly Named[];
  readonly opens: Opens;
  readonly plan: Plan;
}

interface SpreadRowProps {
  readonly conditions: readonly Condition[];
  readonly markers: readonly Marker[];
  readonly name: string;
  readonly opens: Opens;
  readonly plan: Plan;
  readonly reached: readonly (null | number)[];
}

// Why retirement's row is held here: it is set among the milestones on
// the plan screen, and the row links there.
const retirementLock = `Set among the milestones on ${planScreen.label}`;

// The lane every row is laid in: the schedules' columns, folded into
// one on a phone.
const lane =
  "relative grid items-center gap-4 py-3 first:pt-0 last:pb-0 folded:grid-cols-1 pointer-coarse:min-h-11";

// Every milestone and when it is reached, a lane apiece on the plan's
// span, as the plan screen lays its milestones and lines: those reached
// at an age first, in the order their years come, each its name over a
// pin where it falls, with the year and the age beside, as the plan
// screen pins it, since the plan says when it falls and the futures
// have nothing to add; then those reached when conditions hold,
// retirement first where it is reached so, each
// its name over its conditions in words, over where the futures reach
// it, the fan on its side, with the share of the run that reaches it at
// all and the median year beside, and the year and age at each share
// from the earliest 5% to the latest 5% on the bar, hovered or focused,
// all read over the futures drawn so far while the run comes in. The
// lanes are ruled at the milestones reached at an age, so a median is
// read against retirement, and the bar of a milestone reached when
// conditions hold names them beside its shares, the next bar along
// opening at once once one is open. On a touch screen each row is one
// target, at least 44px tall. A milestone is added from the card's
// button and edited from its row, in the dialog the plan screen opens
// too, opened on conditions here, since that is what this card reads,
// and handed the schedules as there, since a milestone reached at an
// age can be edited and deleted from here too. A save goes to the
// store and comes back with the page re-read, which draws the run
// again. A phone folds each lane into lines, as the plan screen's fold,
// with the bar the row's width. A household listing no milestone and
// retiring at an age has nothing to lay out, and says so.
export function MilestoneSpreads({
  futures,
  milestones,
  plan,
  schedule,
}: MilestoneSpreadsProps): JSX.Element {
  const [opened, setOpened] = useState<"new" | Milestone | null>(null);
  const markers = markersOf(milestones, plan);
  const pinned = milestones
    .flatMap((milestone) => {
      const year = yearOf(milestone, plan);
      return year === undefined ? [] : [{ milestone, year }];
    })
    .sort((first, second) => first.year - second.year);
  const reached = milestones.filter(
    (milestone) => ageOf(milestone) === undefined,
  );
  const retirement = retiresOn(plan);
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
        label={subsectionLabel(chance, 3)}
        title="When the milestones are reached"
      >
        {milestones.length === 0 && retirement === undefined ? (
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
            <TooltipProvider>
              <ul className="@container divide-y">
                {pinned.map(({ milestone, year }) => (
                  <PinnedRow
                    key={milestone.id}
                    markers={markers}
                    milestone={milestone}
                    onEdit={setOpened}
                    plan={plan}
                    year={year}
                  />
                ))}
                {retirement !== undefined && (
                  <SpreadRow
                    conditions={retirement}
                    markers={markers}
                    name="Retirement"
                    opens={{ href: planScreen.href }}
                    plan={plan}
                    reached={futures.map(({ retired }) => retired)}
                  />
                )}
                {reached.map((milestone) => (
                  <SpreadRow
                    conditions={milestone.conditions}
                    key={milestone.id}
                    markers={markers}
                    name={milestone.name}
                    opens={{
                      onOpen: (): void => {
                        setOpened(milestone);
                      },
                    }}
                    plan={plan}
                    reached={futures.map((future) =>
                      reachedIn(future, milestone, plan),
                    )}
                  />
                ))}
              </ul>
            </TooltipProvider>
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
// reaches it in that year. Its bar marks alone, and lets a press
// through to the row, since the year and the age it marks are beside.
function PinnedRow({
  markers,
  milestone,
  onEdit,
  plan,
  year,
}: PinnedRowProps): JSX.Element {
  const age = `Age ${String(ageIn(year, plan))}`;
  function open(): void {
    onEdit(milestone);
  }
  const bar = (
    <div className="pointer-events-none">
      <PinBar marks={yearsOf(markers)} plan={plan} year={year} />
    </div>
  );
  return (
    <li className={cn(lane, laneColumns)}>
      <div className="unfolded:hidden">
        <FoldedLines figure={String(year)} name={milestone.name} onOpen={open}>
          <div className="my-1">{bar}</div>
          <span>{age}</span>
        </FoldedLines>
      </div>
      <div className="grid min-w-0 gap-2 folded:hidden">
        <RowOpener onOpen={open}>{milestone.name}</RowOpener>
        {bar}
      </div>
      <YearAge age={age} className="col-start-3 folded:hidden" year={year} />
      <span className="inline-flex size-7 items-center justify-center folded:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </span>
    </li>
  );
}

// A bar of a milestone reached when conditions hold, as one target over
// it, 24px tall and the bar's width, where the bar names anything: named
// for the row's milestone and every year on the bar, with what is named
// in it and the age, the names of a year joined as a sentence lists
// them, and the shares the run never reaches it by named last. Hovered
// or focused, it opens a tooltip above listing them, a name a line in
// the order their years come, beside its year and age, or a dash for a
// share never reached. Pressed, it opens what its row opens: the dialog
// the milestone is edited in, or, as a link, the screen retirement is
// set on. On a touch screen it lets the press through to the row, which
// is the one target there, since a tooltip opens to a mouse alone.
function PointedBar({
  children,
  name,
  named,
  opens,
  plan,
}: PointedBarProps): JSX.Element {
  const inSpan = named
    .flatMap(({ id, name: called, year }) =>
      year === null || year < plan.from || year > endYear(plan)
        ? []
        : [{ called, id, year }],
    )
    .toSorted((first, second) => first.year - second.year);
  const never = named.flatMap(({ name: called, year }) =>
    year === null ? [called] : [],
  );
  const spoken = [
    ...[...Map.groupBy(inSpan, ({ year }) => year)].map(
      ([year, entries]) =>
        `${inWords.format(entries.map(({ called }) => called))} ${String(year)}, age ${String(ageIn(year, plan))}`,
    ),
    ...(never.length === 0 ? [] : [`${inWords.format(never)}, never`]),
  ];
  return (
    <div className="pointer-events-none relative py-2">
      {children}
      {spoken.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            aria-label={`${name}: ${spoken.join("; ")}`}
            className="pointer-events-auto absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden pointer-coarse:pointer-events-none"
            delay={150}
            {...("href" in opens
              ? { render: <Link href={opens.href} /> }
              : { onClick: opens.onOpen })}
          />
          <TooltipContent>
            <span className="grid gap-0.5">
              {[
                ...inSpan.map(({ called, id, year }) => ({
                  called,
                  id: String(id),
                  reach: `${String(year)} · age ${String(ageIn(year, plan))}`,
                })),
                ...never.map((called) => ({ called, id: called, reach: "—" })),
              ].map(({ called, id, reach }) => (
                <span className="flex gap-3" key={id}>
                  <span className="whitespace-nowrap">{called}</span>
                  <span className="ml-auto figure">{reach}</span>
                </span>
              ))}
            </span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
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
  return listed.map(([name, year]) => ({ id: name, name, year }));
}

// The row of a milestone reached when conditions hold, drawn in its
// columns and again in its folded lines, only one of which is shown at
// any width: its name, which opens it, over its conditions, over where
// the futures reach it on the plan's span; then the share of the run
// that reaches it at all, labelled, and the year by which half have,
// with the age beneath, a dash where half never do and an ellipsis
// before any future is drawn. The year and age at each share are read
// on the bar, hovered or focused, with its rules', since seven of them
// written beneath each bar crowded the card; before any future is
// drawn it names its rules alone. Folded, the
// share is the figure beside the name and the median a line of its own,
// since the columns that held them fold away. Retirement on conditions
// is such a row, read off the year each future retired in, and set
// among the milestones on the plan screen, so its row links there with
// a lock in the chevron's place.
function SpreadRow({
  conditions,
  markers,
  name,
  opens,
  plan,
  reached,
}: SpreadRowProps): JSX.Element {
  const run = reached.length;
  const reaching =
    run === 0
      ? "…"
      : formatWholePercent(
          reached.filter((year) => year !== null).length / run,
        );
  const by = (share: number): null | number => yearBy(reached, share);
  const spread: Spread = {
    ends: [by(0.05), by(0.95)],
    inner: [by(0.25), by(0.75)],
    median: by(0.5),
    outer: [by(0.1), by(0.9)],
  };
  const said = conditionsOf(conditions);
  const year = spread.median ?? unreached(run);
  const age =
    spread.median === null
      ? ""
      : ` · age ${String(ageIn(spread.median, plan))}`;
  const lock =
    "href" in opens ? <RowLock reason={retirementLock} /> : undefined;
  const bar = (
    <PointedBar
      name={name}
      named={run === 0 ? markers : [...sharesOf(spread), ...markers]}
      opens={opens}
      plan={plan}
    >
      <SpreadBar marks={yearsOf(markers)} plan={plan} spread={spread} />
    </PointedBar>
  );
  return (
    <li className={cn(lane, laneColumns)}>
      <div className="unfolded:hidden">
        <FoldedLines
          figure={reaching}
          name={name}
          {...("href" in opens
            ? { href: opens.href, lock }
            : { onOpen: opens.onOpen })}
        >
          <span>{said}</span>
          <span>{`Median ${String(year)}${age}`}</span>
          {bar}
        </FoldedLines>
      </div>
      <div className="grid min-w-0 gap-2 folded:hidden">
        <div className="grid gap-1">
          {"href" in opens ? (
            <RowOpener href={opens.href}>{name}</RowOpener>
          ) : (
            <RowOpener onOpen={opens.onOpen}>{name}</RowOpener>
          )}
          <span className="text-xs text-muted-foreground">{said}</span>
        </div>
        {bar}
      </div>
      <span className="grid gap-0.5 text-right folded:hidden">
        <span className="figure">{reaching}</span>
        <span className="label text-muted-foreground">reach it</span>
      </span>
      <YearAge age={`Median${age}`} className="folded:hidden" year={year} />
      <span className="inline-flex size-7 items-center justify-center folded:hidden">
        {lock ?? (
          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
        )}
      </span>
    </li>
  );
}

// What stands for a year the run never reaches a milestone by: a dash,
// or an ellipsis while no future is drawn yet to say.
function unreached(run: number): string {
  return run === 0 ? "…" : "—";
}
