"use client";

import type { JSX } from "react";

import { Archive } from "lucide-react";
import { useState } from "react";

import type {
  CashAccount,
  EditPortfolioAccount,
  NewPortfolioAccount,
  SecuritiesAccount,
} from "@/data/portfolio";
import type { Option } from "@/lib/options";

import { addPortfolioAccount, editPortfolioAccount } from "@/actions/portfolio";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { LabelledSwitch } from "@/components/app/molecules/labelled-switch";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { withSyncNote } from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { counted } from "@/lib/count";

export type AccountKind = "cash" | "securities";

export type EditingPortfolioAccount =
  | { readonly account: CashAccount; readonly kind: "cash" }
  | { readonly account: SecuritiesAccount; readonly kind: "securities" };

interface PortfolioAccountDialogProps {
  readonly cashAccounts: readonly CashAccount[];
  readonly defaultCurrency: string;
  readonly editing?: EditingPortfolioAccount;
  readonly kind: AccountKind;
  readonly onDelete?: () => void;
  readonly onDismiss: () => void;
  readonly onSaved: (outcome: {
    readonly isRetired: boolean;
    readonly version: number;
  }) => void;
  readonly securitiesAccounts?: readonly SecuritiesAccount[];
  readonly version: number;
}

const accountKindOptions: readonly Option<AccountKind>[] = [
  { label: "Securities account", value: "securities" },
  { label: "Cash account", value: "cash" },
];

const currencies = ["GBP", "USD", "EUR"] as const;

const listFormat = new Intl.ListFormat("en-GB");

// The dialog for adding or editing a securities or cash account in the
// household's stored .portfolio file. In create mode the user may switch
// between securities and cash accounts; in edit mode kind and cash
// currency are read-only via disabled SelectFields, a Retired switch is
// offered, and deleting is enabled when the account has zero raw
// transactions and (for cash accounts) zero referencing securities
// accounts.
export function PortfolioAccountDialog({
  cashAccounts,
  defaultCurrency,
  editing,
  kind,
  onDelete,
  onDismiss,
  onSaved,
  securitiesAccounts = [],
  version,
}: PortfolioAccountDialogProps): JSX.Element {
  const isEditing = editing !== undefined;
  const initialKind = editing?.kind ?? kind;
  const initialCurrencyCode =
    editing?.kind === "cash"
      ? editing.account.currency
      : initialCurrency(defaultCurrency);
  const initialRefId =
    editing?.kind === "securities"
      ? (editing.account.referenceAccountId ?? "")
      : "";

  const [accountKind, setAccountKind] = useState<AccountKind>(initialKind);
  const [name, setName] = useState(editing?.account.name ?? "");
  const [currency, setCurrency] = useState<string>(initialCurrencyCode);
  const [referenceAccountId, setReferenceAccountId] = useState(initialRefId);
  const [note, setNote] = useState(editing?.account.note ?? "");
  const [isRetired, setIsRetired] = useState(
    editing?.account.isRetired ?? false,
  );
  const { isSending, send } = useSender();

  const currencyOptions = currencyOptionsOf(currency);
  const selectableCash = cashAccounts.filter(
    (account) => !account.isRetired || account.id === initialRefId,
  );
  const referenceOptions: readonly Option<string>[] = [
    { label: "None", value: "" },
    ...selectableCash.map((account) => ({
      label: account.isRetired
        ? `${account.name} (${account.currency}, retired)`
        : `${account.name} (${account.currency})`,
      value: account.id,
    })),
  ];
  const selectedReference = selectableCash.find(
    (account) => account.id === referenceAccountId,
  );
  const effectiveReferenceId =
    selectedReference === undefined ? "" : selectedReference.id;

  const deleteLockNote =
    editing === undefined
      ? undefined
      : deleteLockNoteOf(editing, securitiesAccounts);
  const canDelete =
    editing !== undefined &&
    onDelete !== undefined &&
    deleteLockNote === undefined;

  function save(): void {
    const trimmedName = name.trim();
    const trimmedNote = note.trim();
    const extraNote = trimmedNote === "" ? {} : { note: trimmedNote };

    if (editing !== undefined) {
      const isInitiallyRetired = editing.account.isRetired;
      const draft: EditPortfolioAccount =
        editing.kind === "cash"
          ? {
              id: editing.account.id,
              isRetired,
              kind: "cash",
              name: trimmedName,
              ...extraNote,
            }
          : {
              id: editing.account.id,
              isRetired,
              kind: "securities",
              name: trimmedName,
              ...extraNote,
              ...(effectiveReferenceId !== "" && {
                referenceAccountId: effectiveReferenceId,
              }),
            };
      send(async () => editPortfolioAccount(version, draft), {
        failure: "Account not saved",
        onAccepted: (result) => {
          onSaved({ isRetired, version: result.version });
        },
        success: (result) =>
          editSuccessToast({
            isInitiallyRetired,
            isRetired,
            name: draft.name,
            syncWarning: result.syncWarning,
          }),
      });
      return;
    }

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
      onAccepted: (result) => {
        onSaved({ isRetired: false, version: result.version });
      },
      success: (result) => ({
        description: withSyncNote(
          draft.kind === "cash"
            ? `${draft.name} (${draft.currency}) added to the portfolio file`
            : `${draft.name} added to the portfolio file`,
          result.syncWarning,
        ),
        title: "Account saved",
      }),
    });
  }

  return (
    <EditDialog
      canSave={name.trim() !== ""}
      eyebrow={isEditing ? "Edit account" : "New account"}
      isSaving={isSending}
      isWide
      onDelete={canDelete ? onDelete : undefined}
      onDismiss={onDismiss}
      onSave={save}
      title={name.trim() || "Untitled account"}
    >
      <FieldRow layout="named">
        <TextField
          defaultValue={name}
          label="Name"
          maxLength={200}
          onValueChange={setName}
          placeholder="Brokerage ISA, Reserve cash…"
        />
        <SelectField
          hint={isEditing ? "Account type cannot be changed" : undefined}
          isDisabled={isEditing}
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
          hint={
            isEditing ? "Currency cannot be changed once created" : undefined
          }
          isDisabled={isEditing}
          key="currency"
          label="Currency"
          onValueChange={setCurrency}
          options={currencyOptions}
          value={currency}
        />
      )}
      <TextField
        defaultValue={note}
        label="Note"
        maxLength={1000}
        onValueChange={setNote}
      />
      {isEditing && (
        <LabelledSwitch
          className="justify-self-start"
          icon={Archive}
          isChecked={isRetired}
          onCheckedChange={setIsRetired}
        >
          Retired
        </LabelledSwitch>
      )}
      {deleteLockNote !== undefined && <Note>{deleteLockNote}</Note>}
    </EditDialog>
  );
}

