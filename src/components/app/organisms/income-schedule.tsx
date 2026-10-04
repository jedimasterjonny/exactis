"use client";

import type { JSX } from "react";

import { Plus } from "lucide-react";

import type { Summary } from "@/components/app/organisms/schedule-rows";
import type { Account } from "@/data/accounts";
import type { IncomeKind, IncomeLine, IncomeLineDraft } from "@/data/income";
import type { Milestone } from "@/data/milestones";
import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";
import type { Entry } from "@/hooks/use-editor";

import { removeIncomeLine, saveIncomeLine } from "@/actions/schedule";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { Note } from "@/components/app/atoms/note";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { SectionCard } from "@/components/app/molecules/section-card";
import { EmploymentFields } from "@/components/app/organisms/employment-fields";
import { LineFields } from "@/components/app/organisms/line-fields";
import { ScheduleRows } from "@/components/app/organisms/schedule-rows";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { isPension } from "@/data/accounts";
import { asPaid, isOpeningSound, totalOf } from "@/data/income";
import { markersOf } from "@/data/milestones";
import { retirementYear } from "@/data/plan";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { isSound, spanOf } from "@/lib/lines";
import { formatGbp, formatPercent } from "@/lib/money";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";
import { optionsOf } from "@/lib/options";

// What the dialog holds while it is open: the line's values, which are
// flat already, with no last year for a line that runs to the end of the
// plan, and the pension the save opens, if it opens one.
type Draft = IncomeLineDraft;

interface IncomeScheduleProps {
  readonly accounts: readonly Account[];
  readonly lines: readonly IncomeLine[];
  readonly milestones: readonly Milestone[];
  readonly owners: readonly Owner[];
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
// accounts the page hands down; a salary may open a pension of its own
// with the save, belonging to one of the owners the page hands down,
// so the save holds while the one it opens is unnamed or has no owner,
// as it holds while the line is unnamed. The dialog of a saved line
// offers a Delete, which is where a row is deleted from, as an account
// is from its dialog: it asks through the confirm dialog before the line
// goes, and nothing hangs on a line, so it goes alone. It holds while a
// save is on its way, since a deletion over a save in flight would race
// it. The lines are laid out
// by the milestones the page hands down: each row names the ones its
// line is tied to, and the dialog offers them for either end. The card
// takes a numeral of its own off the screen's, since the reference
// numbers each of the schedule's cards that way: the next after the
// milestones', and the expense schedule beneath it takes the one after.
export function IncomeSchedule({
  accounts,
  lines,
  milestones,
  owners,
  plan,
}: IncomeScheduleProps): JSX.Element {
  const markers = markersOf(milestones, plan);
  const { amend, dialogOf, dismiss, entry, open } = useEditor({
    describe: (line) => `${line.name} · ${spanOf(line)}`,
    noun: "Income line",
    save: saveIncomeLine,
  });
  const { ask, doomed, questionOf } = useRemover<IncomeLine>({
    describe: (line) => line.name,
    noun: "Income line",
    remove: removeIncomeLine,
  });
  const pensions = accounts.filter(isPension);

  // The category choice: an employment line's parts and its pension are
  // kept only while it is one, and come back as the line opened with
  // them when it is one again, which is what the fields mount showing.
  // A pension the line was to open goes with the category, since a
  // line opens one only while it is a salary, and no line opens with
  // one to come back to.
  function categorise(current: Entry<Draft>, kind: IncomeKind): void {
    const { initial } = current;
    amend(current, {
      kind,
      ...(kind === "employment"
        ? {
            bonus: initial.bonus,
            feeds: initial.feeds,
            opens: initial.opens,
            rsu: initial.rsu,
            sacrifice: initial.sacrifice,
          }
        : { bonus: 0, feeds: null, opens: null, rsu: 0, sacrifice: 0 }),
    });
  }

  // The Delete a saved line's dialog offers: the dialog closes first, so
  // the question stands alone and a cancel lands back on the screen, as
  // the ledger's does. A new line has
  // nothing yet to delete, and matches no line the schedule lists.
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
  // it. A saved line feeds its pension by id, so it opens none.
  function edit(line: IncomeLine): void {
    const { id, ...values } = line;
    open({ ...values, opens: null }, id);
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
            Add income line
          </Button>
        }
        label={subsectionLabel(planScreen, 2)}
        title="Income by year"
      >
        <CardContent>
          <ScheduleRows
            emptyDescription="Add a salary, a pension or a side line to see it scheduled here."
            emptyTitle="No income yet"
            lines={lines}
            milestones={markers}
            onEdit={edit}
            plan={plan}
            side="income"
            summarise={(line) => summarise(line, { pensions, plan })}
          />
        </CardContent>
      </SectionCard>
      <Note>
        Lines overlap freely: a step-up is a second line starting mid-way, not
        an edit to the first.
      </Note>
      {doomed !== null && (
        <ConfirmDialog {...questionOf(doomed)}>
          It cannot be brought back.
        </ConfirmDialog>
      )}
      {entry !== null && (
        <EditDialog
          {...dialogOf(entry)}
          canSave={isSound(entry.draft) && isOpeningSound(entry.draft)}
          isWide
          onDelete={deleteFrom(entry)}
          onDismiss={dismiss}
          title={entry.draft.name.trim() || "Untitled line"}
        >
          <LineFields
            amountLabel={
              entry.draft.kind === "employment" ? "Base salary" : "Amount"
            }
            draft={entry.draft}
            initial={entry.initial}
            kinds={kinds}
            milestones={markers}
            namePlaceholder="Salary, consulting, state pension…"
            onAmend={(patch) => {
              amend(entry, patch);
            }}
            onKindChange={(kind) => {
              categorise(entry, kind);
            }}
            paid={paidOf(entry.draft, plan)}
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
                owners={owners}
                pensions={pensions}
              />
            )}
          </LineFields>
        </EditDialog>
      )}
    </>
  );
}

