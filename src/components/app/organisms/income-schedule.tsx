"use client";

import type { JSX } from "react";

import { Plus } from "lucide-react";

import type { Summary } from "@/components/app/organisms/schedule-rows";
import type { IncomeKind, IncomeLine, IncomeLineValues } from "@/data/income";
import type { Plan } from "@/engine/projection";
import type { Entry } from "@/hooks/use-editor";

import { saveIncomeLine } from "@/app/(app)/plan/actions";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { SectionHeader } from "@/components/app/atoms/section-header";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { MoneyField } from "@/components/app/molecules/money-field";
import { LineFields } from "@/components/app/organisms/line-fields";
import { ScheduleRows } from "@/components/app/organisms/schedule-rows";
import { Button } from "@/components/kit/button";
import { Card, CardContent, CardHeader } from "@/components/kit/card";
import { totalOf } from "@/data/income";
import { useEditor } from "@/hooks/use-editor";
import { isSound, spanOf } from "@/lib/lines";
import { formatGbp } from "@/lib/money";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";
import { optionsOf } from "@/lib/options";

// What the dialog holds while it is open: the line's values, which are
// flat already, with no last year for a line that runs to the end of the
// plan.
type Draft = IncomeLineValues;

interface IncomeScheduleProps {
  readonly lines: readonly IncomeLine[];
  readonly plan: Plan;
}

// What each kind is called, on the badge and in the dialog's choice.
const kindLabels: Record<IncomeKind, string> = {
  employment: "Employment",
  other: "Other",
  pension: "Pension",
  "self-employment": "Self-employment",
};

// The kinds in the order the reference's dialog offers them.
const kinds = optionsOf(kindLabels, [
  "employment",
  "self-employment",
  "pension",
  "other",
]);

// The plan screen's income schedule and its dialog, which enters a new
// line from the card's button or edits one from its row. The rows are the
// store's, handed down by the page, and a save goes to the store and
// comes back with the page re-read, so the card reflects it without the
// schedule holding rows of its own. The entry doubles as the dialog's
// open state, as the ledger's does. The fields are the ones every line's
// dialog takes, mounted fresh with the entry's opening values each time
// the dialog opens, and the draft mirrors what they report. An
// employment line's amount is its base salary, with its bonus and RSUs
// on a row of their own that only an employment line shows. The card
// takes a numeral of its own off the screen's, since the reference
// numbers each of the schedule's cards that way, and the expense
// schedule beneath it takes the next.
export function IncomeSchedule({
  lines,
  plan,
}: IncomeScheduleProps): JSX.Element {
  const { amend, dismiss, entry, isSaving, open, save } = useEditor({
    describe: (line) => `${line.name} · ${spanOf(line)}`,
    noun: "Income line",
    save: saveIncomeLine,
  });

  // The category choice: an employment line's parts are kept only while
  // it is one, and come back as the line opened with them when it is one
  // again, which is what the fields mount showing.
  function categorise(current: Entry<Draft>, kind: IncomeKind): void {
    amend(current, {
      kind,
      ...(kind === "employment"
        ? { bonus: current.initial.bonus, rsu: current.initial.rsu }
        : { bonus: 0, rsu: 0 }),
    });
  }

  // A row's pencil opens its line as it is, with its id so a save writes
  // back to it.
  function edit(line: IncomeLine): void {
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
                Add income line
              </Button>
            }
            label={subsectionLabel(planScreen, 1)}
            title="Income by year"
          />
        </CardHeader>
        <CardContent>
          <ScheduleRows
            emptyDescription="Add a salary, a pension or a side line to see it scheduled here."
            emptyTitle="No income yet"
            lines={lines}
            onEdit={edit}
            plan={plan}
            side="income"
            summarise={summarise}
          />
        </CardContent>
      </Card>
      <Note>
        Lines overlap freely: a step-up is a second line starting mid-way, not
        an edit to the first.
      </Note>
      {entry !== null && (
        <EditDialog
          canSave={!isSaving && isSound(entry.draft)}
          eyebrow={entry.id === null ? "New income line" : "Edit income line"}
          isWide
          onDismiss={dismiss}
          onSave={() => {
            save(entry);
          }}
          title={entry.draft.name.trim() || "Untitled line"}
        >
          <LineFields
            amountLabel={
              entry.draft.kind === "employment" ? "Base salary" : "Amount"
            }
            draft={entry.draft}
            initial={entry.initial}
            kinds={kinds}
            namePlaceholder="Salary, consulting, state pension…"
            onAmend={(patch) => {
              amend(entry, patch);
            }}
            onKindChange={(kind) => {
              categorise(entry, kind);
            }}
            plan={plan}
            side="income"
          >
            {entry.draft.kind === "employment" && (
              <FieldRow layout="triple">
                <MoneyField
                  defaultValue={entry.initial.bonus}
                  hint="At the salary's cadence; nothing for none"
                  label="Bonus"
                  onValueCommitted={(bonus) => {
                    amend(entry, { bonus });
                  }}
                />
                <MoneyField
                  defaultValue={entry.initial.rsu}
                  hint="Vesting at the salary's cadence"
                  label="RSUs"
                  onValueCommitted={(rsu) => {
                    amend(entry, { rsu });
                  }}
                />
              </FieldRow>
            )}
          </LineFields>
        </EditDialog>
      )}
    </>
  );
}

// A new line: nothing a year from the plan's first year to its end,
// growing with inflation, as the reference's new line opens.
function blank(plan: Plan): Draft {
  return {
    amount: 0,
    bonus: 0,
    cadence: "year",
    firstYear: plan.from,
    growth: "inflation",
    kind: "employment",
    lastYear: null,
    name: "",
    rsu: 0,
  };
}

// An employment line's parts, each named, leaving out one it has none of.
function formatParts(line: IncomeLine): string {
  return [
    `${formatGbp(line.amount)} base`,
    ...(line.bonus > 0 ? [`${formatGbp(line.bonus)} bonus`] : []),
    ...(line.rsu > 0 ? [`${formatGbp(line.rsu)} RSUs`] : []),
  ].join(" · ");
}

// Whether a line is paid in parts beyond its base, which only an
// employment line with a bonus or RSUs is.
function hasParts(line: IncomeLine): boolean {
  return line.bonus > 0 || line.rsu > 0;
}

// What the rows say of an income line: its kind's badge, plain since
// every kind of income is money coming in; what it pays, the parts
// summed; and, for a line paid in parts beyond its base, the parts
// written out beside the badge, so the split is seen without opening
// the line.
function summarise(line: IncomeLine): Summary {
  return {
    badge: { label: kindLabels[line.kind], variant: "secondary" },
    ...(hasParts(line) && { detail: formatParts(line) }),
    total: totalOf(line),
  };
}
