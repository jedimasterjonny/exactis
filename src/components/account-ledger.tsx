"use client";

import type { JSX } from "react";

import { Info, Plus } from "lucide-react";
import { useState } from "react";

import type { Account, AccountKind, Cadence } from "@/data/accounts";

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
import { isAsset } from "@/data/accounts";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";

interface AccountLedgerProps {
  readonly accounts: readonly Account[];
}

// What the dialog holds while it is open. Flatter than an account: a
// contribution of nothing is a zero rather than an absence, and the rate
// sits beside the growth choice, reset to what it opened with when the
// choice changes, so the rate field always mounts showing what the draft
// holds.
interface Draft {
  readonly balance: number;
  readonly cadence: Cadence;
  readonly contribution: number;
  readonly growth: GrowthChoice;
  readonly kind: AccountKind;
  readonly name: string;
  readonly rate: number;
}

// An open dialog: the draft as it is, the draft as it opened, which the
// uncontrolled fields take as their defaults, and the row it edits, or
// null for a new account.
interface Entry {
  readonly draft: Draft;
  readonly index: null | number;
  readonly initial: Draft;
}

type Figure = "balance" | "contribution" | "rate";

type GrowthChoice = "fixed" | "plan";

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
// from the header's button or edits one from its row. Rows live in state
// and a save appends or writes back, so the tables reflect it until
// reload; a store replaces the state when there is one. The entry doubles
// as the dialog's open state, as the progress editor's point does, and the
// tab is controlled so a saved account can bring its own tab forward. The
// fields are uncontrolled and mount fresh with the entry's opening values
// each time the dialog opens, and the draft mirrors what they report.
export function AccountLedger({ accounts }: AccountLedgerProps): JSX.Element {
  const [rows, setRows] = useState(accounts);
  const [tab, setTab] = useState<Tab>("accounts");
  const [entry, setEntry] = useState<Entry | null>(null);
  const held = rows.filter((row) => !isAsset(row));
  const assets = rows.filter(isAsset);

  function amend(current: Entry, patch: Partial<Draft>): void {
    setEntry({ ...current, draft: { ...current.draft, ...patch } });
  }

  // The dialog opens only from a button, so the only change it can report
  // is a close: Cancel, Escape or a press outside.
  function dismiss(): void {
    setEntry(null);
  }

  // A row's pencil opens its account as it is, with its place in the rows
  // so a save writes back to it.
  function edit(account: Account): void {
    open(toDraft(account), rows.indexOf(account));
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

  function open(draft: Draft, index: null | number): void {
    setEntry({ draft, index, initial: draft });
  }

  function save(current: Entry): void {
    const account = toAccount(current.draft);
    setRows(
      current.index === null
        ? [...rows, account]
        : rows.map((row, index) => (index === current.index ? account : row)),
    );
    setTab(isAsset(account) ? "assets" : "accounts");
    setEntry(null);
    toast.add({
      description: account.name,
      title: current.index === null ? "Account added" : "Account updated",
      type: "success",
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
            <AccountTable accounts={held} onEdit={edit} />
            <Note>
              Allocation is set once at plan level and applied pro rata to every
              account.
            </Note>
          </TabsContent>
          <TabsContent className="grid gap-5" value="assets">
            <AccountTable accounts={assets} onEdit={edit} />
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
                {entry.index === null ? "New account" : "Edit account"}
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
                disabled={entry.draft.name.trim() === ""}
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

// A contribution of nothing is an absence on the account, and a growth
// choice becomes the account's growth with the rate only where it applies.
function toAccount(draft: Draft): Account {
  return {
    balance: draft.balance,
    ...(draft.contribution > 0 && {
      contribution: { amount: draft.contribution, cadence: draft.cadence },
    }),
    growth:
      draft.growth === "plan"
        ? { kind: "plan" }
        : { kind: "fixed", rate: draft.rate },
    kind: draft.kind,
    name: draft.name.trim(),
  };
}

// The reverse, for a row being edited: an absent contribution opens as
// nothing at the blank cadence, and a plan rate opens with no rate.
function toDraft(account: Account): Draft {
  return {
    balance: account.balance,
    cadence: account.contribution?.cadence ?? blank.cadence,
    contribution: account.contribution?.amount ?? blank.contribution,
    growth: account.growth.kind,
    kind: account.kind,
    name: account.name,
    rate: account.growth.kind === "fixed" ? account.growth.rate : blank.rate,
  };
}
