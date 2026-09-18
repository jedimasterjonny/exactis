"use client";

import type { JSX } from "react";

import { CarFront, HousePlus, Plus } from "lucide-react";
import { startTransition, useOptimistic, useState, useTransition } from "react";

import type {
  Account,
  AccountKind,
  AccountValues,
  Funding,
} from "@/data/accounts";
import type { Car } from "@/data/cars";
import type { House } from "@/data/houses";
import type { IncomeLine } from "@/data/income";
import type { Entry } from "@/hooks/use-editor";

import {
  placeAccountsInOrder,
  removeAccount,
  saveAccount,
} from "@/app/(app)/accounts/actions";
import { Note } from "@/components/app/atoms/note";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { AccountFields } from "@/components/app/organisms/account-fields";
import { AccountTable } from "@/components/app/organisms/account-table";
import { CarDialog } from "@/components/app/organisms/car-dialog";
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
import { useEditor } from "@/hooks/use-editor";
import { counted } from "@/lib/count";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";

interface AccountLedgerProps {
  readonly accounts: readonly Account[];
  readonly lines: readonly IncomeLine[];
}

// What the car dialog is open on: a new car, or one to edit with the
// loan against it.
type CarOpening = "new" | Car;

// What the dialog holds while it is open: the account's values, flat, so
// the rate sits beside the growth choice and the sum and the cap beside
// the contribution choice, each reset to what it opened with when its
// choice changes, and the field always mounts showing what the draft
// holds.
type Draft = AccountValues;

// What the house dialog is open on: a new house, or one to edit with the
// loan against it.
type HouseOpening = "new" | House;

// An asset and the loan secured on it, as the ledger finds them for the
// dialog that edits them as one; a house and a car are the same to it.
interface Secured {
  readonly asset: Account;
  readonly loan: Account | null;
}

