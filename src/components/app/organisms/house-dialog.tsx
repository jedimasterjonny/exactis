"use client";

import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type {
  HouseDraft,
  HouseValues,
  MoveChoice,
  PartDraft,
} from "@/data/houses";
import type { Secured } from "@/data/secured";
import type { Entry } from "@/hooks/use-editor";
import type { LoanFigure, WorkedOut } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { saveHouse } from "@/actions/accounts";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { HouseFields } from "@/components/app/organisms/house-fields";
import { derive, houseOf, isSound, openingPurchase } from "@/data/houses";
import { useMountedEditor } from "@/hooks/use-editor";
import { isSettled, kept, movesLoan, settled, workedOn } from "@/lib/figures";

// What the dialog holds while it is open: the house as the fields hold
// it, with each sub-account as the dialog holds it.
type Draft = HouseDraft<Working>;

interface HouseDialogProps {
  readonly house: null | Secured;
  readonly milestones: readonly MoveChoice[];
  readonly onDelete?: ((asset: Account) => void) | undefined;
  readonly onDismiss: () => void;
  readonly onSaved: () => void;
  readonly plan: PlanMonth;
}

// A sub-account as the dialog holds it while it is open: as the fields
// hold it, which of its three figures is worked out from the other two,
// which the fields offer as a choice, and whether that figure is held
// as the draft has it, as it is from the moment it is chosen until
// something it is worked out from is typed, so a choice alone changes
// no figure: worked out afresh from a term that is a part of a month,
// which the payments round up to a whole one, a rate or a payment would
// move with nothing typed, and be saved so.
interface Working extends PartDraft {
  readonly isHeld: boolean;
  readonly worked: LoanFigure;
}

// A new sub-account: opened from no loan and owing nothing yet, over a
// term of twenty-five years at no rate, working out the payment from
// the rate and the term until another figure is chosen.
const blankPart = {
  balance: 0,
  isHeld: false,
  loan: null,
  payment: 0,
  rate: 0,
  term: 25,
  worked: "payment",
} as const satisfies Omit<Working, "key">;

// A new house: mortgaged, since that is the case with something to work
// out, worth nothing, with no ceiling, held in one new sub-account and
// staying put.
// When it was bought is the plan's to say, since a house opens on the
// plan's month before one is typed.
const blank = {
  ceiling: 0,
  growth: 0,
  move: null,
  name: "",
  parts: [{ ...blankPart, key: 0 }],
  status: "mortgaged",
  value: 0,
} as const satisfies Omit<Draft, "bought">;

// The dialog a house is entered or edited in, which takes the house as
// the records it is and lets the store write them: the asset, and for a
// mortgaged house the loan each sub-account is and its payments. It is open for
// as long as it is mounted, so the ledger renders it while it holds a
// house to open on, or a new one, and the entry mounts from that. The
// fields are uncontrolled but for the loan's figures, which the dialog
// shows by value, and are handed the milestones, for the one a house
// moves at. The save holds while the draft is not sound, or a
// rate could not be worked out; a term that could not is no bar, since
// a loan the payment never clears is paid to the end of the plan and
// the store reads that off the figures it keeps. The plan's month is
// handed to the fields, which count the term's end from it. The editor
// hook holds the entry, the save and the toast, as it does for the
// account dialog; what is the house's own is each sub-account's figure
// worked out on each amendment, the sub-accounts added, changed and
// taken away, and the values the save sends, which are the draft with
// each figure worked out in place of its own, sent beside the house as
// it opened, so the store refuses a save over a house changed meanwhile.
// The caller is told when the house has
// been saved, so the screen can close the dialog and bring the assets
// forward. Given a delete handler, the dialog of a house the store holds
// offers a Delete, which reports the house's own account, for the caller to ask about with the mortgage that goes with
// it, and holds while a save is on its way; a new house has nothing yet
// to delete and is offered none.
export function HouseDialog({
  house,
  milestones,
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
    save: async (id, draft) => saveHouse(id, workedOut(draft).values, house),
  });
  if (entry === null) {
    return null;
  }
  const { canSave, parts, values } = workedOut(entry.draft);

  // The sub-accounts with the one the key names changed, the rest as
  // they are.
  const changed = (key: number, change: (part: Working) => Working): void => {
    amend(entry, {
      parts: entry.draft.parts.map((part) =>
        part.key === key ? change(part) : part,
      ),
    });
  };

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
        draft={{ ...entry.draft, parts }}
        initial={entry.initial}
        milestones={milestones}
        onAdd={() => {
          amend(entry, {
            parts: [
              ...entry.draft.parts,
              {
                ...blankPart,
                key:
                  Math.max(-1, ...entry.draft.parts.map(({ key }) => key)) + 1,
              },
            ],
          });
        }}
        onAmend={(patch) => {
          amend(entry, patch);
        }}
        onAmendPart={(key, patch) => {
          changed(key, (part) => ({
            ...part,
            ...patch,
            isHeld: part.isHeld && !movesLoan(patch),
          }));
        }}
        onRemove={(key) => {
          amend(entry, {
            parts: entry.draft.parts.filter((part) => part.key !== key),
          });
        }}
        onWork={(key, next) => {
          changed(key, (part) => ({
            ...part,
            ...kept(outOf(part)),
            isHeld: true,
            worked: next,
          }));
        }}
        plan={plan}
      />
    </EditDialog>
  );
}

