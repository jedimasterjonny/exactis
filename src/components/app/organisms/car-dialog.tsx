"use client";

import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { Agreement, CarDraft, CarValues } from "@/data/cars";
import type { Secured } from "@/data/secured";
import type { Entry } from "@/hooks/use-editor";
import type { LoanFigure, Stood } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { saveCar } from "@/actions/accounts";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { CarFields } from "@/components/app/organisms/car-fields";
import { carOf, clearsAfter, derive, isSound } from "@/data/cars";
import { useMountedEditor } from "@/hooks/use-editor";
import { stood, thirdOf } from "@/lib/figures";

interface CarDialogProps {
  readonly car: null | Secured;
  readonly onDismiss: () => void;
  readonly onSaved: () => void;
  readonly plan: PlanMonth;
}

// What the dialog holds while it is open: the car as the fields hold it,
// and the two of the finance's three figures that stand while the third
// is worked out from them. The two travel with the draft so an
// amendment moves both at once.
interface Draft extends CarDraft {
  readonly typed: Stood;
}

// A new car: on a PCP, since that is the case with the most to work out,
// worth nothing and owing nothing yet, over a term of four years at no
// rate, so the first two figures typed are taken as read and the payment
// follows from them until the payment is typed instead.
const blank: Draft = {
  agreement: "pcp",
  balance: 0,
  balloon: 0,
  depreciation: 0,
  name: "",
  payment: 0,
  rate: 0,
  term: 4,
  typed: ["rate", "term"],
  value: 0,
};

// The dialog a car is entered or edited in, which takes the car as the
// records it is and lets the store write them: the asset, and for a
// financed car the loan against it and its payments. It is open for as
// long as it is mounted, so the ledger renders it while it holds a car
// to open on, or a new one, and the entry mounts from that. The fields
// are uncontrolled but for the finance's figures, which the dialog shows
// by value. The save holds while the draft is not sound, or a rate could
// not be worked out; a term that could not is no bar, since finance the
// payment never clears is paid to the end of the plan and the store
// reads that off the figures it keeps. The plan's month is handed to
// the fields, which count the term's end from it. The editor hook holds
// the entry, the save and the toast, as it does for the account dialog;
// what is the car's own is the figure worked out on each amendment and
// the values the save sends, which are the draft less the figure typed
// over. The caller is told when the car has been saved, so the screen
// can close the dialog and bring the assets forward.
export function CarDialog({
  car,
  onDismiss,
  onSaved,
  plan,
}: CarDialogProps): JSX.Element | null {
  // The store answers with the car's own account, which the caller is
  // not told, so the answer's type is stated rather than inferred.
  const { amend, entry, isSaving, save } = useMountedEditor<Draft, Account>({
    describe: (saved, values) => described(saved.name, values.agreement),
    noun: "Car",
    onSaved,
    opening: openingOf(car),
    save: async (id, draft) => saveCar(id, workedOut(draft).values),
  });
  if (entry === null) {
    return null;
  }
  const { canSave, clears, figure, values, worked } = workedOut(entry.draft);
  return (
    <EditDialog
      canSave={!isSaving && canSave}
      eyebrow={entry.id === null ? "New car" : "Edit car"}
      isWide
      onDismiss={onDismiss}
      onSave={() => {
        save(entry);
      }}
      title={values.name || "Untitled car"}
    >
      <CarFields
        clears={clears}
        draft={entry.draft}
        figure={figure}
        initial={entry.initial}
        onAmend={(patch) => {
          amend(entry, { ...patch, typed: stood(entry.draft.typed, patch) });
        }}
        plan={plan}
        worked={worked}
      />
    </EditDialog>
  );
}

// What the toast says was saved: the car alone when it is owned
// outright, else with the agreement it is on and the payments.
function described(name: string, agreement: Agreement): string {
  switch (agreement) {
    case "loan":
      return `${name} · with its loan and payments`;
    case "outright":
      return name;
    case "pcp":
      return `${name} · with its PCP and payments`;
  }
}

// The entry the dialog mounts open on: the car as its records hold it,
// under its asset's id so a save writes back to it, with the term worked
// out from them when it is financed, since the store keeps the balance,
// the balloon, the rate and the payment and reads the term off those,
// and the blank draft's term standing by otherwise; or the blank draft
// under no id for a new one.
function openingOf(car: null | Secured): Entry<Draft> {
  if (car === null) {
    return { draft: blank, id: null, initial: blank };
  }
  const typed: Stood =
    car.loan === null ? ["rate", "term"] : ["payment", "rate"];
  const draft: Draft = { ...carOf(car), term: blank.term, typed };
  return { draft, id: car.asset.id, initial: draft };
}

// The car the draft would save: the name as typed less the space around
// it, which is what the title shows; nothing owed, paid or charged and
// no balloon for a car owned outright, and no balloon on a loan,
// whatever the hidden fields hold; and the figure worked out in place of
// the draft's own where there is one to put there. A worked-out term
// goes nowhere, since the store reads it off the other figures, and a
// figure that could not be worked out leaves the draft's, which the
// held save never sends.
function valuesOf(
  draft: CarDraft,
  worked: LoanFigure,
  figure: null | number,
): CarValues {
  const values: CarValues = {
    agreement: draft.agreement,
    balance: draft.balance,
    balloon: draft.agreement === "pcp" ? draft.balloon : 0,
    depreciation: draft.depreciation,
    name: draft.name.trim(),
    payment: draft.payment,
    rate: draft.rate,
    value: draft.value,
  };
  if (values.agreement === "outright") {
    return { ...values, balance: 0, payment: 0, rate: 0 };
  }
  if (worked === "term" || figure === null) {
    return values;
  }
  return worked === "payment"
    ? { ...values, payment: figure }
    : { ...values, rate: figure };
}

// What the dialog shows of a draft: which figure is worked out, what it
// came to, the years the payments run in all once the balloon is
// refinanced, the car the draft would save, and whether it can be: a
// sound car, whose rate was found if the rate is what is worked out and
// the car is financed. A term that could not be worked out is no bar,
// since the store reads the open end off the figures it keeps.
function workedOut(draft: Draft): {
  readonly canSave: boolean;
  readonly clears: null | number;
  readonly figure: null | number;
  readonly values: CarValues;
  readonly worked: LoanFigure;
} {
  const worked = thirdOf(...draft.typed);
  const figure = derive(draft, worked);
  const values = valuesOf(draft, worked, figure);
  return {
    canSave:
      isSound(values) &&
      (values.agreement === "outright" || worked !== "rate" || figure !== null),
    clears: clearsAfter(values),
    figure,
    values,
    worked,
  };
}
