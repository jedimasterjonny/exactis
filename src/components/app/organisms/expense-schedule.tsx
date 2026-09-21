"use client";

import type { JSX } from "react";

import { Plus } from "lucide-react";

import type { Summary } from "@/components/app/organisms/schedule-rows";
import type {
  ExpenseKind,
  ExpenseLine,
  ExpenseLineValues,
} from "@/data/expenses";
import type { Plan } from "@/data/plan";

import { saveExpenseLine } from "@/app/(app)/plan/actions";
import { Note } from "@/components/app/atoms/note";
import { SectionHeader } from "@/components/app/atoms/section-header";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { LineFields } from "@/components/app/organisms/line-fields";
import { ScheduleRows } from "@/components/app/organisms/schedule-rows";
import { Button } from "@/components/kit/button";
import { Card, CardContent, CardHeader } from "@/components/kit/card";
import { useEditor } from "@/hooks/use-editor";
import { isSound, spanOf } from "@/lib/lines";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";
import { optionsOf } from "@/lib/options";

// What the dialog holds while it is open: the line's values, which are
// flat already, with no last year for a line that runs to the end of the
// plan.
type Draft = ExpenseLineValues;

interface ExpenseScheduleProps {
  readonly lines: readonly ExpenseLine[];
  readonly plan: Plan;
}

// What each kind is called, on the badge and in the dialog's choice.
const kindLabels: Record<ExpenseKind, string> = {
  core: "Core",
  debt: "Debt",
  other: "Other",
  "time-bound": "Time-bound",
};

// The kinds in the order the reference's dialog offers them.
const kinds = optionsOf(kindLabels, ["core", "time-bound", "debt", "other"]);

// The badge each kind takes, as the reference tones them: a time-bound
// cost is marked for the end it has, a debt takes the loss tone its
// balance takes everywhere else, and the rest are plain.
const tones: Record<ExpenseKind, Summary["badge"]["variant"]> = {
  core: "secondary",
  debt: "destructive",
  other: "secondary",
  "time-bound": "caution",
};

// The plan screen's expense schedule and its dialog, beneath the income
// schedule and built as it is: the rows are the store's, handed down by
// the page, a save goes to the store and comes back with the page
// re-read, the entry doubles as the dialog's open state, and the fields
// are the ones every line's dialog takes, with nothing to add beneath
// them, since an expense is paid in no parts. The card takes the next
// numeral off the screen's after the income card's.
export function ExpenseSchedule({
  lines,
  plan,
}: ExpenseScheduleProps): JSX.Element {
  const { amend, dismiss, entry, isSaving, open, save } = useEditor({
    describe: (line) => `${line.name} · ${spanOf(line)}`,
    noun: "Expense line",
    save: saveExpenseLine,
  });

  // A row's pencil opens its line as it is, with its id so a save writes
  // back to it.
  function edit(line: ExpenseLine): void {
    const { id, ...values } = line;
    open(values, id);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <SectionHeader
            actions={
              <Button
                onClick={() => {
                  open(blank(plan), null);
                }}
                size="sm"
              >
                <Plus aria-hidden />
                Add expense line
              </Button>
            }
            label={subsectionLabel(planScreen, 2)}
            title="Expenses by year"
          />
        </CardHeader>
        <CardContent>
          <ScheduleRows
            emptyDescription="Add the household's spending, childcare or a loan's payments to see them scheduled here."
            emptyTitle="No expenses yet"
            lines={lines}
            onEdit={edit}
            plan={plan}
            side="expense"
            summarise={summarise}
          />
        </CardContent>
      </Card>
      <Note>
        An open-ended line runs to the end of the plan: retirement living starts
        where household spending stops, as a line of its own.
      </Note>
      {entry !== null && (
        <EditDialog
          canSave={!isSaving && isSound(entry.draft)}
          eyebrow={entry.id === null ? "New expense line" : "Edit expense line"}
          isWide
          onDismiss={dismiss}
          onSave={() => {
            save(entry);
          }}
          title={entry.draft.name.trim() || "Untitled line"}
        >
          <LineFields
            amountLabel="Amount"
            draft={entry.draft}
            initial={entry.initial}
            kinds={kinds}
            namePlaceholder="Childcare, mortgage, care…"
            onAmend={(patch) => {
              amend(entry, patch);
            }}
            onKindChange={(kind) => {
              amend(entry, { kind });
            }}
            plan={plan}
            side="expense"
          />
        </EditDialog>
      )}
    </>
  );
}

// A new line: a time-bound cost of nothing a month, running ten years
// from the plan's first, growing with inflation, as the reference's new
// expense line opens.
function blank(plan: Plan): Draft {
  return {
    amount: 0,
    cadence: "month",
    firstYear: plan.from,
    growth: "inflation",
    kind: "time-bound",
    lastMonth: null,
    lastYear: plan.from + 10,
    name: "",
  };
}

// What the rows say of an expense line: its kind's badge in the kind's
// tone, and what it pays, which is its amount, since an expense is paid
// in no parts. A line that is a loan's payments is locked, since the
// dialog of the asset the loan is on writes it from the loan and would
// write over an edit made here.
function summarise(line: ExpenseLine): Summary {
  return {
    badge: { label: kindLabels[line.kind], variant: tones[line.kind] },
    ...(line.pays !== undefined && {
      lock: "Edited with its asset on the accounts screen",
    }),
    total: line.amount,
  };
}
