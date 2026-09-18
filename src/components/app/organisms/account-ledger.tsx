"use client";

import type { JSX } from "react";

import { HousePlus, Plus } from "lucide-react";
import { startTransition, useOptimistic, useState, useTransition } from "react";

import type {
  Account,
  AccountKind,
  AccountValues,
  Funding,
} from "@/data/accounts";
import type { House } from "@/data/houses";

import {
  placeAccountsInOrder,
  saveAccount,
} from "@/app/(app)/accounts/actions";
import { Note } from "@/components/app/atoms/note";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { AccountFields } from "@/components/app/organisms/account-fields";
import { AccountTable } from "@/components/app/organisms/account-table";
import { HouseDialog } from "@/components/app/organisms/house-dialog";
import { Button } from "@/components/kit/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/kit/tabs";
import { toast } from "@/components/kit/toast";
import { isAsset, takesSpare, toValues } from "@/data/accounts";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";

interface AccountLedgerProps {
  readonly accounts: readonly Account[];
}

// What the dialog holds while it is open: the account's values, flat, so
// the rate sits beside the growth choice and the sum and the cap beside
// the contribution choice, each reset to what it opened with when its
// choice changes, and the field always mounts showing what the draft
// holds.
type Draft = AccountValues;

// An open dialog: the draft as it is, the draft as it opened, which the
// uncontrolled fields take as their defaults, and the id of the account it
// edits, or null for a new one.
interface Entry {
  readonly draft: Draft;
  readonly id: null | number;
  readonly initial: Draft;
}

// What the house dialog is open on: a new house, or one to edit with the
// loan against it.
type HouseOpening = "new" | House;

type Tab = "accounts" | "assets";

const blank: Draft = {
  balance: 0,
  cadence: "year",
  cap: 0,
  contribution: 0,
  funding: "fixed",
  growth: "plan",
  kind: "tax-deferred",
  name: "",
  rate: 0,
};

