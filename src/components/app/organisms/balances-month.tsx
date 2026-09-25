"use client";

import type { JSX } from "react";

import { CalendarDays } from "lucide-react";
import { startTransition, useState, useTransition } from "react";

import type { Month } from "@/data/schedule";

import { saveBalancesMonth } from "@/actions/accounts";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { MonthField } from "@/components/app/molecules/month-field";
import { YearField } from "@/components/app/molecules/year-field";
import { Button } from "@/components/kit/button";
import { toast } from "@/components/kit/toast";
import { acceptedOf } from "@/lib/answer";
import { reasonOf } from "@/lib/errors";
import { monthName } from "@/lib/months";

interface BalancesMonthProps {
  readonly at: Month;
}

// The accounts screen's balances month: a button in its header opening
// a dialog on the month the household's balances are as of, which the
// plan starts in, picked as a month and a year, with the title saying
// which and a note that no balance moves with it. The dialog holds a
// draft, the month as it opened or as picked since, or nothing while it
// is closed, so the draft doubles as the dialog's open state, and
// nothing reaches the store until Save. Save holds while the month is
// on its way; the store's answer closes the dialog onto the screen
// re-read in the new month, and a toast; a store that refuses, as it
// does a month that has not begun, leaves the dialog open as it was and
// says why under a toast. The close is a transition of its own, since a
// state update after an await is not part of the one it awaited in.
export function BalancesMonth({ at }: BalancesMonthProps): JSX.Element {
  const [draft, setDraft] = useState<Month | null>(null);
  const [isSaving, startSaving] = useTransition();

  function save(month: Month): void {
    startSaving(async () => {
      try {
        const saved = acceptedOf(await saveBalancesMonth(month));
        startTransition(() => {
          setDraft(null);
        });
        toast.add({
          description: `Balances as of ${named(saved)}`,
          title: "Balances month updated",
          type: "success",
        });
      } catch (error: unknown) {
        toast.add({
          description: reasonOf(error),
          title: "Balances month not saved",
          type: "error",
        });
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => {
          setDraft(at);
        }}
        size="sm"
        variant="outline"
      >
        <CalendarDays aria-hidden />
        Balances month
      </Button>
      {draft !== null && (
        <EditDialog
          canSave={!isSaving}
          eyebrow="Balances month"
          onDismiss={() => {
            setDraft(null);
          }}
          onSave={() => {
            save(draft);
          }}
          title={`Balances as of ${named(draft)}`}
        >
          <FieldRow layout="pair">
            <MonthField
              label="Month"
              onValueChange={(month) => {
                setDraft({ ...draft, month });
              }}
              value={draft.month}
            />
            <YearField
              label="Year"
              onValueCommitted={(year) => {
                setDraft({ ...draft, year });
              }}
              value={draft.year}
            />
          </FieldRow>
          <Note>
            Every balance is taken as this month&apos;s, and none moves with it:
            save each account&apos;s balance for the month.
          </Note>
        </EditDialog>
      )}
    </>
  );
}

// A month as the title and the toast say it: its name in full and its
// year.
function named({ month, year }: Month): string {
  return `${monthName(month, "long")} ${String(year)}`;
}
