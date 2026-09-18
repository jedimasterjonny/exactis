"use client";

import type { JSX } from "react";

import { Plus } from "lucide-react";

import type { Summary } from "@/components/app/organisms/schedule-rows";
import type { Account } from "@/data/accounts";
import type { IncomeKind, IncomeLine, IncomeLineValues } from "@/data/income";
import type { Plan } from "@/engine/projection";
import type { Entry } from "@/hooks/use-editor";

import { removeIncomeLine, saveIncomeLine } from "@/app/(app)/plan/actions";
import { Note } from "@/components/app/atoms/note";
import { SectionHeader } from "@/components/app/atoms/section-header";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { EmploymentFields } from "@/components/app/organisms/employment-fields";
import { LineFields } from "@/components/app/organisms/line-fields";
import { ScheduleRows } from "@/components/app/organisms/schedule-rows";
import { Button } from "@/components/kit/button";
import { Card, CardContent, CardHeader } from "@/components/kit/card";
import { isPension } from "@/data/accounts";
import { totalOf } from "@/data/income";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { isSound, spanOf } from "@/lib/lines";
import { formatGbp, formatPercent } from "@/lib/money";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";
import { optionsOf } from "@/lib/options";

// What the dialog holds while it is open: the line's values, which are
// flat already, with no last year for a line that runs to the end of the
// plan.
type Draft = IncomeLineValues;

interface IncomeScheduleProps {
  readonly accounts: readonly Account[];
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
// employment line's amount is its base salary, and the fields only it
// takes sit in the slot beneath them, shown the pensions among the
// accounts the page hands down. A row's bin asks through the confirm
// dialog before the line goes, as the ledger's does; nothing hangs on a
// line, so it goes alone. The card takes a numeral of its own off the
// screen's, since the reference numbers each of the schedule's cards
// that way, and the expense schedule beneath it takes the next.
export function IncomeSchedule({
  accounts,
  lines,
  plan,
}: IncomeScheduleProps): JSX.Element {
  const { amend, dismiss, entry, isSaving, open, save } = useEditor({
    describe: (line) => `${line.name} · ${spanOf(line)}`,
    noun: "Income line",
    save: saveIncomeLine,
  });
  const { ask, cancel, confirm, doomed, isRemoving } = useRemover<IncomeLine>({
    describe: (line) => line.name,
    noun: "Income line",
    remove: removeIncomeLine,
  });
  const pensions = accounts.filter(isPension);

  // The category choice: an employment line's parts and its pension are
  // kept only while it is one, and come back as the line opened with
  // them when it is one again, which is what the fields mount showing.
  function categorise(current: Entry<Draft>, kind: IncomeKind): void {
    const { initial } = current;
    amend(current, {
      kind,
      ...(kind === "employment"
        ? {
            bonus: initial.bonus,
            feeds: initial.feeds,
            rsu: initial.rsu,
            sacrifice: initial.sacrifice,
          }
        : { bonus: 0, feeds: null, rsu: 0, sacrifice: 0 }),
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
            onDelete={ask}
            onEdit={edit}
            plan={plan}
            side="income"
            summarise={(line) => summarise(line, pensions)}
          />
        </CardContent>
      </Card>
      <Note>
        Lines overlap freely: a step-up is a second line starting mid-way, not
        an edit to the first.
      </Note>
      {doomed !== null && (
        <ConfirmDialog
          isBusy={isRemoving}
          onCancel={cancel}
          onConfirm={() => {
            confirm(doomed);
          }}
          title={`Delete ${doomed.name}?`}
        >
          It cannot be brought back.
        </ConfirmDialog>
      )}
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
              <EmploymentFields
                draft={entry.draft}
                initial={entry.initial}
                onAmend={(patch) => {
                  amend(entry, patch);
                }}
                pensions={pensions}
              />
            )}
          </LineFields>
        </EditDialog>
      )}
    </>
  );
}

// A new line: nothing a year from the plan's first year to its end,
// growing with inflation and feeding no pension, as the reference's new
// line opens.
function blank(plan: Plan): Draft {
  return {
    amount: 0,
    bonus: 0,
    cadence: "year",
    feeds: null,
    firstYear: plan.from,
    growth: "inflation",
    kind: "employment",
    lastMonth: null,
    lastYear: null,
    name: "",
    rsu: 0,
    sacrifice: 0,
  };
}

// An employment line's parts, each named, leaving out one it has none
// of, and the share of the base it sacrifices into the pension it
// feeds, named, when it feeds one among the pensions.
function formatParts(line: IncomeLine, pensions: readonly Account[]): string {
  const pension = pensions.find(({ id }) => id === line.feeds);
  return [
    `${formatGbp(line.amount)} base`,
    ...(line.bonus > 0 ? [`${formatGbp(line.bonus)} bonus`] : []),
    ...(line.rsu > 0 ? [`${formatGbp(line.rsu)} RSUs`] : []),
    ...(pension !== undefined && line.sacrifice > 0
      ? [`${formatPercent(line.sacrifice)} of the base into ${pension.name}`]
      : []),
  ].join(" · ");
}

// Whether a line is paid in parts beyond its base, which only an
// employment line with a bonus or RSUs is, or gives up a share of it.
function hasParts(line: IncomeLine): boolean {
  return line.bonus > 0 || line.rsu > 0 || line.sacrifice > 0;
}

// What the rows say of an income line: its kind's badge, plain since
// every kind of income is money coming in; what it pays, the parts
// summed and before any sacrifice; and, for a line paid in parts beyond
// its base or giving up a share of it, the parts written out beside the
// badge, so the split is seen without opening the line.
function summarise(line: IncomeLine, pensions: readonly Account[]): Summary {
  return {
    badge: { label: kindLabels[line.kind], variant: "secondary" },
    ...(hasParts(line) && { detail: formatParts(line, pensions) }),
    total: totalOf(line),
  };
}