function currencyOptionsOf(current: string): readonly Option<string>[] {
  const codes = currencies.some((code) => code === current)
    ? [...currencies]
    : [...currencies, current];
  return codes.map((code) => ({ label: code, value: code }));
}

function deleteLockNoteOf(
  editing: EditingPortfolioAccount,
  securitiesAccounts: readonly SecuritiesAccount[],
): string | undefined {
  const txCount = editing.account.transactionCount;
  if (editing.kind === "cash") {
    const referencingNames = securitiesAccounts
      .filter((account) => account.referenceAccountId === editing.account.id)
      .map((account) => account.name);
    if (referencingNames.length > 0 && txCount > 0) {
      return `Used by ${counted(txCount, "transaction")} and referenced by ${listFormat.format(referencingNames)} — unlink first to delete, or retire it instead`;
    }
    if (referencingNames.length > 0) {
      return `Referenced by ${listFormat.format(referencingNames)} — unlink first to delete, or retire it instead`;
    }
  }
  return txCount > 0
    ? `Used by ${counted(txCount, "transaction")} — retire it instead`
    : undefined;
}

function editSuccessToast({
  isInitiallyRetired,
  isRetired,
  name,
  syncWarning,
}: {
  readonly isInitiallyRetired: boolean;
  readonly isRetired: boolean;
  readonly name: string;
  readonly syncWarning: string | undefined;
}): { readonly description: string; readonly title: string } {
  if (!isInitiallyRetired && isRetired) {
    return {
      description: withSyncNote(`${name} marked as retired`, syncWarning),
      title: "Account retired",
    };
  }
  if (isInitiallyRetired && !isRetired) {
    return {
      description: withSyncNote(
        `${name} restored to active accounts`,
        syncWarning,
      ),
      title: "Account restored",
    };
  }
  return {
    description: withSyncNote(`${name} updated`, syncWarning),
    title: "Account saved",
  };
}

// The file's base currency when the dialog offers it, or GBP otherwise.
function initialCurrency(currency: string): string {
  return currencies.find((code) => code === currency) ?? "GBP";
}
