"use client";

import type { JSX, SubmitEvent } from "react";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import type { Marker, Milestone, MilestoneValues } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { LineValues } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";
import type { Entry } from "@/hooks/use-editor";

import { removeMilestone, saveMilestone } from "@/actions/milestones";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { PinBar } from "@/components/app/atoms/pin-bar";
import { RowLock } from "@/components/app/atoms/row-lock";
import { RowActions } from "@/components/app/molecules/row-actions";
import { SectionCard } from "@/components/app/molecules/section-card";
import { TextField } from "@/components/app/molecules/text-field";
import { YearField } from "@/components/app/molecules/year-field";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { isTiedTo, markersOf } from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { counted } from "@/lib/count";
import { listed } from "@/lib/feeders";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";

interface MilestoneFormProps {
  readonly canSave: boolean;
  readonly entry: Entry<MilestoneValues>;
  readonly isSaving: boolean;
  readonly label: string;
  readonly onAmend: (patch: Partial<MilestoneValues>) => void;
  readonly onDelete: (() => void) | undefined;
  readonly onDismiss: () => void;
  readonly onSave: (values: MilestoneValues) => void;
  readonly plan: Plan;
}

interface MilestoneListProps {
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

interface MilestoneRowProps {
  readonly lines: readonly LineValues[];
  readonly marker: Marker;
  readonly milestone: Milestone | undefined;
  readonly onDelete: (milestone: Milestone) => void;
  readonly onEdit: (milestone: Milestone) => void;
  readonly plan: Plan;
}

// Why retirement's row has no pencil or bin: it is set on another
// screen, and moves when it is.
const retirementLock = "Set by the retirement age on the dashboard";

// The plan screen's first card: the years the plan turns on, retirement
// among them, in the order they come. Each is a row laid out as a
// schedule's line is, its name over a pin on the plan's span where the
// line's bar would be, and its year over the age reached in it where the
// line's years would be, so a milestone reads as a line with no length
// on the same span as the lines beneath it. The columns are the
// schedules' own, the figure's left empty, so the span is as wide here
// as there and a pin sits over the years a bar beneath it reaches. The
// card comes before the schedules because the lines are laid out by the
// milestones rather than the other way round. Each row says which lines
// start and end at it, from either schedule, so what moves with a
// milestone is read where the milestone is. There is always one row,
// retirement's, so there is no empty state.
// A milestone is a name and a year, too little to open a dialog for, so
// it is added and edited where it is listed: the card's button opens a
// new one at the foot of the list, and a row's pencil turns the row into
// its two fields, as does a tap anywhere on a folded row, which has no
// room for a pencil. Save or Enter keeps it, Cancel or Escape leaves it
// as it was, and one row is edited at a time, so opening another drops
// the first. The entry is the editor every dialog is driven by, since
// only where the fields are drawn differs. A row's bin asks through the
// confirm dialog before the milestone goes, and the row being edited
// offers a Delete that asks the same, which is where a folded row is
// deleted from, and the question says what becomes of the lines tied to
// it, which keep the years it gives them now. Retirement draws a lock in
// place of both, since it is set on the dashboard, as the caption says.
// While the list is too narrow to read across, as on a phone, each row
// folds into lines, as a schedule's does: the name and the year on the
// first, then the lines tied to it, then the pin, then the age.
export function MilestoneList({
  milestones,
  plan,
  schedule,
}: MilestoneListProps): JSX.Element {
  const lines = [...schedule.income, ...schedule.expenses];
  const { amend, dialogOf, dismiss, entry, isSaving, open, save } = useEditor({
    describe: (milestone) => `${milestone.name} · ${String(milestone.year)}`,
    noun: "Milestone",
    save: saveMilestone,
  });
  const { ask, doomed, questionOf } = useRemover<Milestone>({
    describe: (milestone) => milestone.name,
    noun: "Milestone",
    remove: removeMilestone,
  });

  function edit({ id, name, year }: Milestone): void {
    open({ name, year }, id);
  }

  // The form for the entry, wherever it is drawn: in the place of the
  // row it edits, keyed as the row is, or at the foot of the list for a
  // new one. A row's key is the same while it is drawn and while it is
  // edited, but not the same kind of thing, so each opening mounts the
  // fields fresh. The Delete it offers for a saved milestone asks as the
  // row's bin does, once the form has closed, so the question stands
  // alone.
  function formFor(
    current: Entry<MilestoneValues>,
    key: "new" | Marker["id"],
  ): JSX.Element {
    const listed = milestones.find(({ id }) => id === current.id);
    return (
      <li className="py-3 first:pt-0 last:pb-0" key={key}>
        <MilestoneForm
          canSave={current.draft.name.trim() !== ""}
          entry={current}
          isSaving={isSaving}
          label={dialogOf(current).eyebrow}
          onAmend={(patch) => {
            amend(current, patch);
          }}
          onDelete={
            listed === undefined
              ? undefined
              : (): void => {
                  dismiss();
                  ask(listed);
                }
          }
          onDismiss={dismiss}
          onSave={(values) => {
            save({ ...current, draft: values });
          }}
          plan={plan}
        />
      </li>
    );
  }

  return (
    <>
      <SectionCard
        actions={
          <Button
            disabled={entry !== null && entry.id === null}
            onClick={() => {
              open(
                { name: "", year: Math.min(plan.from + 10, endYear(plan)) },
                null,
              );
            }}
            size="sm"
          >
            <Plus aria-hidden />
            Add milestone
          </Button>
        }
        caption="The years the plan turns on. A line tied to one moves with it, and retirement moves with the age set on the dashboard."
        label={subsectionLabel(planScreen, 1)}
        title="Milestones"
      >
        <CardContent>
          <ul className="@container divide-y">
            {markersOf(milestones, plan).map((marker) => {
              const milestone = milestones.find(({ id }) => id === marker.id);
              return entry !== null && isOpenOn(entry, milestone) ? (
                formFor(entry, marker.id)
              ) : (
                <MilestoneRow
                  key={marker.id}
                  lines={lines}
                  marker={marker}
                  milestone={milestone}
                  onDelete={ask}
                  onEdit={edit}
                  plan={plan}
                />
              );
            })}
            {entry !== null && entry.id === null && formFor(entry, "new")}
          </ul>
        </CardContent>
      </SectionCard>
      {doomed !== null && (
        <ConfirmDialog {...questionOf(doomed)}>
          {freed(lines.filter((line) => isTiedTo(line, doomed.id)).length)}
        </ConfirmDialog>
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

// What deleting a milestone does to the lines tied to it, before the
// warning every deletion carries: they stay where it put them.
function freed(tied: number): string {
  const stay =
    tied === 1
      ? "The line tied to it stays where it is, in a fixed year. "
      : `The ${String(tied)} lines tied to it stay where they are, in fixed years. `;
  return `${tied === 0 ? "" : stay}It cannot be brought back.`;
}

// Whether the entry is open on the milestone, which it never is on
// retirement, since retirement is no record.
function isOpenOn(
  entry: Entry<MilestoneValues>,
  milestone: Milestone | undefined,
): boolean {
  return entry.id !== null && entry.id === milestone?.id;
}

// A milestone's two fields in the place of its row, with Cancel and Save
// beneath them and, for a saved milestone, a Delete set apart at the
// other edge, as the edit dialog lays its footer out. The form is named
// as the dialog would be, "New milestone" or "Edit milestone". The name
// takes the focus as the form opens, since the form is opened to be
// typed in. The year commits when its field loses the focus, as every
// figure does, and Enter submits without the focus leaving it, so a
// submit takes the focus off its fields first and saves what they
// last reported, which is held beside the draft for that moment: the
// draft the form was drawn with would not yet have the year the blur
// has just committed. Escape leaves the milestone as it was, wherever
// the focus is, as it closes a dialog wherever the focus is in it. Save
// holds while the name is empty and while a save is on its way, and the
// Delete holds while a save is, as the dialog's do.
function MilestoneForm({
  canSave,
  entry,
  isSaving,
  label,
  onAmend,
  onDelete,
  onDismiss,
  onSave,
  plan,
}: MilestoneFormProps): JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const typedRef = useRef(entry.draft);

  useEffect(() => {
    formRef.current?.querySelector("input")?.focus();
  }, []);

  useEffect(() => {
    function escape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onDismiss();
      }
    }
    document.addEventListener("keydown", escape);
    return (): void => {
      document.removeEventListener("keydown", escape);
    };
  }, [onDismiss]);

  function amendWith(patch: Partial<MilestoneValues>): void {
    typedRef.current = { ...typedRef.current, ...patch };
    onAmend(patch);
  }

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    for (const input of event.currentTarget.querySelectorAll("input")) {
      input.blur();
    }
    onSave(typedRef.current);
  }

  return (
    <form
      aria-label={label}
      className="grid gap-4 rounded-md bg-muted/50 p-3"
      onSubmit={submit}
      ref={formRef}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_11rem] items-start gap-4 folded:grid-cols-1">
        <TextField
          defaultValue={entry.initial.name}
          label="Name"
          onValueChange={(name) => {
            amendWith({ name });
          }}
          placeholder="Kids leave home, downsize…"
        />
        <YearField
          defaultValue={entry.initial.year}
          hint={`Age ${String(ageIn(entry.draft.year, plan))}`}
          label="Year"
          max={endYear(plan)}
          min={plan.from}
          onValueCommitted={(year) => {
            amendWith({ year });
          }}
        />
      </div>
      <div className="flex justify-end gap-2">
        {onDelete !== undefined && (
          <Button
            className="mr-auto"
            disabled={isSaving}
            onClick={onDelete}
            size="sm"
            type="button"
            variant="destructive"
          >
            <Trash2 aria-hidden />
            Delete
          </Button>
        )}
        <Button onClick={onDismiss} size="sm" type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={!canSave || isSaving} size="sm" type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}

// A milestone's row as it is listed, drawn in its columns and again in
// its folded lines, only one of which is shown at any width, and saying
// beside its name which lines end and start at it. A saved milestone
// ends with its pencil and bin, and opens from anywhere on its folded
// lines; retirement draws its lock in both places instead, and opens
// nothing.
function MilestoneRow({
  lines,
  marker,
  milestone,
  onDelete,
  onEdit,
  plan,
}: MilestoneRowProps): JSX.Element {
  const age = `Age ${String(ageIn(marker.year, plan))}`;
  const detail = tiesAt(marker, lines);
  const lock =
    milestone === undefined ? <RowLock reason={retirementLock} /> : undefined;
  const bar = <PinBar plan={plan} year={marker.year} />;
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_9rem_11rem_auto] items-center gap-4 py-3 first:pt-0 last:pb-0 folded:grid-cols-1">
      <div className="unfolded:hidden">
        <FoldedLines
          figure={String(marker.year)}
          lock={lock}
          name={marker.name}
          onOpen={
            milestone === undefined
              ? undefined
              : (): void => {
                  onEdit(milestone);
                }
          }
        >
          {detail !== undefined && <span>{detail}</span>}
          <div className="pointer-events-none my-1">{bar}</div>
          <span>{age}</span>
        </FoldedLines>
      </div>
      <div className="grid min-w-0 gap-2 folded:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{marker.name}</span>
          {detail !== undefined && (
            <span className="text-xs text-muted-foreground">{detail}</span>
          )}
        </div>
        {bar}
      </div>
      <div className="col-start-3 grid gap-0.5 text-right folded:hidden">
        <span className="figure">{marker.year}</span>
        <span className="label text-muted-foreground/60">{age}</span>
      </div>
      <div className="folded:hidden">
        {milestone === undefined ? (
          <span className="inline-flex size-7 items-center justify-center">
            {lock}
          </span>
        ) : (
          <RowActions
            name={milestone.name}
            onDelete={onDelete}
            onEdit={onEdit}
            row={milestone}
          />
        )}
      </div>
    </li>
  );
}

// The lines' names as a sentence lists them.
function namesOf(lines: readonly LineValues[]): string {
  return listed.format(lines.map(({ name }) => name));
}

// Which lines end and start at the milestone, "Ends Salary and
// Household · Starts Retirement living", those ending some years after
// it by how many, "Ends Childcare 3 years after", or nothing for one no
// line is tied to.
function tiesAt(
  marker: Marker,
  lines: readonly LineValues[],
): string | undefined {
  const ending = lines.filter(({ endsAt }) => endsAt === marker.id);
  const starting = lines.filter(({ startsAt }) => startsAt === marker.id);
  const afters = [...new Set(ending.map(({ endsAfter }) => endsAfter))].sort(
    (first, second) => first - second,
  );
  const said = [
    ...afters.map((after) =>
      endingAfter(
        ending.filter(({ endsAfter }) => endsAfter === after),
        after,
      ),
    ),
    ...(starting.length === 0 ? [] : [`Starts ${namesOf(starting)}`]),
  ];
  return said.length === 0 ? undefined : said.join(" · ");
}
