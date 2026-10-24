"use client";

import type { JSX } from "react";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Condition, Milestone, MilestoneValues } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Entry } from "@/hooks/use-editor";
import type { Option } from "@/lib/options";

import {
  removeMilestone,
  saveMilestone,
  saveRetirement,
} from "@/actions/milestones";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { RadioChoice } from "@/components/app/atoms/radio-choice";
import { RowAction } from "@/components/app/atoms/row-action";
import { AgeField } from "@/components/app/molecules/age-field";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import {
  MoneyField,
  MultipleField,
} from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { Button } from "@/components/kit/button";
import { RadioGroup } from "@/components/kit/radio-group";
import {
  ageOf,
  atAge,
  basisNames,
  bornIn,
  conditionOf,
  isTiedTo,
  measureNames,
  sums,
  yearOf,
} from "@/data/milestones";
import { ageIn, endAge, endYear } from "@/data/plan";
import { useMountedEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { optionsOf } from "@/lib/options";

interface ConditionFieldsProps {
  readonly conditions: readonly Keyed[];
  readonly onChange: (conditions: readonly Keyed[]) => void;
}

interface ConditionRowProps {
  readonly condition: Keyed;
  readonly index: number;
  readonly isOnly: boolean;
  readonly onPatch: (change: Partial<Condition>) => void;
  readonly onRemove: () => void;
}

// What the dialog holds while it is open: the name; how the milestone
// is reached, at an age or when conditions hold, which the choice
// sets; the age, and whose it is, by their id, none for the plan's
// owner's, for the one; and the conditions, for the other, each
// carrying a key of its own, so a row keeps its fields as the rows
// before it are removed. Both are held whichever is chosen, so a
// choice turned and turned back finds what was typed. The key is the
// dialog's and is never saved.
interface Draft {
  readonly age: number;
  readonly conditions: readonly Keyed[];
  readonly kind: Kind;
  readonly name: string;
  readonly whose: number | undefined;
}

interface Keyed extends Condition {
  readonly key: number;
}

// How a milestone is reached: at an age, or when conditions hold.
type Kind = "age" | "conditions";

interface MilestoneDialogProps {
  readonly kind?: Kind;
  readonly milestone: Milestone | null | Retirement;
  readonly onClose: () => void;
  readonly plan: Plan;
  readonly schedule: Schedule;
}

// The plan's owner's retirement, as the dialog opens on it: what they
// retire on.
interface Retirement {
  readonly retirement: readonly Condition[];
}

// A condition added beneath the first: ten times the debt, in liquid
// net worth.
const another: Condition = { measure: "liquid", of: "debt", times: 10 };

// The choices a condition offers: the sums, and what a sum may be held
// to. An age is the other way's to be reached at, so it is offered by
// neither.
const basisOptions = optionsOf(basisNames, ["pounds", ...sums]);

// The conditions a milestone opens on before any is typed: the first
// million, in net worth.
const firstMillion: readonly Condition[] = [
  { measure: "worth", of: "pounds", times: 1000000 },
];

const measureOptions = optionsOf(measureNames, sums);

// The conditions retirement opens on before any is typed: twenty-five
// years of expenses, in liquid net worth, the rule of thumb a
// withdrawal of 4% a year makes.
const twentyFiveYears: readonly Condition[] = [
  { measure: "liquid", of: "expenses", times: 25 },
];

// The dialog a milestone is entered or edited in, from the plan
// screen's list and from the chance of success alike, since the two
// list the one record: the name, then how the milestone is reached, a
// choice between an age and conditions, with the age's field or the
// conditions' rows beneath whichever is chosen. The age is someone's,
// chosen beside it where the plan carries anyone but its owner: the
// plan's owner's, whoever that is, another owner's or a child's born by
// the year it falls in, and choosing another keeps that year, so a
// milestone typed at the plan's owner's age can be measured on a
// child's without moving. The age is bounded
// by the plan's years as whoever's it is reaches them, and says beneath
// it which year it falls in, since the lists lay the milestone out by
// year. It is open for as long as
// it is mounted, so a list renders it while it holds a milestone to
// open on, or a new one, and the entry mounts from that, opening a new
// one reached as the caller says, at an age unless it says otherwise.
// The editor hook holds the entry, the save and the toast, as it does
// for every dialog; what is the milestone's own is the draft the two
// ways share and the values the save sends, which are the one
// condition on the age or the conditions as typed, sent beside the
// milestone as it opened, so the store refuses a save over a milestone
// changed meanwhile. The caller is told
// when the dialog is done with, saved, deleted or dismissed, so it can
// drop it.
// A milestone lines are tied to is held to its age: the choice of
// conditions is held, saying why, since a tied line moves with the
// milestone's year and one reached when conditions hold has none the
// plan can say, which the store would refuse after the round trip in
// its own words. The dialog is handed the schedules to count the lines
// tied to it, and the dialog of a milestone the store holds offers a
// Delete, which closes it and asks through the confirm dialog before
// the milestone goes, saying what becomes of those lines; a new
// milestone has nothing yet to delete and is offered none.
// Retirement is edited here too, from the plan screen's list, as the
// plan's owner's: named Retirement, with no name to type and nothing to
// delete, and saved onto the owner rather than among the records. It
// is never held to its age by the lines tied to it, since a run moves
// them with a retirement on conditions year by year.
export function MilestoneDialog({
  kind = "age",
  milestone,
  onClose,
  plan,
  schedule,
}: MilestoneDialogProps): JSX.Element | null {
  const isRetirement = milestone !== null && "retirement" in milestone;
  const record = isRetirement ? null : milestone;
  const { amend, dialogOf, entry } = useMountedEditor<Draft, MilestoneValues>({
    describe: (saved) => describeOf(saved, plan),
    noun: isRetirement ? "Retirement" : "Milestone",
    onSaved: onClose,
    opening: openingOf(milestone, kind, plan),
    save: async (id, draft) =>
      isRetirement
        ? saveRetirement(valuesOf(draft).conditions)
        : saveMilestone(id, valuesOf(draft), record),
  });
  const { ask, doomed, questionOf } = useRemover<Milestone>({
    describe: ({ name }) => name,
    noun: "Milestone",
    onRemoved: onClose,
    remove: removeMilestone,
  });
  const tied =
    record === null
      ? 0
      : [...schedule.income, ...schedule.expenses].filter((line) =>
          isTiedTo(line, record.id),
        ).length;
  if (doomed !== null) {
    return (
      <ConfirmDialog {...questionOf(doomed)} onCancel={onClose}>
        {freedOf(tied)}
      </ConfirmDialog>
    );
  }
  if (entry === null) {
    return null;
  }
  const { draft } = entry;
  const born = bornOf(plan, draft.whose);
  const isShared = plan.owners.length + (plan.children?.length ?? 0) > 1;
  return (
    <EditDialog
      {...dialogOf(entry)}
      canSave={draft.name.trim() !== ""}
      isWide
      onDelete={
        record === null
          ? undefined
          : (): void => {
              ask(record);
            }
      }
      onDismiss={onClose}
      title={draft.name.trim() || "Untitled milestone"}
    >
      {!isRetirement && (
        <TextField
          defaultValue={entry.initial.name}
          label="Name"
          onValueChange={(name) => {
            amend(entry, { name });
          }}
          placeholder="Kids leave home, first million…"
        />
      )}
      <RadioGroup
        aria-label="Reached"
        className="grid gap-4 sm:grid-cols-2"
        onValueChange={(chosen) => {
          amend(entry, {
            kind: chosen === "conditions" ? "conditions" : "age",
          });
        }}
        value={draft.kind}
      >
        <RadioChoice label="At an age" value="age">
          {isRetirement
            ? "Dragged on the dashboard too"
            : "Lines can be tied to it"}
        </RadioChoice>
        <RadioChoice
          isDisabled={tied > 0}
          label="When conditions hold"
          value="conditions"
        >
          {reachedOf(isRetirement, tied)}
        </RadioChoice>
      </RadioGroup>
      {draft.kind === "age" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {!isRetirement && isShared && (
            <SelectField
              defaultValue={
                draft.whose === undefined ? "" : String(draft.whose)
              }
              label="Whose age"
              onValueChange={(chosen) => {
                const whose = chosen === "" ? undefined : Number(chosen);
                amend(entry, {
                  age: born + draft.age - bornOf(plan, whose),
                  whose,
                });
              }}
              options={peopleOf(plan, born + draft.age)}
            />
          )}
          <AgeField
            hasSlider={false}
            hint={`In ${String(born + draft.age)}`}
            label="Age"
            max={endYear(plan) - born}
            min={Math.max(0, plan.from - born)}
            onValueCommitted={(age) => {
              amend(entry, { age });
            }}
            value={draft.age}
          />
        </div>
      ) : (
        <ConditionFields
          conditions={draft.conditions}
          onChange={(conditions) => {
            amend(entry, { conditions });
          }}
        />
      )}
    </EditDialog>
  );
}