// A new line: a salary of nothing a year from the plan's first year,
// growing with inflation and feeding no pension, listed or opened, as
// the reference's new line opens, and ending at retirement, since the
// engine stops a salary there whatever its own end says, so a salary
// that says so is drawn where it is paid. One opened after the owner
// has retired runs with the plan instead, as the reference's does,
// rather than opening on an end before its start.
function blank(plan: Plan): Draft {
  const retirement = retirementYear(plan);
  return {
    amount: 0,
    bonus: 0,
    cadence: "year",
    endsAfter: 0,
    endsAt: retirement > plan.from ? "retirement" : null,
    feeds: null,
    firstYear: plan.from,
    growth: "inflation",
    kind: "employment",
    lastMonth: null,
    lastYear: retirement > plan.from ? retirement - 1 : null,
    name: "",
    opens: null,
    rsu: 0,
    sacrifice: 0,
    startsAt: null,
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

// What the dialog says of a line stopped short of its end at
// retirement, as a salary or a profit is, and the line as it is paid,
// for the bar beneath; that it is never paid, for one starting once its
// owner has retired; and nothing for a line paid as it says.
function paidOf(
  draft: Draft,
  plan: Plan,
): undefined | { readonly line: Draft; readonly says: string } {
  const paid = asPaid(draft, plan);
  const retirement = retirementYear(plan);
  if (paid === draft) {
    return undefined;
  }
  return {
    line: paid,
    says:
      draft.firstYear < retirement
        ? `Paid to ${String(retirement - 1)}, since pay stops at Retirement whatever the end says.`
        : `Never paid, since pay stops at Retirement in ${String(retirement)}.`,
  };
}

// What the rows say of an income line: its kind's badge, plain since
// every kind of income is money coming in; what it pays, the parts
// summed and before any sacrifice; for a line paid in parts beyond its
// base or giving up a share of it, the parts written out beside the
// badge, so the split is seen without opening the line; and the line as
// it is paid, which for a salary or a profit stops at retirement.
function summarise(
  line: IncomeLine,
  {
    pensions,
    plan,
  }: { readonly pensions: readonly Account[]; readonly plan: Plan },
): Summary {
  return {
    badge: { label: kindLabels[line.kind], variant: "secondary" },
    ...(hasParts(line) && { detail: formatParts(line, pensions) }),
    paid: asPaid(line, plan),
    total: totalOf(line),
  };
}
