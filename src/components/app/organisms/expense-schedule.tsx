"use client";

import type { JSX } from "react";

import { Plus } from "lucide-react";

import type { Summary } from "@/components/app/organisms/schedule-rows";
import type { ExpenseLine } from "@/data/expenses";
import type { Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { LineValues } from "@/data/schedule";
import type { Entry } from "@/hooks/use-editor";

import { removeExpenseLine, saveExpenseLine } from "@/actions/schedule";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { SectionCard } from "@/components/app/molecules/section-card";
import { LineFields } from "@/components/app/organisms/line-fields";
import { ScheduleRows } from "@/components/app/organisms/schedule-rows";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { markersOf } from "@/data/milestones";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { isSound, spanOf } from "@/lib/lines";
import {
  accountsAndAssets,
  plan as planScreen,
  subsectionLabel,
} from "@/lib/nav";

// What the dialog holds while it is open: the line's values, which are
// flat already, with no last year for a line that runs to the end of the
// plan.
type Draft = LineValues;

interface ExpenseScheduleProps {
  readonly lines: readonly ExpenseLine[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
}

// The plan screen's expense schedule and its dialog, beneath the income
// schedule and built as it is, its caption saying what it holds and how
// a line is written: the rows are the store's, handed down by
// the page, a save goes to the store and comes back with the page
// re-read, the entry doubles as the dialog's open state, and the fields
// are the ones every line's dialog takes, with no category, since what
// the money is for is the line's name to say, and nothing to add beneath
// them, since an expense is paid in no parts. The dialog of a saved line
// offers a Delete that asks through the confirm dialog before the line
// goes, as the income schedule's does, and holds while a save is on its
// way. Its lines are laid out by the milestones the page hands down, as
// the income schedule's are. The card takes the next numeral off the
// screen's after the income card's.
export function ExpenseSchedule({
  lines,
  milestones,
  plan,
}: ExpenseScheduleProps): JSX.Element {
  const markers = markersOf(milestones, plan);
  const { amend, dialogOf, dismiss, entry, open } = useEditor({
    describe: (line) => `${line.name} · ${spanOf(line)}`,
    noun: "Expense line",
    save: saveExpenseLine,
  });
  const { ask, doomed, questionOf } = useRemover<ExpenseLine>({
    describe: (line) => line.name,
    noun: "Expense line",
    remove: removeExpenseLine,
  });

  // The Delete a saved line's dialog offers, which closes the dialog
  // first, so the question stands alone and a cancel lands back on the
  // screen. A new line has nothing yet to delete, and matches no line
  // the schedule lists.
  function deleteFrom(current: Entry<Draft>): (() => void) | undefined {
    const line = lines.find(({ id }) => id === current.id);
    return line === undefined
      ? undefined
      : (): void => {
          dismiss();
          ask(line);
        };
  }

  // A row opens its line as it is, with its id so a save writes back to
  // it.
  function edit(line: ExpenseLine): void {
    const { id, ...values } = line;
    open(values, id);
  }

  return (
    <>
      <SectionCard
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
        caption="Spending and loan payments, each over the years it is paid. A line with no last year runs to the end of the plan, and spending that changes at a milestone is two lines, one ending there and one starting. A loan's payments are set with its asset on Accounts & assets."
        label={subsectionLabel(planScreen, 3)}
        title="What goes out"
      >
        <CardContent>
          <ScheduleRows
            emptyDescription="Add the household's spending, childcare or a loan's payments to see them scheduled here."
            emptyTitle="No expenses yet"
            lines={lines}
            milestones={markers}
            onEdit={edit}
            plan={plan}
            side="expense"
            summarise={summarise}
          />
        </CardContent>
      </SectionCard>
      {doomed !== null && (
        <ConfirmDialog {...questionOf(doomed)}>
          It cannot be brought back.
        </ConfirmDialog>
      )}
      {entry !== null && (
        <EditDialog
          {...dialogOf(entry)}
          canSave={isSound(entry.draft)}
          isWide
          onDelete={deleteFrom(entry)}
          onDismiss={dismiss}
          title={entry.draft.name.trim() || "Untitled line"}
        >
          <LineFields
            amountLabel="Amount"
            draft={entry.draft}
            initial={entry.initial}
            milestones={markers}
            namePlaceholder="Childcare, mortgage, care…"
            onAmend={(patch) => {
              amend(entry, patch);
            }}
            plan={plan}
            side="expense"
          />
        </EditDialog>
      )}
    </>
  );
}

// A new line: a cost of nothing a month, running ten years from the
// plan's first, growing with inflation and tied to no milestone, as the
// reference's new expense line opens.
function blank(plan: Plan): Draft {
  return {
    amount: 0,
    cadence: "month",
    endsAfter: 0,
    endsAt: null,
    firstYear: plan.from,
    growth: "inflation",
    lastMonth: null,
    lastYear: plan.from + 10,
    name: "",
    startsAt: null,
  };
}

// What the rows say of an expense line: what it pays, which is its
// amount, since an expense is paid in no parts. A line that is a loan's
// payments says so on its badge, its bar drawn in the debt's red, and
// is locked, its name linking to the accounts screen, since the dialog
// of the
// asset the loan is on writes it from the loan and would write over an
// edit made here; any other line has no badge, its name saying what it
// is for.
function summarise(line: ExpenseLine): Summary {
  return line.pays === undefined
    ? { total: line.amount }
    : {
        badge: { label: "Loan", variant: "secondary" },
        isLoan: true,
        lock: {
          at: accountsAndAssets.href,
          reason: `Set with its asset on ${accountsAndAssets.label}`,
        },
        total: line.amount,
      };
}
