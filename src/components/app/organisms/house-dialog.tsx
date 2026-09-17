"use client";

import type { JSX } from "react";

import { House } from "lucide-react";
import { startTransition, useState, useTransition } from "react";

import type { HouseDraft, HouseValues, MortgageFigure } from "@/data/houses";

import { saveHouse } from "@/app/(app)/accounts/actions";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { HouseFields } from "@/components/app/organisms/house-fields";
import { Button } from "@/components/kit/button";
import { toast } from "@/components/kit/toast";
import { derive, isSound } from "@/data/houses";

// An open dialog: the draft as it is, the draft as it opened, which the
// uncontrolled fields take as their defaults, and the two of the mortgage's three
// figures typed last, the latest first, which stand while the third is
// worked out from them. A figure typed moves to the front and pushes the
// other out, so the one worked out is always the one left alone longest.
interface Entry {
  readonly draft: HouseDraft;
  readonly initial: HouseDraft;
  readonly typed: readonly [MortgageFigure, MortgageFigure];
}

interface HouseDialogProps {
  readonly onSaved: () => void;
}

// A new house: mortgaged, since that is the case with something to work
// out, worth nothing and owing nothing yet, over a term of twenty-five
// years at no rate, so the first two figures typed are taken as read and
// the payment follows from them until the payment is typed instead.
const draft: HouseDraft = {
  balance: 0,
  growth: 0,
  name: "",
  payment: 0,
  rate: 0,
  status: "mortgaged",
  term: 25,
  value: 0,
};

const blank: Entry = { draft, initial: draft, typed: ["rate", "term"] };

// The three figures, so a patch can be asked which it carries.
const figures: readonly MortgageFigure[] = ["payment", "rate", "term"];

// The button that adds a house and the dialog it opens, which enters the
// house as the records it is and lets the store write them: the asset,
// and for a mortgaged house the loan against it and its payments. The
// entry doubles as the dialog's open state, as the ledger's does, and
// the fields are uncontrolled but for the one figure worked out, which
// the dialog shows by value. The save holds while the draft is not
// sound, or a rate could not be worked out; a term that could not is
// no bar, since a loan the payment never clears is paid to the end of
// the plan and the store reads that off the figures it keeps. The caller
// is told when a house has been saved, so the screen can bring the
// assets forward.
export function HouseDialog({ onSaved }: HouseDialogProps): JSX.Element {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [isSaving, startSaving] = useTransition();

  // A patch to one of the three figures makes it one of the two that
  // stand; any other patch leaves them as they are.
  function amend(current: Entry, patch: Partial<HouseDraft>): void {
    const figure = figures.find((candidate) => candidate in patch);
    setEntry({
      ...current,
      draft: { ...current.draft, ...patch },
      typed:
        figure === undefined ? current.typed : stood(current.typed, figure),
    });
  }

  function dismiss(): void {
    setEntry(null);
  }

  // The dialog stays open with its save held until the store answers,
  // then closes and tells the caller; the close is a transition of its
  // own, since a state update after an await is not part of the one it
  // awaited in.
  function save(values: HouseValues): void {
    startSaving(async () => {
      const account = await saveHouse(values);
      startTransition(() => {
        setEntry(null);
        onSaved();
      });
      toast.add({
        description:
          values.status === "mortgaged"
            ? `${account.name} · mortgage and payments added`
            : account.name,
        title: "House added",
        type: "success",
      });
    });
  }

  const open = entry === null ? null : { entry, ...workedOut(entry) };

  return (
    <>
      <Button
        onClick={() => {
          setEntry(blank);
        }}
        size="sm"
        variant="outline"
      >
        <House aria-hidden />
        Add house
      </Button>
      {open !== null && (
        <EditDialog
          canSave={!isSaving && open.canSave}
          eyebrow="New house"
          isWide
          onDismiss={dismiss}
          onSave={() => {
            save(open.values);
          }}
          title={open.values.name || "Untitled house"}
        >
          <HouseFields
            draft={open.entry.draft}
            figure={open.figure}
            initial={open.entry.initial}
            onAmend={(patch) => {
              amend(open.entry, patch);
            }}
            worked={open.worked}
          />
        </EditDialog>
      )}
    </>
  );
}

// The two figures that stand once one is typed: the typed one first, and
// whichever of the two that stood is not it.
function stood(
  typed: readonly [MortgageFigure, MortgageFigure],
  figure: MortgageFigure,
): readonly [MortgageFigure, MortgageFigure] {
  const [first, second] = typed;
  return [figure, first === figure ? second : first];
}

// The figure the two given leave out.
function thirdOf(one: MortgageFigure, other: MortgageFigure): MortgageFigure {
  switch (one) {
    case "payment":
      return other === "rate" ? "term" : "rate";
    case "rate":
      return other === "payment" ? "term" : "payment";
    case "term":
      return other === "payment" ? "rate" : "payment";
  }
}

// The house the draft would save: the name as typed less the space
// around it, which is what the title shows; nothing owed, paid or
// charged for a house owned outright, whatever the hidden fields hold;
// and the figure worked out in place of the draft's own where there is
// one to put there. A worked-out term goes nowhere, since the store
// reads it off the other two, and a figure that could not be worked out
// leaves the draft's, which the held save never sends.
function valuesOf(
  draft: HouseDraft,
  worked: MortgageFigure,
  figure: null | number,
): HouseValues {
  const values: HouseValues = {
    balance: draft.balance,
    growth: draft.growth,
    name: draft.name.trim(),
    payment: draft.payment,
    rate: draft.rate,
    status: draft.status,
    value: draft.value,
  };
  if (values.status === "outright") {
    return { ...values, balance: 0, payment: 0, rate: 0 };
  }
  if (worked === "term" || figure === null) {
    return values;
  }
  return worked === "payment"
    ? { ...values, payment: figure }
    : { ...values, rate: figure };
}

// What the dialog shows of an entry: which figure is worked out, what it
// came to, the house the draft would save, and whether it can be: a
// sound house, whose rate was found if the rate is what is worked out
// and the house is mortgaged. A term that could not be worked out is no
// bar, since the store reads the open end off the figures it keeps.
function workedOut(entry: Entry): {
  readonly canSave: boolean;
  readonly figure: null | number;
  readonly values: HouseValues;
  readonly worked: MortgageFigure;
} {
  const worked = thirdOf(...entry.typed);
  const figure = derive(entry.draft, worked);
  const values = valuesOf(entry.draft, worked, figure);
  return {
    canSave:
      isSound(values) &&
      (values.status === "outright" || worked !== "rate" || figure !== null),
    figure,
    values,
    worked,
  };
}
