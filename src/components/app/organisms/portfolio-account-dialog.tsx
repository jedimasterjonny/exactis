"use client";

import type { JSX } from "react";

import { useState } from "react";

import type { CashAccount } from "@/data/portfolio";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";

export type AccountKind = "cash" | "securities";

export type NewPortfolioAccount =
  | {
      readonly currency: string;
      readonly kind: "cash";
      readonly name: string;
      readonly note?: string;
    }
  | {
      readonly kind: "securities";
      readonly name: string;
      readonly note?: string;
      readonly referenceAccountId?: string;
    };

interface PortfolioAccountDialogProps {
  readonly cashAccounts: readonly CashAccount[];
  readonly defaultCurrency: string;
  readonly kind: AccountKind;
  readonly onAdd: (draft: NewPortfolioAccount) => void;
  readonly onDismiss: () => void;
}

const accountKindOptions: readonly Option<AccountKind>[] = [
  { label: "Securities account", value: "securities" },
  { label: "Cash account", value: "cash" },
];

const currencies = ["GBP", "USD", "EUR"] as const;

type Currency = (typeof currencies)[number];

const currencyOptions: readonly Option<Currency>[] = currencies.map((code) => ({
  label: code,
  value: code,
}));

// The preview dialog for adding a securities or cash account to the
// Portfolio screen. A securities account pairs with an optional
// reference cash account (matching Portfolio Performance's PPortfolio,
// which carries no currency of its own), while a cash account takes a
// settlement currency. Mounted while open so uncontrolled fields start
// fresh on every opening.
export function PortfolioAccountDialog({
  cashAccounts,
  defaultCurrency,
  kind,
  onAdd,
  onDismiss,
}: PortfolioAccountDialogProps): JSX.Element {
  const [accountKind, setAccountKind] = useState<AccountKind>(kind);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>(() =>
    initialCurrency(defaultCurrency),
  );
  const [referenceAccountId, setReferenceAccountId] = useState("");
  const [note, setNote] = useState("");

  const referenceOptions: readonly Option<string>[] = [
    { label: "None", value: "" },
    ...cashAccounts.map((account) => ({
      label: `${account.name} (${account.currency})`,
      value: account.id,
    })),
  ];
  const selectedReference = cashAccounts.find(
    (account) => account.id === referenceAccountId,
  );

  function save(): void {
    const trimmedName = name.trim();
    const trimmedNote = note.trim();
    const extraNote = trimmedNote === "" ? {} : { note: trimmedNote };
    if (accountKind === "cash") {
      onAdd({ currency, kind: "cash", name: trimmedName, ...extraNote });
      return;
    }
    onAdd({
      kind: "securities",
      name: trimmedName,
      ...extraNote,
      ...(referenceAccountId !== "" && { referenceAccountId }),
    });
  }

  return (
    <EditDialog
      canSave={name.trim() !== ""}
      confirm="Add preview"
      eyebrow="New account"
      isWide
      onDismiss={onDismiss}
      onSave={save}
      title={name.trim() || "Untitled account"}
    >
      <FieldRow layout="named">
        <TextField
          label="Name"
          onValueChange={setName}
          placeholder="Brokerage ISA, Reserve cash…"
        />
        <SelectField
          defaultValue={accountKind}
          label="Account type"
          onValueChange={setAccountKind}
          options={accountKindOptions}
        />
      </FieldRow>
      {accountKind === "securities" ? (
        <SelectField
          defaultValue={referenceAccountId}
          hint={
            selectedReference === undefined
              ? undefined
              : `Trades settle in ${selectedReference.currency}`
          }
          key="reference"
          label="Reference cash account"
          onValueChange={setReferenceAccountId}
          options={referenceOptions}
        />
      ) : (
        <SelectField
          defaultValue={currency}
          key="currency"
          label="Currency"
          onValueChange={setCurrency}
          options={currencyOptions}
        />
      )}
      <TextField label="Note" onValueChange={setNote} />
      <Note>
        Shown in this view only. Changes are not saved to the file yet.
      </Note>
    </EditDialog>
  );
}

// The file's base currency when the dialog offers it, or GBP otherwise.
function initialCurrency(currency: string): Currency {
  return currencies.find((code) => code === currency) ?? "GBP";
}
