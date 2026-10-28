"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import type { Condition, Marker, Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { LineValues } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";
import type { Sale } from "@/engine/projection";

import { PinBar } from "@/components/app/atoms/pin-bar";
import { RowOpener } from "@/components/app/atoms/row-opener";
import { SpanRuler } from "@/components/app/atoms/span-ruler";
import { YearAge } from "@/components/app/atoms/year-age";
import { FoldedLines } from "@/components/app/molecules/folded-lines";
import { MilestoneDialog } from "@/components/app/organisms/milestone-dialog";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { asPaid } from "@/data/income";
import {
  ageOf,
  atAge,
  conditionOf,
  markersOf,
  yearsOf,
} from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { counted } from "@/lib/count";
import { listed } from "@/lib/feeders";
import { formatGbp } from "@/lib/money";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";
import { laneColumns } from "@/lib/span";

interface MilestoneListProps {
  readonly milestones: readonly Milestone[];
  readonly onConditions: readonly Condition[] | undefined;
  readonly plan: Plan;
  readonly sales: readonly Sale[];
  readonly schedule: Schedule;
}

interface MilestoneRowProps {
  readonly detail: string | undefined;
  readonly marks: readonly number[];
  readonly name: string;
  readonly onOpen: () => void;
  readonly plan: Plan;
  readonly year: number | undefined;
}