// The year whoever's age a milestone is reached at was born, the plan's
// owner's for one measured on someone the plan does not carry, as only
// a page drawn before they went could hand it, for the store to refuse
// once it is saved.
function bornOf(plan: Plan, whose: number | undefined): number {
  return bornIn(plan, whose) ?? plan.born;
}

// The rows a milestone reached when conditions hold takes: a row for
// each condition, with a button adding another beneath them. The rows
// are keyed, so a row keeps its fields as the rows before it go, and
// the row added takes the key after the highest, so it never takes a
// key a row removed had. A milestone holds a condition at least, so
// the last cannot be removed.
function ConditionFields({
  conditions,
  onChange,
}: ConditionFieldsProps): JSX.Element {
  return (
    <>
      {conditions.map((condition, index) => (
        <ConditionRow
          condition={condition}
          index={index}
          isOnly={conditions.length === 1}
          key={condition.key}
          onPatch={(change) => {
            onChange(
              conditions.map((each) =>
                each.key === condition.key ? { ...each, ...change } : each,
              ),
            );
          }}
          onRemove={() => {
            onChange(conditions.filter(({ key }) => key !== condition.key));
          }}
        />
      ))}
      <div>
        <Button
          onClick={() => {
            onChange([
              ...conditions,
              {
                ...another,
                key: Math.max(-1, ...conditions.map(({ key }) => key)) + 1,
              },
            ]);
          }}
          size="sm"
          variant="outline"
        >
          <Plus aria-hidden />
          Add condition
        </Button>
      </div>
    </>
  );
}

