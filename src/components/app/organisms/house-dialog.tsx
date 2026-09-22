"use client";

import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { HouseDraft, HouseValues } from "@/data/houses";
import type { Secured } from "@/data/secured";
import type { Entry } from "@/hooks/use-editor";
import type { LoanFigure, Stood } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { saveHouse } from "@/actions/accounts";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { HouseFields } from "@/components/app/organisms/house-fields";
import { derive, houseOf, isSound } from "@/data/houses";
import { useMountedEditor } from "@/hooks/use-editor";
import { stood, thirdOf } from "@/lib/figures";

// What the dialog holds while it is open: the house as the fields hold
// it, and the two of the mortgage's three figures that stand while the
// third is worked out from them. The two travel with the draft so an
// amendment moves both at once.
interface Draft extends HouseDraft {
  readonly typed: Stood;
}

interface HouseDialogProps {
  readonly house: null | Secured;
  readonly onDismiss: () => void;
  readonly onSaved: () => void;
  readonly plan: PlanMonth;
}

// A new house: mortgaged, since that is the case with something to work
// out, worth nothing and owing nothing yet, over a term of twenty-five
// years at no rate, so the first two figures typed are taken as read and
// the payment follows from them until the payment is typed instead.
const blank: Draft = {
  balance: 0,
  growth: 0,
  name: "",
  payment: 0,
  rate: 0,
  status: "mortgaged",
  term: 25,
  typed: ["rate", "term"],
  value: 0,
};

// The dialog a house is entered or edited in, which takes the house as
// the records it is and lets the store write them: the asset, and for a
// mortgaged house the loan against it and its payments. It is open for
// as long as it is mounted, so the ledger renders it while it holds a
// house to open on, or a new one, and the entry mounts from that. The
// fields are uncontrolled but for the loan's figures, which the dialog
// shows by value. The save holds while the draft is not sound, or a
// rate could not be worked out; a term that could not is no bar, since
// a loan the payment never clears is paid to the end of the plan and
// the store reads that off the figures it keeps. The plan's month is
// handed to the fields, which count the term's end from it. The editor
// hook holds the entry, the save and the toast, as it does for the
// account dialog; what is the house's own is the figure worked out on
// each amendment and the values the save sends, which are the draft
// less the figure typed over. The caller is told when the house has
// been saved, so the screen can close the dialog and bring the assets
// forward.
export function HouseDialog({
  house,
  onDismiss,
  onSaved,
  plan,
}: HouseDialogProps): JSX.Element | null {
  // The store answers with the house's own account, which the caller is
  // not told, so the answer's type is stated rather than inferred.
  const { amend, entry, isSaving, save } = useMountedEditor<Draft, Account>({
    describe: (saved, values) =>
      values.status === "mortgaged"
        ? `${saved.name} · with its mortgage and payments`
        : saved.name,
    noun: "House",
    onSaved,
    opening: openingOf(house),
    save: async (id, draft) => saveHouse(id, workedOut(draft).values),
  });
  if (entry === null) {
    return null;
  }
  const { canSave, figure, values, worked } = workedOut(entry.draft);
  return (
    <EditDialog
      canSave={!isSaving && canSave}
      eyebrow={entry.id === null ? "New house" : "Edit house"}
      isWide
      onDismiss={onDismiss}
      onSave={() => {
        save(entry);
      }}
      title={values.name || "Untitled house"}
    >
      <HouseFields
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

// The entry the dialog mounts open on: the house as its records hold
// it, under its asset's id so a save writes back to it, with the term
// worked out from them when it is mortgaged, since the store keeps the
// balance, the rate and the payment and reads the term off those, and
// the blank draft's term standing by otherwise; or the blank draft
// under no id for a new one.
function openingOf(house: null | Secured): Entry<Draft> {
  if (house === null) {
    return { draft: blank, id: null, initial: blank };
  }
  const typed: Stood =
    house.loan === null ? ["rate", "term"] : ["payment", "rate"];
  const draft: Draft = { ...houseOf(house), term: blank.term, typed };
  return { draft, id: house.asset.id, initial: draft };
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
  worked: LoanFigure,
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

// What the dialog shows of a draft: which figure is worked out, what it
// came to, the house the draft would save, and whether it can be: a
// sound house, whose rate was found if the rate is what is worked out
// and the house is mortgaged. A term that could not be worked out is no
// bar, since the store reads the open end off the figures it keeps.
function workedOut(draft: Draft): {
  readonly canSave: boolean;
  readonly figure: null | number;
  readonly values: HouseValues;
  readonly worked: LoanFigure;
} {
  const worked = thirdOf(...draft.typed);
  const figure = derive(draft, worked);
  const values = valuesOf(draft, worked, figure);
  return {
    canSave:
      isSound(values) &&
      (values.status === "outright" || worked !== "rate" || figure !== null),
    figure,
    values,
    worked,
  };
}
