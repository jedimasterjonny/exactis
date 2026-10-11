"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { ChevronRight, Goal as GoalIcon, Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";

import type { Spread } from "@/components/app/atoms/spread-bar";
import type { Condition, Milestone, MilestoneValues } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Future } from "@/engine/futures";
import type { Entry } from "@/hooks/use-editor";

import { removeMilestone, saveMilestone } from "@/actions/milestones";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { RowAction } from "@/components/app/atoms/row-action";
import { RowOpener } from "@/components/app/atoms/row-opener";
import { SpanRuler } from "@/components/app/atoms/span-ruler";
import { SpreadBar } from "@/components/app/atoms/spread-bar";
import { YearAge } from "@/components/app/atoms/year-age";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import {
  MoneyField,
  MultipleField,
} from "@/components/app/molecules/figure-field";
import { SectionCard } from "@/components/app/molecules/section-card";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/kit/tooltip";
import {
  basisNames,
  conditionOf,
  markersOf,
  measureNames,
  sums,
  yearsOf,
} from "@/data/milestones";
import { ageIn } from "@/data/plan";
import { reachedBy, reachedIn } from "@/engine/futures";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { formatWholePercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";
import { optionsOf } from "@/lib/options";
import { laneColumns } from "@/lib/span";

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

interface Keyed extends Condition {
  readonly key: number;
}

// A condition added to a goal beneath its first: ten times the debt,
// in liquid net worth.
const another: Condition = { measure: "liquid", of: "debt", times: 10 };

// The choices a condition offers: the sums, and what a sum may be held
// to. An age is no goal's to reach, so it is offered by neither.
const basisOptions = optionsOf(basisNames, ["pounds", ...sums]);

// A new goal: the first million, in net worth, unnamed.
const blank: MilestoneValues = {
  conditions: [{ measure: "worth", of: "pounds", times: 1000000 }],
  name: "",
};

const measureOptions = optionsOf(measureNames, sums);

// The goals and when the futures reach them, a lane apiece on the
// plan's span, as the plan screen lays its milestones and lines: the
// goal's name over its conditions in words, over where the futures
// reach it, the fan on its side, with the share of the run that
// reaches it at all and the median year beside, and the year and age
// at each share from the earliest 5% to the latest 5% on the bar,
// hovered or focused, all read over the futures drawn so far while
// the run comes in. The lanes are ruled at the milestones, so a median
// is read against retirement. A goal is added from the card's button
// and edited from its row, in a dialog, since its conditions are more
// than a row holds; the dialog of a saved goal offers a Delete that
// asks through the confirm dialog before the goal goes. A save goes
// to the store and comes back with the page re-read, which draws the
// run again. A phone folds each lane into lines, as the plan screen's
// fold, with the bar the row's width.
export function GoalList({
  futures,
  goals,
  milestones,
  plan,
}: GoalListProps): JSX.Element {
  const marks = yearsOf(markersOf(milestones, plan));
  const { amend, dialogOf, dismiss, entry, open } = useEditor<Draft, Milestone>(
    {
      describe: (goal) => goal.conditions.map(conditionOf).join(" · "),
      noun: "Goal",
      save: async (id, draft) => saveMilestone(id, valuesOf(draft)),
    },
  );
  const { ask, doomed, questionOf } = useRemover<Milestone>({
    describe: (goal) => goal.name,
    noun: "Goal",
    remove: removeMilestone,
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

  function edit(goal: Milestone): void {
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
                  onEdit={edit}
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
function draftOf({ conditions, name }: MilestoneValues): Draft {
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

// The draft as the store takes it, the keys left behind.
function valuesOf({ conditions, name }: Draft): MilestoneValues {
  return {
    conditions: conditions.map(({ measure, of, times }) => ({
      measure,
      of,
      times,
    })),
    name,
  };
}