// A condition's row: its measure across the top, then what it is held
// to and what that is a multiple of, with the press that removes it at
// the end, since the unit's names run too long to share a line with the
// measure in the dialog's width; a phone gives the sum a line of its
// own too. The two choices mount with the condition as the row opened,
// since a choice reports what it is set to and the draft mirrors it;
// the multiple is held to the draft, since the field it is typed into
// is a sum while the basis is pounds and a multiple otherwise, swapped
// as the basis turns, and shows the multiple as it stands.
function ConditionRow({
  condition,
  index,
  isOnly,
  onPatch,
  onRemove,
}: ConditionRowProps): JSX.Element {
  const [opened] = useState(condition);
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-4 sm:grid-cols-[8rem_1fr_auto]">
      <div className="col-span-2 sm:col-span-3">
        <SelectField
          defaultValue={opened.measure}
          label="Measure"
          onValueChange={(measure) => {
            onPatch({ measure });
          }}
          options={measureOptions}
        />
      </div>
      <div className="col-span-2 sm:col-span-1">
        {condition.of === "pounds" ? (
          <MoneyField
            label="At least"
            min={0}
            onValueCommitted={(times) => {
              onPatch({ times });
            }}
            value={condition.times}
          />
        ) : (
          <MultipleField
            label="At least"
            min={0}
            onValueCommitted={(times) => {
              onPatch({ times });
            }}
            value={condition.times}
          />
        )}
      </div>
      <SelectField
        defaultValue={opened.of}
        label="Unit"
        onValueChange={(of) => {
          onPatch({ of });
        }}
        options={basisOptions}
      />
      <RowAction
        disabled={isOnly}
        icon={Trash2}
        name={`Remove condition ${String(index + 1)}`}
        onClick={onRemove}
        tone="destructive"
      />
    </div>
  );
}

// What the toast says of the milestone saved: its name, then the year
// it is reached in for one reached at an age, or its conditions in
// words.
function describeOf(saved: MilestoneValues, plan: Plan): string {
  const year = yearOf(saved, plan);
  const when =
    year === undefined
      ? saved.conditions.map(conditionOf).join(" · ")
      : String(year);
  return `${saved.name} · ${when}`;
}

