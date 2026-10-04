"use client";

import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { Agreement, CarDraft, CarValues } from "@/data/cars";
import type { Secured } from "@/data/secured";
import type { Entry } from "@/hooks/use-editor";
import type { LoanFigure, WorkedOut } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { saveCar } from "@/actions/accounts";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { CarFields } from "@/components/app/organisms/car-fields";
import { carOf, clearsAfter, derive, isSound } from "@/data/cars";
import { useMountedEditor } from "@/hooks/use-editor";
import { isSettled, kept, movesLoan, settled, workedOn } from "@/lib/figures";

interface CarDialogProps {
  readonly car: null | Secured;
  readonly onDelete?: ((asset: Account) => void) | undefined;
  readonly onDismiss: () => void;
  readonly onSaved: () => void;
  readonly plan: PlanMonth;
}

// What the dialog holds while it is open: the car as the fields hold it,
// which of the finance's three figures is worked out from the other two,
// which the fields offer as a choice, and whether that figure is held as
// the draft has it, as it is from the moment it is chosen until
// something it is worked out from is typed, so a choice alone changes no
// figure, as the house dialog holds it.
interface Draft extends CarDraft {
  readonly isHeld: boolean;
  readonly worked: LoanFigure;
}

// A new car: on a PCP, since that is the case with the most to work out,
// worth nothing and owing nothing yet, over a term of four years at no
// rate, working out the payment from the rate and the term until another
// figure is chosen.
const blank: Draft = {
  agreement: "pcp",
  balance: 0,
  balloon: 0,
  depreciation: 0,
  isHeld: false,
  name: "",
  payment: 0,
  rate: 0,
  term: 4,
  value: 0,
  worked: "payment",
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
// the values the save sends, which are the draft with the figure worked
// out in place of its own. The caller is told when the car has been saved, so the screen
// can close the dialog and bring the assets forward. Given a delete
// handler, the dialog of a car the store holds offers a Delete, which
// reports the car's own account for the caller
// to ask about with the finance that goes with it, and holds while a
// save is on its way; a new car has nothing yet to delete and is
// offered none.
export function CarDialog({
  car,
  onDelete,
  onDismiss,
  onSaved,
  plan,
}: CarDialogProps): JSX.Element | null {
  // The store answers with the car's own account, which the caller is
  // not told, so the answer's type is stated rather than inferred.
  const { amend, dialogOf, entry } = useMountedEditor<Draft, Account>({
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
      {...dialogOf(entry)}
      canSave={canSave}
      isWide
      onDelete={
        car === null || onDelete === undefined
          ? undefined
          : (): void => {
              onDelete(car.asset);
            }
      }
      onDismiss={onDismiss}
      title={values.name || "Untitled car"}
    >
      <CarFields
        clears={clears}
        draft={entry.draft}
        figure={figure}
        initial={entry.initial}
        onAmend={(patch) => {
          amend(entry, {
            ...patch,
            isHeld: entry.draft.isHeld && !movesLoan(patch),
          });
        }}
        onWork={(next) => {
          amend(entry, {
            ...kept({ figure, worked }),
            isHeld: true,
            worked: next,
          });
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
  const draft: Draft = {
    ...carOf(car),
    isHeld: false,
    term: blank.term,
    worked: workedOn(car.loan !== null),
  };
  return { draft, id: car.asset.id, initial: draft };
}

// The car the draft would save: the name as typed less the space around
// it, which is what the title shows; no balloon on a loan, whatever the
// hidden field holds; and the finance's figures settled as every
// secured asset's are, nothing owed for a car owned outright and the
// figure worked out in place of the draft's own.
function valuesOf(draft: CarDraft, out: WorkedOut): CarValues {
  return settled(
    {
      agreement: draft.agreement,
      balance: draft.balance,
      balloon: draft.agreement === "pcp" ? draft.balloon : 0,
      depreciation: draft.depreciation,
      name: draft.name.trim(),
      payment: draft.payment,
      rate: draft.rate,
      value: draft.value,
    },
    draft.agreement !== "outright",
    out,
  );
}

// What the dialog shows of a draft: which figure is worked out, what it
// came to, the years the payments run in all once the balloon is
// refinanced, the car the draft would save, and whether it can be: a
// sound car whose finance's figures are settled.
function workedOut(
  draft: Draft,
): WorkedOut & {
  readonly canSave: boolean;
  readonly clears: null | number;
  readonly values: CarValues;
} {
  const { worked } = draft;
  const out = {
    figure: draft.isHeld ? draft[worked] : derive(draft, worked),
    worked,
  };
  const values = valuesOf(draft, out);
  return {
    ...out,
    canSave: isSound(values) && isSettled(values.agreement !== "outright", out),
    clears: clearsAfter(values),
    values,
  };
}
