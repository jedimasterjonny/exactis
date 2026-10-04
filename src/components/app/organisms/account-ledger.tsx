"use client";

import type { JSX } from "react";

import { CarFront, HousePlus, Plus } from "lucide-react";
import { useOptimistic, useState } from "react";

import type { Account, AccountKind } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";
import type { Secured } from "@/data/secured";
import type { PlanMonth } from "@/lib/loans";

import { placeAccountsInOrder, removeAccount } from "@/actions/accounts";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { SectionCard } from "@/components/app/molecules/section-card";
import { AccountDialog } from "@/components/app/organisms/account-dialog";
import { BalanceSheet } from "@/components/app/organisms/balance-sheet";
import { CarDialog } from "@/components/app/organisms/car-dialog";
import { HouseDialog } from "@/components/app/organisms/house-dialog";
import { MoneyFlow } from "@/components/app/organisms/money-flow";
import { OwnerList } from "@/components/app/organisms/owner-list";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { isAsset } from "@/data/accounts";
import { useRemover } from "@/hooks/use-remover";
import { useSender } from "@/hooks/use-sender";
import { feedersOf, listed } from "@/lib/feeders";
import { formatGbp, formatPercent } from "@/lib/money";
import { accountsAndAssets, subsectionLabel } from "@/lib/nav";

interface AccountLedgerProps {
  readonly accounts: readonly Account[];
  readonly expenses: readonly ExpenseLine[];
  readonly lines: readonly IncomeLine[];
  readonly owners: readonly Owner[];
  readonly plan: Plan;
}

// What the account dialog is open on: a new account of the kind it
// opens as, or one to edit.
type AccountOpening = Account | AccountKind;

// What the car or house dialog is open on: a new one, or an asset to
// edit with the loan secured on it. One type for both, since a house
// and a car are the same shape to the ledger.
type AssetOpening = "new" | Secured;

