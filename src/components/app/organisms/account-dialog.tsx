"use client";

import type { JSX } from "react";

import type {
  Account,
  AccountDraft,
  AccountKind,
  Funding,
  Share,
} from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Entry } from "@/hooks/use-editor";

import { saveAccount } from "@/actions/accounts";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { AccountFields } from "@/components/app/organisms/account-fields";
import { SacrificeFields } from "@/components/app/organisms/sacrifice-fields";
import { isOwned, takesSpare, toValues } from "@/data/accounts";
import { useMountedEditor } from "@/hooks/use-editor";
import { feeding, listed } from "@/lib/feeders";
import { ownerFor } from "@/lib/owners";

interface AccountDialogProps {
  readonly account: Account | null;
  readonly lines: readonly IncomeLine[];
  readonly onDismiss: () => void;
  readonly onSaved: (account: Account) => void;
  readonly owners: readonly Owner[];
}

// What the dialog holds while it is open: the account's values, flat, so
// the rate sits beside the growth choice and the sum and the cap beside
// the contribution choice, each reset to what it opened with when its
// choice changes, and the field always mounts showing what the draft
// holds; and the share each salary feeding the account sacrifices,
// which is none for a new account.
type Draft = AccountDraft;

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
  owner: null,
  rate: 0,
  shares: [],
};

// The dialog an account is entered or edited in, which takes the account
// as the record it is and lets the store write it. It is open for as
// long as it is mounted, so the ledger renders it while it holds an
// account to open on, or a new one, and the entry mounts from that; the
// entry doubles as the open state, as the progress editor's point does,
// so nothing is left to show once a save has dropped it. The fields are
// uncontrolled and mount fresh with the entry's opening values, and the
// draft mirrors what they report. The income lines are handed down for
// the salaries feeding the account: the treatment is held while one
// does, since the store refuses to make such a pension anything else,
// and each salary's share of its base is edited in the fields' slot
// beside the growth and written with the account, so the sacrifice is
// changed from the pension's side as it is from the salary's, and the
// account's own contribution is said to be on top of it; an account
// nothing feeds shows neither. Only a share that was changed here goes
// to the store, since a share sent as it opened would write over an
// edit made to the salary on the plan screen meanwhile. The owners are
// handed down for an ISA or a pension to name its own, a new one
// opening on the first. The save holds while the account is unnamed,
// while it is a wrapper with no owner, which is only while the plan has
// none to give it, or while it is on its way to the store, and a store
// that refuses leaves the dialog open and says why,
// as the editor hook does, rather than handing the route the rejection.
// The caller is told when the account has been saved, so the screen can
// close the dialog and bring the account's own tab forward.
export function AccountDialog({
  account,
  lines,
  onDismiss,
  onSaved,
  owners,
}: AccountDialogProps): JSX.Element | null {
  const feeders = account === null ? [] : feeding(account.id, lines);
  const opening = openingOf(account, feeders, owners);
  const { amend, entry, isSaving, save } = useMountedEditor({
    describe: (saved) => saved.name,
    noun: "Account",
    onSaved,
    opening,
    save: async (id, draft) =>
      saveAccount(id, {
        ...draft,
        shares: changedOf(draft.shares, opening.initial.shares),
      }),
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
  // stays on one side leaves the choice where it is. The owner goes with
  // a treatment nobody owns and comes back with a wrapper's, as below.
  function treat(current: Entry<Draft>, kind: AccountKind): void {
    const willTakeSpare = takesSpare({ kind });
    const owner = ownerAfter(current, kind, owners);
    if (!willTakeSpare && current.draft.funding === "spare") {
      amend(current, { kind, owner, ...fundedBy(current, "fixed") });
    } else if (
      willTakeSpare &&
      !takesSpare(current.draft) &&
      current.initial.funding !== current.draft.funding
    ) {
      amend(current, {
        kind,
        owner,
        ...fundedBy(current, current.initial.funding),
      });
    } else {
      amend(current, { kind, owner });
    }
  }

  return entry === null ? null : (
    <EditDialog
      canSave={
        !isSaving &&
        entry.draft.name.trim() !== "" &&
        (!isOwned(entry.draft) || entry.draft.owner !== null)
      }
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
        isFed={feeders.length > 0}
        kindLock={kindLockOf(feeders)}
        onAmend={(patch) => {
          amend(entry, patch);
        }}
        onFundingChange={(funding) => {
          fund(entry, funding);
        }}
        onKindChange={(kind) => {
          treat(entry, kind);
        }}
        owners={owners}
      >
        {feeders.length > 0 && (
          <SacrificeFields
            draft={entry.draft.shares}
            feeders={feeders}
            initial={entry.initial.shares}
            onAmend={(shares) => {
              amend(entry, { shares });
            }}
          />
        )}
      </AccountFields>
    </EditDialog>
  );
}

// The shares the save sends: those that differ from what the account
// opened with, by line and by share. The store writes every share it
// is sent, so one sent as it opened would write the opening back over
// whatever the salary holds now; one changed here is the user's last
// word on it and goes.
function changedOf(
  shares: readonly Share[],
  initial: readonly Share[],
): Share[] {
  return shares.filter(
    (share) =>
      !initial.some(
        (held) =>
          held.line === share.line && held.sacrifice === share.sacrifice,
      ),
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
// which the reason says, naming the salaries. An account nothing feeds
// is held to nothing, and a new one is fed by nothing, since the store
// has not given it an id yet: the dialog answers for it rather than
// asking the feeders, since a line feeding no pension holds null where
// an id would be, and the two nulls must not meet.
function kindLockOf(feeders: readonly IncomeLine[]): string | undefined {
  return feeders.length === 0
    ? undefined
    : `Fed by ${listed.format(feeders.map((line) => line.name))}; set the pension to none on the salary to change it`;
}

// The entry the dialog mounts open on: the account as it is, under its
// id so a save writes back to it, with the share each salary feeding
// it sacrifices, or a blank draft under none for a new one, which the
// store gives an id of its own, a pension belonging to the first owner.
function openingOf(
  account: Account | null,
  feeders: readonly IncomeLine[],
  owners: readonly Owner[],
): Entry<Draft> {
  const draft =
    account === null
      ? { ...blank, owner: ownerFor(null, owners) }
      : {
          ...toValues(account),
          shares: feeders.map((line) => ({
            line: line.id,
            sacrifice: line.sacrifice,
          })),
        };
  return { draft, id: account?.id ?? null, initial: draft };
}

// The owner the draft is left with by a treatment: none for a kind
// nobody owns; the one it has for a wrapper made another, since the
// owner field stays where it is; and for an account made a wrapper the
// one the field mounts showing, the account's own or the first owner.
function ownerAfter(
  current: Entry<Draft>,
  kind: AccountKind,
  owners: readonly Owner[],
): null | number {
  if (!isOwned({ kind })) {
    return null;
  }
  return isOwned(current.draft)
    ? current.draft.owner
    : ownerFor(current.initial.owner, owners);
}
