"use client";

import type { JSX } from "react";

import { Plus } from "lucide-react";
import { startTransition, useOptimistic, useState, useTransition } from "react";

import type {
  Account,
  AccountKind,
  AccountValues,
  Funding,
} from "@/data/accounts";

import {
  placeAccountsInOrder,
  saveAccount,
} from "@/app/(app)/accounts/actions";
import { Note } from "@/components/app/atoms/note";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { MoneyField } from "@/components/app/molecules/money-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { AccountTable } from "@/components/app/organisms/account-table";
import { Button } from "@/components/kit/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/kit/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/kit/tabs";
import { toast } from "@/components/kit/toast";
import { allowanceOf, isAsset, toValues } from "@/data/accounts";
import { formatGbp } from "@/lib/money";
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

const cadences = [
  { label: "A year", value: "year" },
  { label: "A month", value: "month" },
] as const;

const fundings = [
  { label: "A fixed sum", value: "fixed" },
  { label: "Spare money", value: "spare" },
] as const;

const growths = [
  { label: "Plan rate", value: "plan" },
  { label: "Fixed rate", value: "fixed" },
] as const;

const kinds = [
  { label: "Tax-deferred", value: "tax-deferred" },
  { label: "Tax-free", value: "tax-free" },
  { label: "Cash", value: "cash" },
  { label: "Real asset", value: "real-asset" },
  { label: "Debt", value: "debt" },
] as const;

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
// its own tab forward. The fields are uncontrolled and mount fresh with
// the entry's opening values each time the dialog opens, and the draft
// mirrors what they report.
export function AccountLedger({ accounts }: AccountLedgerProps): JSX.Element {
  const [tab, setTab] = useState<Tab>("accounts");
  const [entry, setEntry] = useState<Entry | null>(null);
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

  // The dialog opens only from a button, so the only change it can report
  // is a close: Cancel, Escape or a press outside.
  function dismiss(): void {
    setEntry(null);
  }

  // A row's pencil opens its account as it is, with its id so a save
  // writes back to it.
  function edit(account: Account): void {
    open(toValues(account), account.id);
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

  // The treatment choice: an asset is paid only a fixed sum, so the
  // contribution choice leaves with it and an account paid the spare
  // money is paid a fixed sum instead, as it opened. The choice comes
  // back when a wrapper or cash is chosen again, as the account opened
  // with it, which is what the choice mounts showing. A change that
  // stays on one side leaves the choice where it is.
  function treat(current: Entry, kind: AccountKind): void {
    const willBeAsset = isAsset({ kind });
    if (willBeAsset && current.draft.funding === "spare") {
      amend(current, { kind, ...fundedBy(current, "fixed") });
    } else if (
      !willBeAsset &&
      isAsset(current.draft) &&
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
          <Button
            onClick={() => {
              open(blank, null);
            }}
            size="sm"
          >
            <Plus aria-hidden />
            Add account
          </Button>
        }
        label={sectionLabel(accountsAndAssets)}
        title="Accounts & assets"
      >
        {`${String(held.length)} accounts · ${String(assets.length)} assets`}
      </ScreenHeader>
      <div className="grid gap-5 p-8">
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
              A loan is listed against the asset it secures. The progress points
              reconcile the two as total assets and asset loans.
            </Note>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog onOpenChange={dismiss} open={entry !== null}>
        {entry !== null && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <span className="label text-brand">
                {entry.id === null ? "New account" : "Edit account"}
              </span>
              <DialogTitle>
                {entry.draft.name.trim() || "Untitled account"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-[1.4fr_1fr] gap-4">
                <TextField
                  defaultValue={entry.initial.name}
                  label="Name"
                  onValueChange={(name) => {
                    amend(entry, { name });
                  }}
                  placeholder="Lifetime ISA, car, loan…"
                />
                <SelectField
                  defaultValue={entry.initial.kind}
                  label="Treatment"
                  onValueChange={(kind) => {
                    treat(entry, kind);
                  }}
                  options={kinds}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <MoneyField
                  defaultValue={entry.initial.balance}
                  hint="A debt's is negative"
                  label="Balance"
                  onValueCommitted={(balance) => {
                    amend(entry, { balance });
                  }}
                />
                {!isAsset(entry.draft) && (
                  <SelectField
                    defaultValue={entry.initial.funding}
                    hint="Spare money is what a month's income leaves after the expenses and every fixed sum"
                    label="Contribution"
                    onValueChange={(funding) => {
                      fund(entry, funding);
                    }}
                    options={fundings}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {entry.draft.funding === "fixed" ? (
                  <>
                    <MoneyField
                      defaultValue={entry.initial.contribution}
                      hint="Leave at nothing for none"
                      // Keyed apart from the cap, which takes its place:
                      // the fragment is unwrapped and the two would be
                      // one field, keeping what was typed into the other.
                      key="contribution"
                      label="Amount"
                      onValueCommitted={(contribution) => {
                        amend(entry, { contribution });
                      }}
                    />
                    <SelectField
                      defaultValue={entry.initial.cadence}
                      label="Cadence"
                      onValueChange={(cadence) => {
                        amend(entry, { cadence });
                      }}
                      options={cadences}
                    />
                  </>
                ) : (
                  <MoneyField
                    defaultValue={entry.initial.cap}
                    hint={capHint(entry.draft.kind)}
                    key="cap"
                    label="Cap, a year"
                    onValueCommitted={(cap) => {
                      amend(entry, { cap });
                    }}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  defaultValue={entry.initial.growth}
                  hint="The plan rate is set on the assumptions screen"
                  label="Growth"
                  onValueChange={(growth) => {
                    amend(entry, { growth, rate: entry.initial.rate });
                  }}
                  options={growths}
                />
                {entry.draft.growth === "fixed" && (
                  <RateField
                    defaultValue={entry.initial.rate}
                    hint="Nominal, a year"
                    label="Rate"
                    onValueCommitted={(rate) => {
                      amend(entry, { rate });
                    }}
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button size="sm" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                disabled={isSaving || entry.draft.name.trim() === ""}
                onClick={() => {
                  save(entry);
                }}
                size="sm"
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

// What the cap field says a cap of nothing means: the kind's allowance,
// or no cap at all for cash.
function capHint(kind: AccountKind): string {
  const allowance = allowanceOf(kind);
  return allowance === null
    ? "Leave at nothing for no cap"
    : `Leave at nothing for the ${formatGbp(allowance)} allowance`;
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

// The row count beside a tab's label, in the micro-label face and faint.
function TabCount({ count }: { readonly count: number }): JSX.Element {
  return (
    <span className="label text-muted-foreground/60">{String(count)}</span>
  );
}
