"use client";

import type { JSX } from "react";

import { ChevronRight, Goal as GoalIcon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Condition, Goal, GoalValues } from "@/data/goals";
import type { Plan } from "@/data/plan";
import type { Future } from "@/engine/futures";
import type { Entry } from "@/hooks/use-editor";

import { removeGoal, saveGoal } from "@/actions/goals";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { RowAction } from "@/components/app/atoms/row-action";
import { RowOpener } from "@/components/app/atoms/row-opener";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import {
  MoneyField,
  MultipleField,
} from "@/components/app/molecules/figure-field";
import { FoldedCell } from "@/components/app/molecules/folded-cell";
import { SectionCard } from "@/components/app/molecules/section-card";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import {
  bases,
  basisNames,
  conditionOf,
  measureNames,
  measures,
} from "@/data/goals";
import { ageIn } from "@/data/plan";
import { reachedBy, reachedIn } from "@/engine/futures";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { formatWholePercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";
import { optionsOf } from "@/lib/options";

interface ConditionRowProps {
  readonly condition: Keyed;
  readonly index: number;
  readonly isOnly: boolean;
  readonly onPatch: (change: Partial<Condition>) => void;
  readonly onRemove: () => void;
}

// What the dialog holds while it is open: the goal's values, each
// condition carrying a key of its own, so a row keeps its fields as
// the conditions before it are removed. The key is the dialog's and is
// never saved.
interface Draft {
  readonly conditions: readonly Keyed[];
  readonly name: string;
}

interface GoalFieldsProps {
  readonly draft: Draft;
  readonly initial: Draft;
  readonly onAmend: (patch: Partial<Draft>) => void;
}

interface GoalListProps {
  readonly futures: readonly Future[];
  readonly goals: readonly Goal[];
  readonly plan: Plan;
}

interface GoalRowProps {
  readonly futures: readonly Future[];
  readonly goal: Goal;
  readonly onEdit: (goal: Goal) => void;
  readonly plan: Plan;
}

interface Keyed extends Condition {
  readonly key: number;
}

// A condition added to a goal beneath its first: ten times the debt,
// in liquid net worth.
const another: Condition = { measure: "liquid", of: "debt", times: 10 };

const basisOptions = optionsOf(basisNames, bases);

// A new goal: the first million, in net worth, unnamed.
const blank: GoalValues = {
  conditions: [{ measure: "worth", of: "pounds", times: 1000000 }],
  name: "",
};

// The shares of the run a goal's year is read at, in the order the
// columns come: the median first, since it is the year the dashboard
// tiles, then the earliest 5%, 10% and 25%.
const columns = [
  { name: "Median", share: 0.5 },
  { name: "Earliest 5%", share: 0.05 },
  { name: "Earliest 10%", share: 0.1 },
  { name: "Earliest 25%", share: 0.25 },
] as const;

const measureOptions = optionsOf(measureNames, measures);

// The goals and when the futures reach them, a row apiece: the goal's
// name over its conditions in words, then the age and the year the
// run reaches it by at each share, the median first, then the share of
// the run that reaches it at all, read over the futures drawn so far
// while the run comes in and dashed where that many never reach it.
// A goal is added from the card's button and edited from its row, in a
// dialog, since its conditions are more than a row holds; the dialog of
// a saved goal offers a Delete that asks through the confirm dialog
// before the goal goes. A save goes to the store and comes back with
// the page re-read, which draws the run again. A phone folds each row
// into its name, with the share reaching it as the figure, over its
// conditions and the ages on one line.
export function GoalList({ futures, goals, plan }: GoalListProps): JSX.Element {
  const { amend, dialogOf, dismiss, entry, open } = useEditor<Draft, Goal>({
    describe: (goal) => goal.conditions.map(conditionOf).join(" · "),
    noun: "Goal",
    save: async (id, draft) => saveGoal(id, valuesOf(draft)),
  });
  const { ask, doomed, questionOf } = useRemover<Goal>({
    describe: (goal) => goal.name,
    noun: "Goal",
    remove: removeGoal,
  });

  // The Delete a saved goal's dialog offers, which closes the dialog
  // first, so the question stands alone. A new goal has nothing yet to
  // delete.
  function deleteFrom(current: Entry<Draft>): (() => void) | undefined {
    const goal = goals.find(({ id }) => id === current.id);
    return goal === undefined
      ? undefined
      : (): void => {
          dismiss();
          ask(goal);
        };
  }

  function edit(goal: Goal): void {
    open(draftOf(goal), goal.id);
  }

  return (
    <>
      <SectionCard
        actions={
          <Button
            onClick={() => {
              open(draftOf(blank), null);
            }}
            size="sm"
          >
            <Plus aria-hidden />
            Add goal
          </Button>
        }
        caption="Milestones the plan reaches rather than ones it is laid out by, each the first year a future meets its conditions: the year by which half the futures have reached it, which the Dashboard tiles, and by which the earliest 5%, 10% and 25% have."
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
          <Table>
            <TableHeader className="folded:hidden">
              <TableRow>
                <TableHead>Goal</TableHead>
                {columns.map(({ name }) => (
                  <TableHead className="text-right" key={name}>
                    {name}
                  </TableHead>
                ))}
                <TableHead className="text-right">Reached</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {goals.map((goal) => (
                <GoalRow
                  futures={futures}
                  goal={goal}
                  key={goal.id}
                  onEdit={edit}
                  plan={plan}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      {doomed !== null && (
        <ConfirmDialog {...questionOf(doomed)}>
          It cannot be brought back.
        </ConfirmDialog>
      )}
      {entry !== null && (
        <EditDialog
          {...dialogOf(entry)}
          canSave={entry.draft.name.trim() !== ""}
          isWide
          onDelete={deleteFrom(entry)}
          onDismiss={dismiss}
          title={entry.draft.name.trim() || "Untitled goal"}
        >
          <GoalFields
            draft={entry.draft}
            initial={entry.initial}
            onAmend={(patch) => {
              amend(entry, patch);
            }}
          />
        </EditDialog>
      )}
    </>
  );
}

// A condition's row: its measure across the top, then what it is held
// to and what that is a multiple of, with the press that removes it at
// the end, since the unit's names run too long to share a line with the
// measure in the dialog's width; a phone gives the sum a line of its
// own too. The two
// choices mount with the condition as the row opened, since a choice
// reports what it is set to and the draft mirrors it; the multiple is
// held to the draft, since the field it is typed into is a sum while
// the basis is pounds and a multiple otherwise, swapped as the basis
// turns, and shows the multiple as it stands.
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

// A goal's values as the dialog opens on them, each condition keyed by
// its place.
function draftOf({ conditions, name }: GoalValues): Draft {
  return {
    conditions: conditions.map((condition, key) => ({ ...condition, key })),
    name,
  };
}

// The fields a goal's dialog takes: the name, then a row for each
// condition, with a button adding another beneath them. The name
// mounts with the goal as it opened. The rows are keyed, so a row keeps
// its fields as the rows before it go, and the row added takes the key
// after the highest, so it never takes a key a row removed had. A goal
// holds a condition at least, so the last cannot be removed.
function GoalFields({ draft, initial, onAmend }: GoalFieldsProps): JSX.Element {
  const { conditions } = draft;
  return (
    <>
      <TextField
        defaultValue={initial.name}
        label="Name"
        onValueChange={(name) => {
          onAmend({ name });
        }}
        placeholder="First million, financial independence…"
      />
      {conditions.map((condition, index) => (
        <ConditionRow
          condition={condition}
          index={index}
          isOnly={conditions.length === 1}
          key={condition.key}
          onPatch={(change) => {
            onAmend({
              conditions: conditions.map((each) =>
                each.key === condition.key ? { ...each, ...change } : each,
              ),
            });
          }}
          onRemove={() => {
            onAmend({
              conditions: conditions.filter(({ key }) => key !== condition.key),
            });
          }}
        />
      ))}
      <div>
        <Button
          onClick={() => {
            onAmend({
              conditions: [
                ...conditions,
                {
                  ...another,
                  key: Math.max(-1, ...conditions.map(({ key }) => key)) + 1,
                },
              ],
            });
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

// A goal's row: its name, which opens it, over its conditions; the age
// and the year the run reaches it by at each share, a dash where that
// many never do and an ellipsis before any future is drawn; and the
// share of the run that reaches it. Folded, the share is the figure and
// the ages run along one line beneath the conditions.
function GoalRow({ futures, goal, onEdit, plan }: GoalRowProps): JSX.Element {
  const run = futures.length;
  const reached = futures.filter(
    (future) => reachedIn(future, goal, plan) !== null,
  ).length;
  const share = run === 0 ? "…" : formatWholePercent(reached / run);
  const read = columns.map(({ name, share: at }) => ({
    name,
    year: reachedBy(futures, goal, { plan, share: at }),
  }));
  const conditions = goal.conditions.map(conditionOf).join(" · ");
  function agedOf(year: null | number): string {
    return year === null ? unreached(run) : `age ${String(ageIn(year, plan))}`;
  }
  function open(): void {
    onEdit(goal);
  }
  return (
    <TableRow>
      <FoldedCell figure={share} name={goal.name} onOpen={open}>
        <span>{conditions}</span>
        <span>
          {read.map(({ name, year }) => `${name} ${agedOf(year)}`).join(" · ")}
        </span>
      </FoldedCell>
      <TableCell className="relative py-3 folded:hidden">
        <div className="grid gap-1">
          <RowOpener onOpen={open}>{goal.name}</RowOpener>
          <span className="text-xs text-muted-foreground">{conditions}</span>
        </div>
      </TableCell>
      {read.map(({ name, year }) => (
        <TableCell className="text-right folded:hidden" key={name}>
          <Reached plan={plan} run={run} year={year} />
        </TableCell>
      ))}
      <TableCell className="text-right figure folded:hidden">{share}</TableCell>
      <TableCell className="folded:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
}

// A year the run reaches a goal by: the age reached in it, leading,
// since a goal is read by age, over the year as a muted label.
function Reached({
  plan,
  run,
  year,
}: {
  readonly plan: Plan;
  readonly run: number;
  readonly year: null | number;
}): JSX.Element {
  if (year === null) {
    return (
      <span className="figure text-muted-foreground">{unreached(run)}</span>
    );
  }
  return (
    <span className="grid gap-0.5">
      <span className="figure">{`Age ${String(ageIn(year, plan))}`}</span>
      <span className="label text-muted-foreground">{year}</span>
    </span>
  );
}

// What stands for a year the run never reaches a goal by: a dash, or an
// ellipsis while no future is drawn yet to say.
function unreached(run: number): string {
  return run === 0 ? "…" : "—";
}

// The draft as the store takes it, the keys left behind.
function valuesOf({ conditions, name }: Draft): GoalValues {
  return {
    conditions: conditions.map(({ measure, of, times }) => ({
      measure,
      of,
      times,
    })),
    name,
  };
}
