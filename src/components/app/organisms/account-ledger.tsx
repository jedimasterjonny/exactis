"use client";

import type { JSX } from "react";

import { CarFront, HousePlus, Plus } from "lucide-react";
import { startTransition, useOptimistic, useState } from "react";

import type { Account } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Month } from "@/data/schedule";
import type { Secured } from "@/data/secured";
import type { PlanMonth } from "@/lib/loans";

import { placeAccountsInOrder, removeAccount } from "@/actions/accounts";
import { Note } from "@/components/app/atoms/note";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { AccountDialog } from "@/components/app/organisms/account-dialog";
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
import { isAsset } from "@/data/accounts";
import { useRemover } from "@/hooks/use-remover";
import { counted } from "@/lib/count";
import { feedersOf, listed } from "@/lib/feeders";
import { runsIn } from "@/lib/lines";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";

interface AccountLedgerProps {
  readonly accounts: readonly Account[];
  readonly at: Month;
  readonly lines: readonly IncomeLine[];
}

// What the account dialog is open on: a new account, or one to edit.
type AccountOpening = "new" | Account;

// What the car or house dialog is open on: a new one, or an asset to
// edit with the loan secured on it. One type for both, since a house
// and a car are the same shape to the ledger.
type AssetOpening = "new" | Secured;
type Tab = "accounts" | "assets";

// The accounts screen's ledger and the three dialogs it edits through.
// The rows are the store's, handed down by the page, and a save goes to
// the store and comes back with the page re-read, so the tables reflect
// it without the ledger holding rows of its own. The one thing the
// ledger holds is the order while a move is on its way to the store,
// since a row dragged into place has to stay there rather than spring
// back until the page re-reads; the optimistic order is the page's again
// once it does. A dialog is open for as long as it is mounted, so what
// it is open on doubles as its open state, and the tab is controlled so
// a saved account, house or car can bring its own tab forward as its
// dialog reports it: the header's three buttons open each of them on a
// new one, and a row's pencil opens the account as it is, unless it is a
// house or a car, or the loan against either, which opens on that asset,
// so an edit from either side writes both. A row's bin asks through the
// confirm dialog before the account goes, saying what goes with it,
// since an asset takes its loan and a loan its payments, and what stops,
// since a salary feeding a pension stops when the pension goes; the
// income lines are handed down for that, for the treatment such a
// pension is held to, so both can name the salaries, and for the
// accounts' table to write what the salaries feed each pension: the
// table is handed the lines running in the month the plan is read in,
// which the page hands down, so a salary that has ended or is yet to
// start lands nothing on the row, while the dialog and the confirm
// take every line, since the link stands whether or not it runs.
export function AccountLedger({
  accounts,
  at,
  lines,
}: AccountLedgerProps): JSX.Element {
  const [tab, setTab] = useState<Tab>("accounts");
  const [account, setAccount] = useState<AccountOpening | null>(null);
  const [house, setHouse] = useState<AssetOpening | null>(null);
  const [car, setCar] = useState<AssetOpening | null>(null);
  const { ask, cancel, confirm, doomed, isRemoving } = useRemover<Account>({
    describe: (account) => account.name,
    noun: "Account",
    remove: removeAccount,
  });
  const [order, placeOptimistically] = useOptimistic(
    accounts,
    (_current: readonly Account[], next: readonly Account[]) => next,
  );
  const held = order.filter((account) => !isAsset(account));
  const assets = order.filter(isAsset);
  const running = lines.filter((line) => runsIn(line, at));

  // The month the plan is read in as the loan maths counts from it, for
  // the two dialogs that let a loan's end be picked as a date.
  const plan: PlanMonth = { from: at.year, month: at.month };

  // A row's pencil opens its account as it is, unless the account is a
  // house or a car, or the loan against one, which open as the asset
  // they are part of.
  function edit(account: Account): void {
    const found = securedFor(account, order);
    if (found === null) {
      setAccount(account);
    } else if (found.asset.kind === "car") {
      setCar(found);
    } else {
      setHouse(found);
    }
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
                setAccount("new");
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
              lines={running}
              onDelete={ask}
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
              onDelete={ask}
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
      {account !== null && (
        <AccountDialog
          account={account === "new" ? null : account}
          lines={lines}
          onDismiss={() => {
            setAccount(null);
          }}
          onSaved={(saved) => {
            // A saved account brings its own tab forward, in the
            // transition the dialog closes in, so the tab and the
            // closed dialog land together.
            setAccount(null);
            setTab(isAsset(saved) ? "assets" : "accounts");
          }}
        />
      )}
      {doomed !== null && (
        <ConfirmDialog
          isBusy={isRemoving}
          onCancel={cancel}
          onConfirm={() => {
            confirm(doomed);
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
          plan={plan}
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
          plan={plan}
        />
      )}
    </>
  );
}

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
  const feeders = feedersOf(account.id, lines);
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
