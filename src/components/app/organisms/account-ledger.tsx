"use client";

import type { JSX } from "react";

import { CarFront, HousePlus, Plus } from "lucide-react";
import { startTransition, useOptimistic, useState } from "react";

import type { Account } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Month } from "@/data/schedule";
import type { Secured } from "@/data/secured";
import type { PlanMonth } from "@/lib/loans";

import { placeAccountsInOrder, removeAccount } from "@/actions/accounts";
import { Note } from "@/components/app/atoms/note";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { SectionCard } from "@/components/app/molecules/section-card";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { AccountDialog } from "@/components/app/organisms/account-dialog";
import { AccountTable } from "@/components/app/organisms/account-table";
import { AssetTable } from "@/components/app/organisms/asset-table";
import { CarDialog } from "@/components/app/organisms/car-dialog";
import { HouseDialog } from "@/components/app/organisms/house-dialog";
import { OwnerList } from "@/components/app/organisms/owner-list";
import { PaymentOrder } from "@/components/app/organisms/payment-order";
import { Button } from "@/components/kit/button";
import { isAsset } from "@/data/accounts";
import { useRemover } from "@/hooks/use-remover";
import { counted } from "@/lib/count";
import { feedersOf, listed } from "@/lib/feeders";
import { equityOf, paidMonthly } from "@/lib/ledger";
import { runsIn } from "@/lib/lines";
import { formatGbp } from "@/lib/money";
import { monthName } from "@/lib/months";
import { accountsAndAssets, sectionLabel, subsectionLabel } from "@/lib/nav";

interface AccountLedgerProps {
  readonly accounts: readonly Account[];
  readonly at: Month;
  readonly lines: readonly IncomeLine[];
  readonly owners: readonly Owner[];
}

// What the account dialog is open on: a new account, or one to edit.
type AccountOpening = "new" | Account;

// What the car or house dialog is open on: a new one, or an asset to
// edit with the loan secured on it. One type for both, since a house
// and a car are the same shape to the ledger.
type AssetOpening = "new" | Secured;

