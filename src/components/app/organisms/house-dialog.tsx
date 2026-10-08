"use client";

import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { HouseDraft, HouseValues } from "@/data/houses";
import type { Secured } from "@/data/secured";
import type { Entry } from "@/hooks/use-editor";
import type { LoanFigure, WorkedOut } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { saveHouse } from "@/actions/accounts";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { HouseFields } from "@/components/app/organisms/house-fields";
import { derive, houseOf, isSound, openingPurchase } from "@/data/houses";
import { useMountedEditor } from "@/hooks/use-editor";
import { isSettled, kept, movesLoan, settled, workedOn } from "@/lib/figures";

// What the dialog holds while it is open: the house as the fields hold
// it, which of the mortgage's three figures is worked out from the
// other two, which the fields offer as a choice, and whether that figure
// is held as the draft has it, as it is from the moment it is chosen
// until something it is worked out from is typed, so a choice alone
// changes no figure: worked out afresh from a term that is a part of a
// month, which the payments round up to a whole one, a rate or a
// payment would move with nothing typed, and be saved so.
interface Draft extends HouseDraft {
  readonly isHeld: boolean;
  readonly worked: LoanFigure;
}

interface HouseDialogProps {
  readonly house: null | Secured;
  readonly onDelete?: ((asset: Account) => void) | undefined;
  readonly onDismiss: () => void;
  readonly onSaved: () => void;
  readonly plan: PlanMonth;
}

// A new house: mortgaged, since that is the case with something to work
// out, worth nothing and owing nothing yet, over a term of twenty-five
// years at no rate, working out the payment from the rate and the term
// until another figure is chosen. When it was bought is the plan's to
// say, since a house opens on the plan's month before one is typed.
const blank = {
  balance: 0,
  growth: 0,
  isHeld: false,
  name: "",
  payment: 0,
  rate: 0,
  status: "mortgaged",
  term: 25,
  value: 0,
  worked: "payment",
} as const satisfies Omit<Draft, "bought">;

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
// with the figure worked out in place of its own. The caller is told when the house has
// been saved, so the screen can close the dialog and bring the assets
// forward. Given a delete handler, the dialog of a house the store holds
// offers a Delete, which reports the house's own account, for the caller to ask about with the mortgage that goes with
// it, and holds while a save is on its way; a new house has nothing yet
// to delete and is offered none.
export function HouseDialog({
  house,
  onDelete,
  onDismiss,
  onSaved,
  plan,
}: HouseDialogProps): JSX.Element | null {
  // The store answers with the house's own account, which the caller is
  // not told, so the answer's type is stated rather than inferred.
  const { amend, dialogOf, entry } = useMountedEditor<Draft, Account>({
    describe: (saved, values) =>
      values.status === "mortgaged"
        ? `${saved.name} · with its mortgage and payments`
        : saved.name,
    noun: "House",
    onSaved,
    opening: openingOf(house, plan),
    save: async (id, draft) => saveHouse(id, workedOut(draft).values),
  });
  if (entry === null) {
    return null;
  }
  const { canSave, figure, values, worked } = workedOut(entry.draft);
  return (
    <EditDialog
      {...dialogOf(entry)}
      canSave={canSave}
      isWide
      onDelete={
        house === null || onDelete === undefined
          ? undefined
          : (): void => {
              onDelete(house.asset);
            }
      }
      onDismiss={onDismiss}
      title={values.name || "Untitled house"}
    >
      <HouseFields
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

// The entry the dialog mounts open on: the house as its records hold
// it, under its asset's id so a save writes back to it, with the term
// worked out from them when it is mortgaged, since the store keeps the
// balance, the rate and the payment and reads the term off those, and
// the blank draft's term standing by otherwise; or the blank draft,
// bought in the plan's month for nothing yet, under no id for a new
// one.
function openingOf(house: null | Secured, plan: PlanMonth): Entry<Draft> {
  if (house === null) {
    const draft: Draft = { ...blank, bought: openingPurchase(plan) };
    return { draft, id: null, initial: draft };
  }
  const draft: Draft = {
    ...houseOf(house, plan),
    isHeld: false,
    term: blank.term,
    worked: workedOn(house.loan !== null),
  };
  return { draft, id: house.asset.id, initial: draft };
}

// The house the draft would save: the name as typed less the space
// around it, which is what the title shows, and the mortgage's figures
// settled as every secured asset's are, nothing owed for a house owned
// outright and the figure worked out in place of the draft's own.
function valuesOf(draft: HouseDraft, out: WorkedOut): HouseValues {
  return settled(
    {
      balance: draft.balance,
      bought: draft.bought,
      growth: draft.growth,
      name: draft.name.trim(),
      payment: draft.payment,
      rate: draft.rate,
      status: draft.status,
      value: draft.value,
    },
    draft.status === "mortgaged",
    out,
  );
}

// What the dialog shows of a draft: which figure is worked out, what it
// came to, the house the draft would save, and whether it can be: a
// sound house whose mortgage's figures are settled.
function workedOut(
  draft: Draft,
): WorkedOut & { readonly canSave: boolean; readonly values: HouseValues } {
  const { worked } = draft;
  const out = {
    figure: draft.isHeld ? draft[worked] : derive(draft, worked),
    worked,
  };
  const values = valuesOf(draft, out);
  return {
    ...out,
    canSave: isSound(values) && isSettled(values.status === "mortgaged", out),
    values,
  };
}
