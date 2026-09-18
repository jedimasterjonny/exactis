"use client";

import type { JSX } from "react";

import { startTransition, useState, useTransition } from "react";

import type {
  Agreement,
  Car,
  CarDraft,
  CarValues,
  FinanceFigure,
} from "@/data/cars";

import { saveCar } from "@/app/(app)/accounts/actions";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { CarFields } from "@/components/app/organisms/car-fields";
import { toast } from "@/components/kit/toast";
import { carOf, clearsAfter, derive, isSound } from "@/data/cars";
import { reasonOf } from "@/lib/errors";

interface CarDialogProps {
  readonly car: Car | null;
  readonly onDismiss: () => void;
  readonly onSaved: () => void;
}

// An open dialog: the draft as it is, the draft as it opened, which the
// uncontrolled fields take as their defaults, and the two of the
// finance's three figures typed last, the latest first, which stand
// while the third is worked out from them. A figure typed moves to the
// front and pushes the other out, so the one worked out is always the
// one left alone longest.
interface Entry {
  readonly draft: CarDraft;
  readonly initial: CarDraft;
  readonly typed: readonly [FinanceFigure, FinanceFigure];
}

// A new car: on a PCP, since that is the case with the most to work out,
// worth nothing and owing nothing yet, over a term of four years at no
// rate, so the first two figures typed are taken as read and the payment
// follows from them until the payment is typed instead.
const draft: CarDraft = {
  agreement: "pcp",
  balance: 0,
  balloon: 0,
  depreciation: 0,
  name: "",
  payment: 0,
  rate: 0,
  term: 4,
  value: 0,
};

const blank: Entry = { draft, initial: draft, typed: ["rate", "term"] };

// The three figures, so a patch can be asked which it carries.
const figures: readonly FinanceFigure[] = ["payment", "rate", "term"];

// The dialog a car is entered or edited in, which takes the car as the
// records it is and lets the store write them: the asset, and for a
// financed car the loan against it and its payments. It is open for as
// long as it is mounted, so the ledger renders it while it holds a car
// to open on, or a new one, and the entry mounts from that. The fields
// are uncontrolled but for the finance's figures, which the dialog shows
// by value. The save holds while the draft is not sound, or a rate could
// not be worked out; a term that could not is no bar, since finance the
// payment never clears is paid to the end of the plan and the store
// reads that off the figures it keeps. The caller is told when the car
// has been saved, so the screen can close the dialog and bring the
// assets forward.
export function CarDialog({
  car,
  onDismiss,
  onSaved,
}: CarDialogProps): JSX.Element {
  const [entry, setEntry] = useState<Entry>(() =>
    car === null ? blank : entryOf(car),
  );
  const [isSaving, startSaving] = useTransition();
  const { canSave, clears, figure, values, worked } = workedOut(entry);

  // A patch to one of the three figures makes it one of the two that
  // stand; any other patch leaves them as they are.
  function amend(patch: Partial<CarDraft>): void {
    const typed = figures.find((candidate) => candidate in patch);
    setEntry({
      ...entry,
      draft: { ...entry.draft, ...patch },
      typed: typed === undefined ? entry.typed : stood(entry.typed, typed),
    });
  }

  // The dialog stays open with its save held until the store answers,
  // then tells the caller; the telling is a transition of its own, since
  // a state update after an await is not part of the one it awaited in.
  // A store that refuses leaves the dialog open and says why, as the
  // editor hook does, rather than handing the route the rejection.
  function save(): void {
    startSaving(async () => {
      try {
        const account = await saveCar(
          car === null ? null : car.asset.id,
          values,
        );
        startTransition(onSaved);
        toast.add({
          description: described(account.name, values.agreement),
          title: car === null ? "Car added" : "Car updated",
          type: "success",
        });
      } catch (error: unknown) {
        toast.add({
          description: reasonOf(error),
          title: "Car not saved",
          type: "error",
        });
      }
    });
  }

  return (
    <EditDialog
      canSave={!isSaving && canSave}
      eyebrow={car === null ? "New car" : "Edit car"}
      isWide
      onDismiss={onDismiss}
      onSave={save}
      title={values.name || "Untitled car"}
    >
      <CarFields
        clears={clears}
        draft={entry.draft}
        figure={figure}
        initial={entry.initial}
        onAmend={amend}
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

// The entry a car opens on: its values as the records hold them, with
// the term worked out from them when it is financed, since the store
// keeps the balance, the balloon, the rate and the payment and reads the
// term off those, and the blank draft's term standing by otherwise.
function entryOf(car: Car): Entry {
  const opening = { ...carOf(car), term: draft.term };
  return {
    draft: opening,
    initial: opening,
    typed: car.loan === null ? ["rate", "term"] : ["payment", "rate"],
  };
}

// The two figures that stand once one is typed: the typed one first, and
// whichever of the two that stood is not it.
function stood(
  typed: readonly [FinanceFigure, FinanceFigure],
  figure: FinanceFigure,
): readonly [FinanceFigure, FinanceFigure] {
  const [first, second] = typed;
  return [figure, first === figure ? second : first];
}

// The figure the two given leave out.
function thirdOf(one: FinanceFigure, other: FinanceFigure): FinanceFigure {
  switch (one) {
    case "payment":
      return other === "rate" ? "term" : "rate";
    case "rate":
      return other === "payment" ? "term" : "payment";
    case "term":
      return other === "payment" ? "rate" : "payment";
  }
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
  worked: FinanceFigure,
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

// What the dialog shows of an entry: which figure is worked out, what it
// came to, the years the payments run in all once the balloon is
// refinanced, the car the draft would save, and whether it can be: a
// sound car, whose rate was found if the rate is what is worked out and
// the car is financed. A term that could not be worked out is no bar,
// since the store reads the open end off the figures it keeps.
function workedOut(entry: Entry): {
  readonly canSave: boolean;
  readonly clears: null | number;
  readonly figure: null | number;
  readonly values: CarValues;
  readonly worked: FinanceFigure;
} {
  const worked = thirdOf(...entry.typed);
  const figure = derive(entry.draft, worked);
  const values = valuesOf(entry.draft, worked, figure);
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