// The accounts screen's ledger and its dialog, which enters a new account
// from the header's button or edits one from its row. The rows are the
// store's, handed down by the page, and a save goes to the store and comes
// back with the page re-read, so the tables reflect it without the ledger
// holding rows of its own. The one thing the ledger holds is the order
// while a move is on its way to the store, since a row dragged into
// place has to stay there rather than spring back until the page
// re-reads; the optimistic order is the page's again once it does. The
// entry doubles as the dialog's open state, as the progress editor's
// point does, and the tab is controlled so a saved account can bring
// its own tab forward, as a saved house does through the house dialog,
// which the header's Add house button opens on a new house and the
// pencil of a house or the loan against it opens on that house, so an
// edit from either side writes both. The fields are uncontrolled and mount fresh with the entry's
// opening values each time the dialog opens, and the draft mirrors what
// they report.
export function AccountLedger({ accounts }: AccountLedgerProps): JSX.Element {
  const [tab, setTab] = useState<Tab>("accounts");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [house, setHouse] = useState<HouseOpening | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [order, placeOptimistically] = useOptimistic(
    accounts,
    (_current: readonly Account[], next: readonly Account[]) => next,
  );
  const held = order.filter((account) => !isAsset(account));
  const assets = order.filter(isAsset);

  function amend(current: Entry, patch: Partial<Draft>): void {
    setEntry({ ...current, draft: { ...current.draft, ...patch } });
  }

  function dismiss(): void {
    setEntry(null);
  }

  // A row's pencil opens its account as it is, with its id so a save
  // writes back to it, unless the account is a house or the loan against
  // one, which open as the house they are part of.
  function edit(account: Account): void {
    const found = houseFor(account, order);
    if (found === null) {
      open(toValues(account), account.id);
    } else {
      setHouse(found);
    }
  }

  // The contribution choice: the fields the new choice shows mount with
  // what the account opened with, so the draft takes the same, and the
  // fields the choice leaves behind go back to nothing.
  function fund(current: Entry, funding: Funding): void {
    amend(current, fundedBy(current, funding));
  }

  // A row moved onto another takes its place in the whole list: before
  // it when moved up, after it when moved down, so the spare money is
  // handed down the accounts as the tab now shows them. The order shows
  // at once and goes to the store behind it; the transition holds the
  // optimistic order until the store's answer brings the page re-read.
  function move(account: Account, target: Account): void {
    const at = (id: number): number => order.findIndex((a) => a.id === id);
    const without = order.filter((a) => a.id !== account.id);
    const place =
      without.findIndex((a) => a.id === target.id) +
      (at(account.id) < at(target.id) ? 1 : 0);
    const next = [...without.slice(0, place), account, ...without.slice(place)];
    startTransition(async () => {
      placeOptimistically(next);
      await placeAccountsInOrder(next.map((a) => a.id));
    });
  }

  function open(draft: Draft, id: null | number): void {
    setEntry({ draft, id, initial: draft });
  }

  // The treatment choice: a real asset or a debt is paid only a fixed sum, so the
  // contribution choice leaves with it and an account paid the spare
  // money is paid a fixed sum instead, as it opened. The choice comes
  // back when a wrapper or cash is chosen again, as the account opened
  // with it, which is what the choice mounts showing. A change that
  // stays on one side leaves the choice where it is.
  function treat(current: Entry, kind: AccountKind): void {
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

  // The name is saved as typed less the space around it, which is what
  // the title shows and what save waited for. The dialog stays open with
  // its save held until the store answers, then closes onto the tab the
  // account belongs to; the close is a transition of its own, since a
  // state update after an await is not part of the one it awaited in.
  function save(current: Entry): void {
    const values = { ...current.draft, name: current.draft.name.trim() };
    startSaving(async () => {
      const account = await saveAccount(current.id, values);
      startTransition(() => {
        setTab(isAsset(account) ? "assets" : "accounts");
        setEntry(null);
      });
      toast.add({
        description: account.name,
        title: current.id === null ? "Account added" : "Account updated",
        type: "success",
      });
    });
  }

  return (
    <>
      <ScreenHeader
        actions={
          <>
            <Button
              onClick={() => {
                setHouse("new");
              }}
              size="sm"
              variant="outline"
            >
              <HousePlus aria-hidden />
              Add house
            </Button>
            <Button
              onClick={() => {
                open(blank, null);
              }}
              size="sm"
            >
              <Plus aria-hidden />
              Add account
            </Button>
          </>
        }
        label={sectionLabel(accountsAndAssets)}
        title="Accounts & assets"
      >
        {`${counted(held.length, "account")} · ${counted(assets.length, "asset")}`}
      </ScreenHeader>
      <ScreenBody>
        <Tabs
          onValueChange={(value) => {
            setTab(value === "assets" ? "assets" : "accounts");
          }}
          value={tab}
        >
          <TabsList variant="line">
            <TabsTrigger value="accounts">
              Accounts
              <TabCount count={held.length} />
            </TabsTrigger>
            <TabsTrigger value="assets">
              Assets
              <TabCount count={assets.length} />
            </TabsTrigger>
          </TabsList>
          <TabsContent className="grid gap-5" value="accounts">
            <AccountTable
              accounts={held}
              emptyDescription="Add a pension, an ISA, a savings account or a debt to see it listed here."
              emptyTitle="No accounts yet"
              onEdit={edit}
              onMove={move}
            />
            <Note>
              Spare money is handed down the accounts in this order. Drag a row
              by its grip, or move it with the arrow keys.
            </Note>
            <Note>
              Allocation is set once at plan level and applied pro rata to every
              account.
            </Note>
          </TabsContent>
          <TabsContent className="grid gap-5" value="assets">
            <AccountTable
              accounts={assets}
              emptyDescription="A house, a car, anything owned outright. Add one to see it listed here."
              emptyTitle="No assets yet"
              onEdit={edit}
            />
            <Note>
              A loan against an asset is listed with the accounts, since it is
              paid as they are. The progress points reconcile the two as total
              assets and asset loans.
            </Note>
          </TabsContent>
        </Tabs>
      </ScreenBody>
      {entry !== null && (
        <EditDialog
          canSave={!isSaving && entry.draft.name.trim() !== ""}
          eyebrow={entry.id === null ? "New account" : "Edit account"}
          isWide
          onDismiss={dismiss}
          onSave={() => {
            save(entry);
          }}
          title={entry.draft.name.trim() || "Untitled account"}
        >
          <AccountFields
            draft={entry.draft}
            initial={entry.initial}
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
      )}
      {house !== null && (
        <HouseDialog
          house={house === "new" ? null : house}
          onDismiss={() => {
            setHouse(null);
          }}
          onSaved={() => {
            setHouse(null);
            setTab("assets");
          }}
        />
      )}
    </>
  );
}

// A tab's count for the header, one in the singular.
function counted(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

// The draft as a contribution choice leaves it: the fields the choice
// shows at what the account opened with, since that is what they mount
// showing, and the fields it hides at nothing.
function fundedBy(current: Entry, funding: Funding): Partial<Draft> {
  return funding === "fixed"
    ? {
        cadence: current.initial.cadence,
        cap: 0,
        contribution: current.initial.contribution,
        funding,
      }
    : { cadence: "year", cap: current.initial.cap, contribution: 0, funding };
}

// The house an account is part of: a house is its own, with the loan
// secured on it when there is one, and a loan secured on a house is that
// house's; any other account is part of none, and so is a loan whose
// asset is not listed, which opens as the account it is.
function houseFor(
  account: Account,
  accounts: readonly Account[],
): House | null {
  if (account.kind === "house") {
    return {
      asset: account,
      loan: accounts.find((a) => a.secures === account.id) ?? null,
    };
  }
  const asset = accounts.find((a) => a.id === account.secures);
  return asset === undefined ? null : { asset, loan: account };
}

// The row count beside a tab's label, in the micro-label face and faint.
function TabCount({ count }: { readonly count: number }): JSX.Element {
  return (
    <span className="label text-muted-foreground/60">{String(count)}</span>
  );
}
