"use client";

import type { JSX } from "react";

import { Plus } from "lucide-react";
import { startTransition, useState, useTransition } from "react";

import type { Summary } from "@/components/app/organisms/schedule-rows";
import type { IncomeKind, IncomeLine, IncomeLineValues } from "@/data/income";
import type { Plan } from "@/engine/projection";

import { saveIncomeLine } from "@/app/(app)/plan/actions";
import { Note } from "@/components/app/atoms/note";
import { MoneyField } from "@/components/app/molecules/money-field";
import {
  isSound,
  LineFields,
  optionsOf,
  spanOf,
} from "@/components/app/organisms/line-fields";
import { ScheduleRows } from "@/components/app/organisms/schedule-rows";
import { Button } from "@/components/kit/button";
import { Card, CardContent, CardHeader } from "@/components/kit/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/kit/dialog";
import { toast } from "@/components/kit/toast";
import { totalOf } from "@/data/income";
import { formatGbp } from "@/lib/money";
import { plan as planScreen, sectionNumeral } from "@/lib/nav";

// What the dialog holds while it is open: the line's values, which are
// flat already, with no last year for a line that runs to the end of the
// plan.
type Draft = IncomeLineValues;

// An open dialog: the draft as it is, the draft as it opened, which the
// uncontrolled fields take as their defaults, and the id of the line it
// edits, or null for a new one.
interface Entry {
  readonly draft: Draft;
  readonly id: null | number;
  readonly initial: Draft;
}

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
  const [entry, setEntry] = useState<Entry | null>(null);
  const [isSaving, startSaving] = useTransition();

  function amend(current: Entry, patch: Partial<Draft>): void {
    setEntry({ ...current, draft: { ...current.draft, ...patch } });
  }

  // The category choice: an employment line's parts are kept only while
  // it is one, and come back as the line opened with them when it is one
  // again, which is what the fields mount showing.
  function categorise(current: Entry, kind: IncomeKind): void {
    amend(current, {
      kind,
      ...(kind === "employment"
        ? { bonus: current.initial.bonus, rsu: current.initial.rsu }
        : { bonus: 0, rsu: 0 }),
    });
  }

  // The dialog opens only from a button, so the only change it can report
  // is a close: Cancel, Escape or a press outside.
  function dismiss(): void {
    setEntry(null);
  }

  // A row's pencil opens its line as it is, with its id so a save writes
  // back to it.
  function edit(line: IncomeLine): void {
    const { id, ...values } = line;
    open(values, id);
  }

  function open(draft: Draft, id: null | number): void {
    setEntry({ draft, id, initial: draft });
  }

  // The name is saved as typed less the space around it, which is what
  // the title shows and what save waited for. The dialog stays open with
  // its save held until the store answers, then closes; the close is a
  // transition of its own, since a state update after an await is not
  // part of the one it awaited in.
  function save(current: Entry): void {
    const values = { ...current.draft, name: current.draft.name.trim() };
    startSaving(async () => {
      const line = await saveIncomeLine(current.id, values);
      startTransition(() => {
        setEntry(null);
      });
      toast.add({
        description: `${line.name} · ${spanOf(line)}`,
        title:
          current.id === null ? "Income line added" : "Income line updated",
        type: "success",
      });
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <span className="label text-muted-foreground">
              {`Sect. ${sectionNumeral(planScreen)}.i`}
            </span>
            <h2 className="font-heading text-base font-medium">
              Income by year
            </h2>
          </div>
          <Button
            onClick={() => {
              open(blank(plan), null);
            }}
            size="sm"
          >
            <Plus aria-hidden />
            Add income line
          </Button>
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
      <Dialog onOpenChange={dismiss} open={entry !== null}>
        {entry !== null && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <span className="label text-brand">
                {entry.id === null ? "New income line" : "Edit income line"}
              </span>
              <DialogTitle>
                {entry.draft.name.trim() || "Untitled line"}
              </DialogTitle>
            </DialogHeader>
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
                <div className="grid grid-cols-3 gap-4">
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
                </div>
              )}
            </LineFields>
            <DialogFooter>
              <DialogClose render={<Button size="sm" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                disabled={isSaving || !isSound(entry.draft)}
                onClick={() => {
                  save(entry);
                }}
                size="sm"
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
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