// The entry the dialog mounts open on: the house as its records hold
// it, under its asset's id so a save writes back to it, each
// sub-account keyed by its place, with the term worked out from the
// figures the store keeps, the balance, the rate and the payment, and
// the blank term standing by beside them, or for a house owned outright
// a blank sub-account standing by, so the loan's fields are there the
// moment it is mortgaged; or the blank draft, bought in the plan's month
// for nothing yet, under no id for a new one. Each sub-account carries
// the loan it was opened from, so a save writes it back over that loan
// whatever was taken away before it.
function openingOf(house: null | Secured, plan: PlanMonth): Entry<Draft> {
  if (house === null) {
    const draft: Draft = { ...blank, bought: openingPurchase(plan) };
    return { draft, id: null, initial: draft };
  }
  const values = houseOf(house, plan);
  const draft: Draft = {
    ...values,
    parts:
      values.parts.length === 0
        ? blank.parts
        : values.parts.map((part, key) => ({
            ...part,
            isHeld: false,
            key,
            term: blankPart.term,
            worked: workedOn(true),
          })),
  };
  return { draft, id: house.asset.id, initial: draft };
}

// Which figure a sub-account works out and what it came to: the
// figure as the draft holds it while it is held, or worked out afresh.
function outOf(part: Working): WorkedOut {
  const { worked } = part;
  return { figure: part.isHeld ? part[worked] : derive(part, worked), worked };
}

// What the dialog shows of a draft: each sub-account with what its
// figure came to, the house the draft would save, and whether it can
// be: a sound house each of whose sub-accounts' figures are settled.
// The house saved is the draft with the name as typed less the space
// around it, which is what the title shows, and each sub-account's
// figures settled as every secured asset's are, the figure worked out
// in place of the draft's own; a house owned outright saves none,
// whatever the hidden sub-accounts hold.
function workedOut(draft: Draft): {
  readonly canSave: boolean;
  readonly parts: readonly (WorkedOut & Working)[];
  readonly values: HouseValues;
} {
  const isMortgaged = draft.status === "mortgaged";
  const parts = draft.parts.map((part) => ({ ...part, ...outOf(part) }));
  const values: HouseValues = {
    bought: draft.bought,
    ceiling: draft.ceiling,
    growth: draft.growth,
    move: draft.move,
    name: draft.name.trim(),
    parts: isMortgaged
      ? parts.map(({ balance, figure, loan, payment, rate, worked }) =>
          settled({ balance, loan, payment, rate }, true, { figure, worked }),
        )
      : [],
    status: draft.status,
    value: draft.value,
  };
  return {
    canSave:
      isSound(values) && parts.every((part) => isSettled(isMortgaged, part)),
    parts,
    values,
  };
}
