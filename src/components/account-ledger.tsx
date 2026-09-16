"use client";

import type { JSX } from "react";

import { Info, Plus } from "lucide-react";
import { startTransition, useState, useTransition } from "react";

import type { Account, AccountValues } from "@/data/accounts";

import { saveAccount } from "@/app/(app)/accounts/actions";
import { AccountTable } from "@/components/account-table";
import { MoneyField } from "@/components/money-field";
import { RateField } from "@/components/rate-field";
import { ScreenHeader } from "@/components/screen-header";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { isAsset, toValues } from "@/data/accounts";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";

interface AccountLedgerProps {
  readonly accounts: readonly Account[];
}

// What the dialog holds while it is open: the account's values, flat, so
// the rate sits beside the growth choice, reset to what it opened with
// when the choice changes, and the rate field always mounts showing what
// the draft holds.
type Draft = AccountValues;

// An open dialog: the draft as it is, the draft as it opened, which the
// uncontrolled fields take as their defaults, and the id of the account it
// edits, or null for a new one.
interface Entry {
  readonly draft: Draft;
  readonly id: null | number;
  readonly initial: Draft;
}

type Figure = "balance" | "contribution" | "rate";

type Tab = "accounts" | "assets";

const blank: Draft = {
  balance: 0,
  cadence: "year",
  contribution: 0,
  growth: "plan",
  kind: "tax-deferred",
  name: "",
  rate: 0,
};

const cadences = [
  { label: "A year", value: "year" },
  { label: "A month", value: "month" },
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
// holding rows of its own. The entry doubles as the dialog's open state,
// as the progress editor's point does, and the tab is controlled so a
// saved account can bring its own tab forward. The fields are uncontrolled
// and mount fresh with the entry's opening values each time the dialog
// opens, and the draft mirrors what they report.
export function AccountLedger({ accounts }: AccountLedgerProps): JSX.Element {
  const [tab, setTab] = useState<Tab>("accounts");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [isSaving, startSaving] = useTransition();
  const held = accounts.filter((account) => !isAsset(account));
  const assets = accounts.filter(isAsset);

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

  // A figure field commits null when cleared, and a cleared figure is
  // left as it was rather than written as nothing.
  function figure(current: Entry, key: Figure): (value: null | number) => void {
    return (value) => {
      if (value !== null) {
        amend(current, { [key]: value });
      }
    };
  }

  function open(draft: Draft, id: null | number): void {
    setEntry({ draft, id, initial: draft });
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
            />
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
                    amend(entry, { kind });
                  }}
                  options={kinds}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <MoneyField
                  defaultValue={entry.initial.balance}
                  hint="A debt's is negative"
                  label="Balance"
                  onValueCommitted={figure(entry, "balance")}
                />
                <MoneyField
                  defaultValue={entry.initial.contribution}
                  hint="Leave at nothing for none"
                  label="Contribution"
                  onValueCommitted={figure(entry, "contribution")}
                />
                <SelectField
                  defaultValue={entry.initial.cadence}
                  label="Cadence"
                  onValueChange={(cadence) => {
                    amend(entry, { cadence });
                  }}
                  options={cadences}
                />
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
                    onValueCommitted={figure(entry, "rate")}
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

// The muted note that closes a screen's section, as on the progress screen.
function Note({ children }: { readonly children: string }): JSX.Element {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

// The row count beside a tab's label, in the micro-label face and faint.
function TabCount({ count }: { readonly count: number }): JSX.Element {
  return (
    <span className="label text-muted-foreground/60">{String(count)}</span>
  );
}