// The accounts screen's ledger and the three dialogs it edits through,
// in the body beneath the header, which is the page's, since the header
// reads the month and nothing the ledger holds.
// The rows are the store's, handed down by the page, and a save goes to
// the store and comes back with the page re-read, so the sheet reflects
// it without the ledger holding rows of its own. The one thing the
// ledger holds is the order while a move is on its way to the store,
// since a row moved into place has to stay there rather than spring
// back until the page re-reads; the optimistic order is the page's again
// once it does. Everything the household owns and owes is one balance
// sheet, so it is read at once and a save lands in view wherever it
// lands. A dialog is open for as long as it is mounted, so what it is
// open on doubles as its open state: the sheet's buttons open the
// dialogs on a new account, house, car or debt, and a row opens the
// account as it is, unless it is a house or a car, or the loan secured
// on one, which shares its entry with the other and opens with it, so
// an edit writes both. The Delete in the dialog a row opens asks
// through the confirm dialog before the account goes, saying what goes
// with it, since an asset takes its loan and the loan's payments, and
// what stops, since a salary feeding a pension stops when the pension
// goes; the income lines are handed down for that and for the treatment
// such a pension is held to, so both can name the salaries. Beneath the
// sheet, the month's money is drawn down the savings in the order they
// are paid, which is where the order is set; the flow is handed every
// account in the order the ledger holds, so a move shows in it at once,
// both schedules, which it works the month out from, and the plan, for
// the month it starts in. The expense lines are handed to the sheet as
// well, to say when each loan's payments clear it, and the plan for the
// rate the savings grow at. The owners close the screen, a section of
// their own beneath the flow, and are handed to the sheet and the flow,
// to say whose each wrapper is, and to the account dialog, to choose
// it.
export function AccountLedger({
  accounts,
  expenses,
  lines,
  owners,
  plan,
}: AccountLedgerProps): JSX.Element {
  const [account, setAccount] = useState<AccountOpening | null>(null);
  const [house, setHouse] = useState<AssetOpening | null>(null);
  const [car, setCar] = useState<AssetOpening | null>(null);
  const { ask, doomed, questionOf } = useRemover<Account>({
    describe: (account) => account.name,
    noun: "Account",
    remove: removeAccount,
  });
  const { send } = useSender();
  const [order, placeOptimistically] = useOptimistic(accounts);
  // Each asset with the loan it shares an entry with, and the accounts
  // paid out of the month: every one but an asset, a paired loan among
  // them. The savings are them less the paired loans, which are read
  // beside their assets instead, and less the debts left, which are
  // secured on nothing with an entry and are listed as other debts. The
  // savings are the order of payment too, in the order they are paid,
  // since a debt is paid before any of them wherever it is listed and
  // has no place in the order to set.
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

  // Where the owners sit among the sections: after the money's flow when
  // it is drawn, which it is not for no savings.
  const ownersPlace = savings.length === 0 ? 2 : 3;

  // The month the plan starts in as the loan maths counts from it, for
  // the two dialogs that let a loan's end be picked as a date.
  const starts: PlanMonth = { from: plan.from, month: plan.month };

  // Closes whichever dialog is open, there being only ever one, on a
  // dismiss, a save or a Delete alike.
  function close(): void {
    setAccount(null);
    setHouse(null);
    setCar(null);
  }

  // A dialog's Delete asks about the account the dialog is open on, or
  // for a house or a car its own account, which takes the loan with it. Whichever dialog it was closes first, so the
  // question stands alone and a cancel lands back on the screen rather
  // than on the draft of what was nearly deleted.
  function drop(account: Account): void {
    close();
    ask(account);
  }

  // A row opens its account as it is, unless the account is a house or
  // a car, which opens with the loan secured on it.
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
  // A store that refuses the order, as it does once another save has
  // added or taken away an account the card still lists, or fails,
  // leaves the page's order standing and says why under a toast.
  function move(account: Account, target: Account): void {
    const at = (id: number): number => order.findIndex((a) => a.id === id);
    const without = order.filter((a) => a.id !== account.id);
    const place =
      without.findIndex((a) => a.id === target.id) +
      (at(account.id) < at(target.id) ? 1 : 0);
    const next = without.toSpliced(place, 0, account);
    send(
      async () => {
        placeOptimistically(next);
        return placeAccountsInOrder(next.map((a) => a.id));
      },
      { failure: "Order not saved" },
    );
  }

  return (
    <>
      <SectionCard
        actions={
          <>
            <Button
              onClick={() => {
                setAccount("tax-deferred");
              }}
              size="sm"
            >
              <Plus aria-hidden />
              Add account
            </Button>
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
        caption={`Savings grow at the plan rate, ${formatPercent(plan.rate)}, unless they say otherwise, under one allocation applied pro rata to every account.`}
        label={subsectionLabel(accountsAndAssets, 1)}
        title="Balance sheet"
      >
        <CardContent>
          <BalanceSheet
            assets={assets}
            debts={debts}
            expenses={expenses}
            onAddDebt={() => {
              setAccount("debt");
            }}
            onEdit={edit}
            owners={owners}
            savings={savings}
          />
        </CardContent>
      </SectionCard>
      <MoneyFlow
        accounts={order}
        label={subsectionLabel(accountsAndAssets, 2)}
        onMove={move}
        owners={owners}
        plan={plan}
        savings={savings}
        schedule={{ expenses, income: lines }}
      />
      <OwnerList
        accounts={order}
        label={subsectionLabel(accountsAndAssets, ownersPlace)}
        owners={owners}
      />
      {account !== null && (
        <AccountDialog
          {...(typeof account === "string"
            ? { account: null, kind: account }
            : { account })}
          lines={lines}
          onDelete={drop}
          onDismiss={close}
          onSaved={close}
          owners={owners}
        />
      )}
      {doomed !== null && (
        <ConfirmDialog {...questionOf(doomed)}>
          {goesWith(doomed, order, lines)}
        </ConfirmDialog>
      )}
      {house !== null && (
        <HouseDialog
          house={house === "new" ? null : house}
          onDelete={drop}
          onDismiss={close}
          onSaved={close}
          plan={starts}
        />
      )}
      {car !== null && (
        <CarDialog
          car={car === "new" ? null : car}
          onDelete={drop}
          onDismiss={close}
          onSaved={close}
          plan={starts}
        />
      )}
    </>
  );
}

// What goes with an account when it is deleted, for the dialog to say
// in plain words: a pension takes the sacrifice of every salary feeding
// it, which is paid as salary from then on, since the store stops the
// salaries before the pension goes and the share typed against each is
// lost with it; a house or a car takes the loan secured on it and that
// loan's payments; and any other account, or an asset with no loan,
// goes alone, taking its balance off the sheet for good.
function goesWith(
  account: Account,
  accounts: readonly Account[],
  lines: readonly IncomeLine[],
): string {
  const feeders = feedersOf(account.id, lines);
  if (feeders.length > 0) {
    return `${listed.format(feeders)} ${feeders.length === 1 ? "stops" : "stop"} sacrificing into it, and ${feeders.length === 1 ? "pays that share" : "pay those shares"} as salary instead.`;
  }
  const loan = securedFor(account, accounts)?.loan ?? null;
  if (loan === null) {
    return `Its ${formatGbp(account.balance)} leaves the balance sheet, and it cannot be brought back.`;
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