// What deleting the milestone does to the lines tied to it, so many of
// them, before the warning every deletion carries: they stay where it
// put them.
function freedOf(tied: number): string {
  const stay =
    tied === 1
      ? "The line tied to it stays where it is, in a fixed year. "
      : `The ${String(tied)} lines tied to it stay where they are, in fixed years. `;
  return `${tied === 0 ? "" : stay}It cannot be brought back.`;
}

// Why the milestone is held to its age, under the choice it cannot
// make: the lines tied to it, so many of them, move with its year.
function heldBy(tied: number): string {
  return tied === 1
    ? "Not while the line tied to it moves with its year: untie it first"
    : `Not while the ${String(tied)} lines tied to it move with its year: untie them first`;
}

// The conditions as the dialog holds them, each keyed by its place.
function keyed(conditions: readonly Condition[]): Keyed[] {
  return conditions.map((condition, key) => ({ ...condition, key }));
}

// The entry the dialog mounts open on: a new milestone under no id,
// unnamed, reached as the caller says, at the age the plan's owner
// reaches ten years into the plan, or at its end if that is sooner, as
// a new expense line runs for, and at the first million; the milestone
// under its id, reached as it is, at whoever's age it names, with the
// other way's fields standing by at those opening values; or
// retirement, named so, reached as the owner retires, its age standing
// by at the age the plan lays it out at, held to the plan's end, and its
// conditions at twenty-five years of expenses. Retirement is no record and is opened under nought, which
// no record's id is, so it is edited rather than added.
function openingOf(
  milestone: Milestone | null | Retirement,
  kind: Kind,
  plan: Plan,
): Entry<Draft> {
  if (milestone !== null && "retirement" in milestone) {
    const age = ageOf({ conditions: milestone.retirement });
    const draft: Draft = {
      age: age ?? Math.min(plan.retires, endAge(plan)),
      conditions: keyed(
        age === undefined ? milestone.retirement : twentyFiveYears,
      ),
      kind: age === undefined ? "conditions" : "age",
      name: "Retirement",
      whose: undefined,
    };
    return { draft, id: 0, initial: draft };
  }
  const tenYearsIn = ageIn(Math.min(plan.from + 10, endYear(plan)), plan);
  if (milestone === null) {
    const draft: Draft = {
      age: tenYearsIn,
      conditions: keyed(firstMillion),
      kind,
      name: "",
      whose: undefined,
    };
    return { draft, id: null, initial: draft };
  }
  const age = ageOf(milestone);
  const draft: Draft = {
    age: age ?? tenYearsIn,
    conditions: keyed(age === undefined ? milestone.conditions : firstMillion),
    kind: age === undefined ? "conditions" : "age",
    name: milestone.name,
    whose: milestone.conditions[0]?.whose,
  };
  return { draft, id: milestone.id, initial: draft };
}

// Whose age a milestone falling in the year given may be reached at, as
// the choice offers them: the plan's owner first, named as the plan's,
// under no id, since a milestone naming nobody is theirs whoever the
// plan's owner is, then every other owner and every child born by the
// year, each by their id, so choosing any of them keeps the year.
function peopleOf(plan: Plan, year: number): readonly Option<string>[] {
  const people = [
    ...plan.owners,
    ...(plan.children ?? []).map(({ born, id, name }) => ({
      born: born.year,
      id,
      name,
    })),
  ];
  return people.flatMap(({ born, id, name }, place) => {
    if (place === 0) {
      return [{ label: `${name} (the plan's owner)`, value: "" }];
    }
    return born <= year ? [{ label: name, value: String(id) }] : [];
  });
}

// What the choice of conditions says beneath it: for retirement, that
// each future retires when they first hold; for a milestone, that the
// chance of success reads it, or why it is held while lines are tied to
// it, which retirement never is, since its lines move with each future.
function reachedOf(isRetirement: boolean, tied: number): string {
  if (isRetirement) {
    return "Each future retires once they first hold";
  }
  return tied === 0 ? "Read by the chance of success" : heldBy(tied);
}

// The draft as the store takes it: the one condition on the age,
// whoever's it is, or the conditions with the keys left behind.
function valuesOf(draft: Draft): MilestoneValues {
  return {
    conditions:
      draft.kind === "age"
        ? atAge(draft.age, draft.whose)
        : draft.conditions.map(({ measure, of, times }) => ({
            measure,
            of,
            times,
          })),
    name: draft.name,
  };
}
