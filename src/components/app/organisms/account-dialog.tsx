"use client";

import type { JSX } from "react";

import type {
  Account,
  AccountKind,
  AccountValues,
  Funding,
} from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Entry } from "@/hooks/use-editor";

import { saveAccount } from "@/app/(app)/accounts/actions";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { AccountFields } from "@/components/app/organisms/account-fields";
import { takesSpare, toValues } from "@/data/accounts";
import { useMountedEditor } from "@/hooks/use-editor";
import { feedersOf, listed } from "@/lib/feeders";

interface AccountDialogProps {
  readonly account: Account | null;
  readonly lines: readonly IncomeLine[];
  readonly onDismiss: () => void;
  readonly onSaved: (account: Account) => void;
}

// What the dialog holds while it is open: the account's values, flat, so
// the rate sits beside the growth choice and the sum and the cap beside
// the contribution choice, each reset to what it opened with when its
// choice changes, and the field always mounts showing what the draft
// holds.
type Draft = AccountValues;

const blank: Draft = {
  balance: 0,
  balloon: 0,
  cadence: "year",
  cap: 0,
  contribution: 0,
  funding: "fixed",
  growth: "plan",
  kind: "tax-deferred",
  name: "",
  rate: 0,
};

// The dialog an account is entered or edited in, which takes the account
// as the record it is and lets the store write it. It is open for as
// long as it is mounted, so the ledger renders it while it holds an
// account to open on, or a new one, and the entry mounts from that; the
// entry doubles as the open state, as the progress editor's point does,
// so nothing is left to show once a save has dropped it. The fields are
// uncontrolled and mount fresh with the entry's opening values, and the
// draft mirrors what they report. The treatment is held where a salary
// feeds the account, since the store refuses to make such a pension
// anything else, which is what the income lines are handed down for.
// The save holds while the account is unnamed or on its way to the
// store, and a store that refuses leaves the dialog open and says why,
// as the editor hook does, rather than handing the route the rejection.
// The caller is told when the account has been saved, so the screen can
// close the dialog and bring the account's own tab forward.
export function AccountDialog({
  account,
  lines,
  onDismiss,
  onSaved,
}: AccountDialogProps): JSX.Element | null {
  const { amend, entry, isSaving, save } = useMountedEditor({
    describe: (saved) => saved.name,
    noun: "Account",
    onSaved,
    opening: openingOf(account),
    save: saveAccount,
  });

  // The contribution choice: the fields the new choice shows mount with
  // what the account opened with, so the draft takes the same, and the
  // fields the choice leaves behind go back to nothing.
  function fund(current: Entry<Draft>, funding: Funding): void {
    amend(current, fundedBy(current, funding));
  }

  // The treatment choice: a real asset or a debt is paid only a fixed sum, so the
  // contribution choice leaves with it and an account paid the spare
  // money is paid a fixed sum instead, as it opened. The choice comes
  // back when a wrapper or cash is chosen again, as the account opened
  // with it, which is what the choice mounts showing. A change that
  // stays on one side leaves the choice where it is.
  function treat(current: Entry<Draft>, kind: AccountKind): void {
    const willTakeSpare = takesSpare({ kind });
    if (!willTakeSpare && current.draft.funding === "spare") {
      amend(current, { kind, ...fundedBy(current, "fixed") });
    } else if (
      willTakeSpare &&
      !takesSpare(current.draft) &&
      current.initial.funding !== current.draft.funding
    ) {
      amend(current, { kind, ...fundedBy(current, current.initial.funding) });
    } else {
      amend(current, { kind });
    }
  }

  return entry === null ? null : (
    <EditDialog
      canSave={!isSaving && entry.draft.name.trim() !== ""}
      eyebrow={entry.id === null ? "New account" : "Edit account"}
      isWide
      onDismiss={onDismiss}
      onSave={() => {
        save(entry);
      }}
      title={entry.draft.name.trim() || "Untitled account"}
    >
      <AccountFields
        draft={entry.draft}
        initial={entry.initial}
        kindLock={kindLockOf(entry.id, lines)}
        onAmend={(patch) => {
          amend(entry, patch);
        }}
        onFundingChange={(funding) => {
          fund(entry, funding);
        }}
        onKindChange={(kind) => {
          treat(entry, kind);
        }}
      />
    </EditDialog>
  );
}

// The draft as a contribution choice leaves it: the fields the choice
// shows at what the account opened with, since that is what they mount
// showing, and the fields it hides at nothing.
function fundedBy(current: Entry<Draft>, funding: Funding): Partial<Draft> {
  return funding === "fixed"
    ? {
        cadence: current.initial.cadence,
        cap: 0,
        contribution: current.initial.contribution,
        funding,
      }
    : { cadence: "year", cap: current.initial.cap, contribution: 0, funding };
}

// Why the treatment of the account being edited is held, if it is: a
// pension a salary feeds stays a pension until the salary is unlinked,
// which the reason says, naming the salaries. A new account, or one
// nothing feeds, is held to nothing. The new one is answered here rather
// than by the feeders, since nothing can feed an account the store has
// not given an id yet, and a line feeding no pension holds null where an
// id would be: the two nulls mean different things and must not meet.
function kindLockOf(
  id: null | number,
  lines: readonly IncomeLine[],
): string | undefined {
  if (id === null) {
    return undefined;
  }
  const feeders = feedersOf(id, lines);
  return feeders.length === 0
    ? undefined
    : `Fed by ${listed.format(feeders)}; set the pension to none on the salary to change it`;
}

// The entry the dialog mounts open on: the account as it is, under its
// id so a save writes back to it, or a blank draft under none for a new
// one, which the store gives an id of its own.
function openingOf(account: Account | null): Entry<Draft> {
  const draft = account === null ? blank : toValues(account);
  return { draft, id: account?.id ?? null, initial: draft };
}