type Tab = "accounts" | "assets";

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
// its own tab forward, as a saved house or car does through its own
// dialog, which the header's Add house and Add car buttons open on a new
// one and the pencil of a house or a car, or of the loan against either,
// opens on that asset, so an edit from either side writes both. The fields are uncontrolled and mount fresh with the entry's
// opening values each time the dialog opens, and the draft mirrors what
// they report. A row's bin asks through the confirm dialog before the
// account goes, saying what goes with it, since an asset takes its loan
// and a loan its payments, and what stops, since a salary feeding a
// pension stops when the pension goes; the income lines are handed
// down for that alone, so the ledger can name the salaries.
export function AccountLedger({
  accounts,
  lines,
}: AccountLedgerProps): JSX.Element {
  const [tab, setTab] = useState<Tab>("accounts");
  const [house, setHouse] = useState<HouseOpening | null>(null);
  const [car, setCar] = useState<CarOpening | null>(null);
  const [doomed, setDoomed] = useState<Account | null>(null);
  const [isRemoving, startRemoving] = useTransition();
  const [order, placeOptimistically] = useOptimistic(
    accounts,
    (_current: readonly Account[], next: readonly Account[]) => next,
  );
  const { amend, dismiss, entry, isSaving, open, save } = useEditor({
    describe: (account) => account.name,
    noun: "Account",
    // A saved account brings its own tab forward, in the transition
    // the dialog closes in, so the tab and the closed dialog land
    // together.
    onSaved: (account) => {
      setTab(isAsset(account) ? "assets" : "accounts");
    },
    save: saveAccount,
  });
  const held = order.filter((account) => !isAsset(account));
  const assets = order.filter(isAsset);

  // A row's pencil opens its account as it is, with its id so a save
  // writes back to it, unless the account is a house or a car, or the
  // loan against one, which open as the asset they are part of.
  function edit(account: Account): void {
    const found = securedFor(account, order);
    if (found === null) {
      open(toValues(account), account.id);
    } else if (found.asset.kind === "car") {
      setCar(found);
    } else {
      setHouse(found);
    }
  }

  // The contribution choice: the fields the new choice shows mount with
  // what the account opened with, so the draft takes the same, and the
  // fields the choice leaves behind go back to nothing.
  function fund(current: Entry<Draft>, funding: Funding): void {
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

  // What the confirm dialog asked goes to the store; the dialog stays
  // open with its confirm held until the store answers, then closes, as
  // a save does, and the page re-read takes the row with it.
  function remove(account: Account): void {
    startRemoving(async () => {
      await removeAccount(account.id);
      startTransition(() => {
        setDoomed(null);
      });
      toast.add({
        description: account.name,
        title: "Account deleted",
        type: "success",
      });
    });
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
                setCar("new");
              }}
              size="sm"
              variant="outline"
            >
              <CarFront aria-hidden />
              Add car
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
              onDelete={setDoomed}
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
              onDelete={setDoomed}
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
      {doomed !== null && (
        <ConfirmDialog
          isBusy={isRemoving}
          onCancel={() => {
            setDoomed(null);
          }}
          onConfirm={() => {
            remove(doomed);
          }}
          title={`Delete ${doomed.name}?`}
        >
          {goesWith(doomed, order, lines)}
        </ConfirmDialog>
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
      {car !== null && (
        <CarDialog
          car={car === "new" ? null : car}
          onDismiss={() => {
            setCar(null);
          }}
          onSaved={() => {
            setCar(null);
            setTab("assets");
          }}
        />
      )}
    </>
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

// The names as a sentence lists them, "Salary and Salary step-up".
const listed = new Intl.ListFormat("en-GB");

// What goes with an account when it is deleted, for the dialog to say:
// a pension takes the sacrifice of every salary feeding it, which is
// earned whole from then on, since the store stops the salaries before
// the pension goes and the share typed against each is lost with it; a
// house or a car takes the loan secured on it and that loan's payments,
// a loan takes its payments, and any other account, or an asset with no
// loan, goes alone.
function goesWith(
  account: Account,
  accounts: readonly Account[],
  lines: readonly IncomeLine[],
): string {
  const feeders = lines
    .filter((line) => line.feeds === account.id)
    .map((line) => line.name);
  if (feeders.length > 0) {
    return `${listed.format(feeders)} ${feeders.length === 1 ? "stops" : "stop"} sacrificing into it and ${feeders.length === 1 ? "is" : "are"} earned whole, at the share lost with it.`;
  }
  const found = securedFor(account, accounts);
  const loan = found?.loan ?? null;
  if (found === null || loan === null) {
    return "It cannot be brought back.";
  }
  if (loan.secures !== account.id) {
    return "Its payments go with it.";
  }
  const what = found.asset.kind === "house" ? "mortgage" : "finance";
  return `Its ${what}, ${loan.name}, and the payments go with it.`;
}

// Whether an account is an asset with a dialog of its own, which edits
// it and the loan against it as one.
function hasDialog(account: Account): boolean {
  return account.kind === "car" || account.kind === "house";
}

// The asset an account is part of: a house or a car is its own, with
// the loan secured on it when there is one, and a loan secured on either
// is that asset's; any other account is part of none, and so is a loan
// whose asset is not listed, or is listed as an asset with no dialog,
// which opens as the account it is.
function securedFor(
  account: Account,
  accounts: readonly Account[],
): null | Secured {
  if (hasDialog(account)) {
    return {
      asset: account,
      loan: accounts.find((a) => a.secures === account.id) ?? null,
    };
  }
  const asset = accounts.find((a) => a.id === account.secures);
  return asset === undefined || !hasDialog(asset)
    ? null
    : { asset, loan: account };
}

// The row count beside a tab's label, in the micro-label face and faint.
function TabCount({ count }: { readonly count: number }): JSX.Element {
  return (
    <span className="label text-muted-foreground/60">{String(count)}</span>
  );
}
