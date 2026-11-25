"use client";

import type { JSX } from "react";

import { useState } from "react";

import type { CashAccount, NewPortfolioAccount } from "@/data/portfolio";
import type { Option } from "@/lib/options";

import { addPortfolioAccount } from "@/actions/portfolio";
import { FieldRow } from "@/components/app/atoms/field-row";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { useSender } from "@/hooks/use-sender";

export type AccountKind = "cash" | "securities";

interface PortfolioAccountDialogProps {
  readonly cashAccounts: readonly CashAccount[];
  readonly defaultCurrency: string;
  readonly kind: AccountKind;
  readonly onDismiss: () => void;
  readonly onSaved: (draft: NewPortfolioAccount) => void;
  readonly version: number;
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

// The dialog for appending a securities or cash account to the
// household's stored .portfolio file. A securities account pairs with
// an optional reference cash account (matching Portfolio Performance's
// PPortfolio, which carries no currency of its own), while a cash
// account takes a settlement currency. Selects are controlled so a
// vanished reference cash account clears cleanly after a stale refresh.
export function PortfolioAccountDialog({
  cashAccounts,
  defaultCurrency,
  kind,
  onDismiss,
  onSaved,
  version,
}: PortfolioAccountDialogProps): JSX.Element {
  const [accountKind, setAccountKind] = useState<AccountKind>(kind);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>(() =>
    initialCurrency(defaultCurrency),
  );
  const [referenceAccountId, setReferenceAccountId] = useState("");
  const [note, setNote] = useState("");
  const { isSending, send } = useSender();

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
  const effectiveReferenceId =
    selectedReference === undefined ? "" : selectedReference.id;

  function save(): void {
    const trimmedName = name.trim();
    const trimmedNote = note.trim();
    const extraNote = trimmedNote === "" ? {} : { note: trimmedNote };
    const draft: NewPortfolioAccount =
      accountKind === "cash"
        ? { currency, kind: "cash", name: trimmedName, ...extraNote }
        : {
            kind: "securities",
            name: trimmedName,
            ...extraNote,
            ...(effectiveReferenceId !== "" && {
              referenceAccountId: effectiveReferenceId,
            }),
          };
    send(async () => addPortfolioAccount(version, draft), {
      failure: "Account not saved",
      onAccepted: () => {
        onSaved(draft);
      },
      success: () => ({
        description:
          draft.kind === "cash"
            ? `${draft.name} (${draft.currency}) added to the portfolio file`
            : `${draft.name} added to the portfolio file`,
        title: "Account saved",
      }),
    });
  }

  return (
    <EditDialog
      canSave={name.trim() !== ""}
      eyebrow="New account"
      isSaving={isSending}
      isWide
      onDismiss={onDismiss}
      onSave={save}
      title={name.trim() || "Untitled account"}
    >
      <FieldRow layout="named">
        <TextField
          label="Name"
          maxLength={200}
          onValueChange={setName}
          placeholder="Brokerage ISA, Reserve cash…"
        />
        <SelectField
          label="Account type"
          onValueChange={setAccountKind}
          options={accountKindOptions}
          value={accountKind}
        />
      </FieldRow>
      {accountKind === "securities" ? (
        <SelectField
          hint={
            selectedReference === undefined
              ? undefined
              : `Trades settle in ${selectedReference.currency}`
          }
          key="reference"
          label="Reference cash account"
          onValueChange={setReferenceAccountId}
          options={referenceOptions}
          value={effectiveReferenceId}
        />
      ) : (
        <SelectField
          key="currency"
          label="Currency"
          onValueChange={setCurrency}
          options={currencyOptions}
          value={currency}
        />
      )}
      <TextField label="Note" maxLength={1000} onValueChange={setNote} />
    </EditDialog>
  );
}

// The file's base currency when the dialog offers it, or GBP otherwise.
function initialCurrency(currency: string): Currency {
  return currencies.find((code) => code === currency) ?? "GBP";
}