// The plan screen's first card: the years the plan turns on, retirement
// among them, in the order they come, and after them the milestones
// reached when conditions hold, which fall in no year the plan can say.
// Each is a row laid out as a schedule's line is, its name over a pin
// on the plan's span where the line's bar would be, and its year over
// the age reached in it where the line's years would be, so a milestone
// reads as a line with no length on the same span as the lines beneath
// it. The columns are the schedules' own, the one template, the
// figure's left empty, so the span is as wide here as there and a pin
// sits over the years a bar beneath it reaches. A milestone reached
// when conditions hold has no pin and no year, its conditions in words
// beneath its name instead: the chance of success reads when the
// futures reach it, and this card says only that it is listed. The
// card comes before the schedules because the lines are laid out by
// the milestones rather than the other way round. Each row says which
// lines start and end at it, from either schedule, so what moves with
// a milestone is read where the milestone is, and retirement names the
// salaries and profits it stops as ending there, whatever their own
// ends say, since that is where they are paid to. There is always one
// row, retirement's, so there is no empty state.
// A milestone is added from the card's button and edited from its row,
// in the dialog the chance of success opens too, since how it is
// reached is a choice and conditions are more than a row holds; the
// dialog is handed the schedules, so it can hold a milestone lines are
// tied to at its age and say, before deleting one, what becomes of
// them. Retirement opens in the same dialog, as the plan's owner's,
// reached at an age, which the dashboard drags too, or when conditions
// hold, which the screen is told since the plan it is handed is laid
// out at the year its own rates reach them: its row says what it is
// reached on beside the lines tied to it, and pins that year, or draws
// no pin where the plan never reaches them. A milestone a house moves
// at says beside its ties what the move comes to, as the plan at its
// own rates makes it: the equity the sale leaves, the deposit on the
// next house, or its price where it is bought outright, and the stamp
// duty on it.
// The span is ruled in decades above the rows, in the pins' column, and
// every pin's track carries a faint rule at each milestone, as every
// line's bar beneath does, so the three cards read as lanes on the one
// span. While the list is too narrow to read across, as on a phone, each
// row folds into lines, as a schedule's does: the name and the year on
// the first, then the lines tied to it, then the pin, then the age, and
// the ruler runs the row's width as the pins do.
export function MilestoneList({
  milestones,
  onConditions,
  plan,
  sales,
  schedule,
}: MilestoneListProps): JSX.Element {
  const [opened, setOpened] = useState<"new" | "retirement" | Milestone | null>(
    null,
  );
  const markers = markersOf(milestones, plan);
  const marks = yearsOf(markers);
  const paid = [
    ...schedule.income.map((line) => asPaid(line, plan)),
    ...schedule.expenses,
  ];
  const reached = milestones.filter(
    (milestone) => ageOf(milestone) === undefined,
  );
  const retirement = { retirement: onConditions ?? atAge(plan.retires) };
  const openedOn = opened === "retirement" ? retirement : opened;
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
        label={subsectionLabel(planScreen, 1)}
        title="Milestones"
      >
        <CardContent className="@container grid gap-1">
          <div className={cn("grid gap-4 folded:grid-cols-1", laneColumns)}>
            <SpanRuler plan={plan} />
          </div>
          <ul className="@container divide-y">
            {markers.map((marker) => {
              const milestone = milestones.find(({ id }) => id === marker.id);
              const isOnConditions =
                milestone === undefined && onConditions !== undefined;
              const ties = tiesAt(marker, paid);
              const said = [
                ...(isOnConditions ? onConditions.map(conditionOf) : []),
                ...(ties === undefined ? [] : [ties]),
                ...sales.filter(({ at }) => at === marker.id).map(saleOf),
              ];
              return (
                <MilestoneRow
                  detail={said.length === 0 ? undefined : said.join(" · ")}
                  key={marker.id}
                  marks={marks}
                  name={marker.name}
                  onOpen={() => {
                    setOpened(milestone ?? "retirement");
                  }}
                  plan={plan}
                  year={
                    isOnConditions && marker.year > endYear(plan)
                      ? undefined
                      : marker.year
                  }
                />
              );
            })}
            {reached.map((milestone) => (
              <MilestoneRow
                detail={milestone.conditions.map(conditionOf).join(" · ")}
                key={milestone.id}
                marks={marks}
                name={milestone.name}
                onOpen={() => {
                  setOpened(milestone);
                }}
                plan={plan}
                year={undefined}
              />
            ))}
          </ul>
        </CardContent>
      </SectionCard>
      {opened !== null && (
        <MilestoneDialog
          key={typeof opened === "string" ? opened : opened.id}
          milestone={openedOn === "new" ? null : openedOn}
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

// The lines ending the years given after a milestone, "Ends Salary" at
// it and "Ends Childcare 3 years after" past it.
function endingAfter(lines: readonly LineValues[], after: number): string {
  const ends = `Ends ${namesOf(lines)}`;
  return after === 0 ? ends : `${ends} ${counted(after, "year")} after`;
}

// A milestone's row as it is listed, drawn in its columns and again in
// its folded lines, only one of which is shown at any width, and saying
// beside its name which lines end and start at it, or, for one reached
// when conditions hold, what they are. A row with a year pins it on the
// span and writes the year over the age reached in it; one without
// draws no pin and a dash where the year would be, since when it is
// reached is the futures' to say. A milestone opens from anywhere on
// it, either way, with a chevron at its end.
function MilestoneRow({
  detail,
  marks,
  name,
  onOpen,
  plan,
  year,
}: MilestoneRowProps): JSX.Element {
  const age =
    year === undefined ? "When reached" : `Age ${String(ageIn(year, plan))}`;
  const figure = year === undefined ? "—" : String(year);
  const bar =
    year === undefined ? undefined : (
      <PinBar marks={marks} plan={plan} year={year} />
    );
  return (
    <li
      className={cn(
        "relative grid items-center gap-4 py-3 first:pt-0 last:pb-0 folded:grid-cols-1",
        laneColumns,
      )}
    >
      <div className="unfolded:hidden">
        <FoldedLines
          figure={figure}
          isFigureMuted={year === undefined}
          name={name}
          onOpen={onOpen}
        >
          {detail !== undefined && <span>{detail}</span>}
          {bar !== undefined && (
            <div className="pointer-events-none my-1">{bar}</div>
          )}
          <span>{age}</span>
        </FoldedLines>
      </div>
      <div className="grid min-w-0 gap-2 folded:hidden">
        <div className="flex flex-wrap items-baseline gap-2">
          <RowOpener onOpen={onOpen}>{name}</RowOpener>
          {detail !== undefined && (
            <span className="text-xs text-muted-foreground">{detail}</span>
          )}
        </div>
        {bar !== undefined && <div className="pointer-events-none">{bar}</div>}
      </div>
      <YearAge age={age} className="col-start-3 folded:hidden" year={figure} />
      <span className="inline-flex size-7 items-center justify-center folded:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </span>
    </li>
  );
}

// The lines' names as a sentence lists them.
function namesOf(lines: readonly LineValues[]): string {
  return listed.format(lines.map(({ name }) => name));
}

// What a move comes to, "Moves Home: £304,000 equity, £289,000
// deposit, £15,000 stamp duty", the price "paid outright" rather than a
// deposit where the move borrows nothing.
function saleOf({ borrowed, deposit, duty, equity, house }: Sale): string {
  const paid = borrowed === 0 ? "paid outright" : "deposit";
  return `Moves ${house}: ${formatGbp(equity)} equity, ${formatGbp(deposit)} ${paid}, ${formatGbp(duty)} stamp duty`;
}

// Which lines end and start at the milestone, "Ends Salary and
// Household · Starts Retirement living", those ending some years after
// it by how many, "Ends Childcare 3 years after", or nothing for one no
// line is tied to.
function tiesAt(
  marker: Marker,
  lines: readonly LineValues[],
): string | undefined {
  const ending = Map.groupBy(
    lines.filter(({ endsAt }) => endsAt === marker.id),
    ({ endsAfter }) => endsAfter,
  );
  const starting = lines.filter(({ startsAt }) => startsAt === marker.id);
  const said = [
    ...[...ending]
      .sort(([first], [second]) => first - second)
      .map(([after, tied]) => endingAfter(tied, after)),
    ...(starting.length === 0 ? [] : [`Starts ${namesOf(starting)}`]),
  ];
  return said.length === 0 ? undefined : said.join(" · ");
}