// The accounts screen's ledger and the three dialogs it edits through.
// The rows are the store's, handed down by the page, and a save goes to
// the store and comes back with the page re-read, so the tables reflect
// it without the ledger holding rows of its own. The one thing the
// ledger holds is the order while a move is on its way to the store,
// since a row dragged into place has to stay there rather than spring
// back until the page re-reads; the optimistic order is the page's again
// once it does. The accounts and the assets are two sections of the
// screen rather than two tabs, so both are read at once and a save
// lands in view wherever it lands. A dialog is open for as long as it
// is mounted, so what it is open on doubles as its open state: each
// section's buttons open the dialogs it lists on a new one, and a row's
// pencil opens the account as it is, unless it is a house or a car,
// which shares its row with the loan secured on it and opens with it, so
// an edit writes both. A row's bin asks through the confirm dialog
// before the account goes, saying what goes with it, since an asset
// takes its loan and the loan's payments, and what stops,
// since a salary feeding a pension stops when the pension goes; the
// income lines are handed down for that, for the treatment such a
// pension is held to, so both can name the salaries, and for the
// accounts' table to write what the salaries feed each pension: the
// table is handed the lines running in the month the plan is read in,
// which the page hands down, so a salary that has ended or is yet to
// start lands nothing on the row, while the dialog and the confirm
// take every line, since the link stands whether or not it runs. The
// owners close the screen, a section of their own beneath the order,
// and are handed to the savings' table, to say whose each wrapper is,
// and to the account dialog, to choose it.
export function AccountLedger({
  accounts,
  at,
  lines,
  owners,
}: AccountLedgerProps): JSX.Element {
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
  // Each asset with the loan it shares a row with, and the accounts paid
  // out of the month, in the order they are paid: every one but an
  // asset, a paired loan among them, since its payments are met in the
  // order as any other's are. The savings section lists them less the
  // paired loans, which are read on their assets' rows instead, and less
  // the debts left, which are secured on nothing with a row and have a
  // section of their own, drawn only when there is one.
  const assets = order
    .filter(isAsset)
    .map((asset) => securedFor(asset, order) ?? { asset, loan: null });
  const paid = order.filter((account) => !isAsset(account));
  const paired = new Set(
    assets.flatMap(({ loan }) => (loan === null ? [] : [loan.id])),
  );
  const held = paid.filter((account) => !paired.has(account.id));
  const savings = held.filter((account) => account.kind !== "debt");
  const debts = held.filter((account) => account.kind === "debt");
  const running = lines.filter((line) => runsIn(line, at));

  // The figures the screen opens on, read off the rows the sections
  // list: what every balance comes to, a debt's taking away, which is
  // the net worth the plan starts from; the savings among them; the
  // equity the assets hold once their loans are paid, of what they are
  // worth; and what the month pays in, every fixed sum and sacrifice
  // the salaries running then make, the spare money's take being the
  // month's to decide.
  const worth = order.reduce((sum, account) => sum + account.balance, 0);
  const saved = savings.reduce((sum, account) => sum + account.balance, 0);
  const owned = assets.reduce((sum, { asset }) => sum + asset.balance, 0);
  const equity = assets.reduce((sum, pair) => sum + equityOf(pair), 0);
  const paidIn = order.reduce(
    (sum, account) => sum + paidMonthly(account, running),
    0,
  );

  // Where the order and the owners sit among the sections: the order
  // after the debts when there are any, and the owners after the order
  // when it is drawn, which it is not for fewer than two accounts.
  const orderPlace = debts.length > 0 ? 4 : 3;
  const ownersPlace = paid.length < 2 ? orderPlace : orderPlace + 1;

  // The month the plan is read in as the loan maths counts from it, for
  // the two dialogs that let a loan's end be picked as a date.
  const plan: PlanMonth = { from: at.year, month: at.month };

  // A row's pencil opens its account as it is, unless the account is a
  // house or a car, which opens with the loan secured on it.
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
  // it when moved up, after it when moved down, so the accounts are
  // paid and drawn in the order the card now shows them. The order shows
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
        label={sectionLabel(accountsAndAssets)}
        title="Accounts & assets"
      >
        {`Starting balances for the plan · ${monthName(at.month, "long")} ${String(at.year)}`}
      </ScreenHeader>
      <ScreenBody>
        <TileGrid>
          <StatTile
            caption="The balances the plan starts from"
            label="Starting net worth"
            tone="inverse"
            value={formatGbp(worth)}
          />
          <StatTile
            caption={counted(savings.length, "account")}
            label="Savings"
            value={formatGbp(saved)}
          />
          <StatTile
            caption={`${formatGbp(owned)} owned · ${formatGbp(owned - equity)} owed`}
            label="Equity"
            value={formatGbp(equity)}
          />
          <StatTile
            caption="Sacrifice and fixed payments"
            label="Paid in"
            unit="/ mo"
            value={formatGbp(paidIn)}
          />
        </TileGrid>
        <SectionCard
          actions={
            <Button
              onClick={() => {
                setAccount("new");
              }}
              size="sm"
            >
              <Plus aria-hidden />
              Add account
            </Button>
          }
          className="pb-0"
          label={subsectionLabel(accountsAndAssets, 1)}
          title="Savings and investments"
        >
          <AccountTable
            accounts={savings}
            emptyDescription="Add a pension, an ISA or a savings account to see it listed here."
            emptyTitle="No accounts yet"
            lines={running}
            onDelete={ask}
            onEdit={edit}
            owners={owners}
          />
        </SectionCard>
        <Note>
          Allocation is set once at plan level and applied pro rata to every
          account.
        </Note>
        <SectionCard
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
            </>
          }
          className="pb-0"
          label={subsectionLabel(accountsAndAssets, 2)}
          title="Property and vehicles"
        >
          <AssetTable assets={assets} onDelete={ask} onEdit={edit} />
        </SectionCard>
        {debts.length > 0 && (
          <SectionCard
            className="pb-0"
            label={subsectionLabel(accountsAndAssets, 3)}
            title="Other debts"
          >
            <AccountTable
              accounts={debts}
              emptyDescription="A debt secured on nothing, a card or an overdraft, is listed here."
              emptyTitle="No other debts"
              onDelete={ask}
              onEdit={edit}
            />
          </SectionCard>
        )}
        <PaymentOrder
          accounts={paid}
          label={subsectionLabel(accountsAndAssets, orderPlace)}
          onMove={move}
        />
        <OwnerList
          accounts={order}
          label={subsectionLabel(accountsAndAssets, ownersPlace)}
          owners={owners}
        />
      </ScreenBody>
      {account !== null && (
        <AccountDialog
          account={account === "new" ? null : account}
          lines={lines}
          onDismiss={() => {
            setAccount(null);
          }}
          onSaved={() => {
            setAccount(null);
          }}
          owners={owners}
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
// and any other account, or an asset with no loan, goes alone.
function goesWith(
  account: Account,
  accounts: readonly Account[],
  lines: readonly IncomeLine[],
): string {
  const feeders = feedersOf(account.id, lines);
  if (feeders.length > 0) {
    return `${listed.format(feeders)} ${feeders.length === 1 ? "stops" : "stop"} sacrificing into it and ${feeders.length === 1 ? "is" : "are"} earned whole, at the share lost with it.`;
  }
  const loan = securedFor(account, accounts)?.loan ?? null;
  if (loan === null) {
    return "It cannot be brought back.";
  }
  const what = account.kind === "house" ? "mortgage" : "finance";
  return `Its ${what}, ${loan.name}, and the payments go with it.`;
}

// Whether an account is an asset with a dialog of its own, which edits
// it and the loan against it as one.
function hasDialog(account: Account): boolean {
  return account.kind === "car" || account.kind === "house";
}

// The pair a house or a car is, with the loan secured on it when there
// is one, which its dialog edits as one and its row shows as one; any
// other account is part of none, and so is a loan secured on an asset
// with no dialog, or on one not listed, which is listed and opens as the
// account it is. A loan secured on a house or a car is never asked
// about, since it has no row of its own to ask from: the store holds an
// asset to one loan, so every such loan is on its asset's row.
function securedFor(
  account: Account,
  accounts: readonly Account[],
): null | Secured {
  return hasDialog(account)
    ? {
        asset: account,
        loan: accounts.find((a) => a.secures === account.id) ?? null,
      }
    : null;
}
