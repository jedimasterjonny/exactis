"use client";

import type { JSX } from "react";

import { Archive } from "lucide-react";
import { useState } from "react";

import type {
  EditPortfolioSecurity,
  Holding,
  NewPortfolioSecurity,
  PortfolioCategory,
} from "@/data/portfolio";
import type { Option } from "@/lib/options";

import {
  addPortfolioSecurity,
  editPortfolioSecurity,
} from "@/actions/portfolio";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { PriceField } from "@/components/app/molecules/figure-field";
import { LabelledSwitch } from "@/components/app/molecules/labelled-switch";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { maxPortfolioScaled, withSyncNote } from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { counted } from "@/lib/count";
import { formatDay } from "@/lib/months";

interface PortfolioSecurityDialogProps {
  readonly categories: readonly PortfolioCategory[];
  readonly defaultCurrency?: string;
  readonly onDelete?: () => void;
  readonly onDismiss: () => void;
  readonly onSaved: (outcome: {
    readonly isRetired: boolean;
    readonly version: number;
  }) => void;
  readonly security?: Holding;
  readonly today: string;
  readonly version: number;
}

const currencies = ["GBP", "GBX", "USD", "EUR"] as const;

// The dialog for adding or editing a security in the household's stored
// .portfolio catalogue. In edit mode quote currency is read-only to
// prevent 100× GBX/GBP corruption of historical quotes, split Asset
// Allocation classes stay locked so multi-class weights are never
// overwritten, a Retired switch is provided, and Delete is offered only
// when the security has zero raw transactions.
export function PortfolioSecurityDialog({
  categories,
  defaultCurrency,
  onDelete,
  onDismiss,
  onSaved,
  security,
  today,
  version,
}: PortfolioSecurityDialogProps): JSX.Element {
  const isEditing = security !== undefined;
  const [name, setName] = useState(security?.name ?? "");
  const [currency, setCurrency] = useState<string>(
    () => security?.currency ?? currencyOf(defaultCurrency),
  );
  const [isin, setIsin] = useState(security?.isin ?? "");
  const [ticker, setTicker] = useState(security?.ticker ?? "");
  const [categoryId, setCategoryId] = useState(security?.categoryId ?? "");
  const [latestPrice, setLatestPrice] = useState<null | number>(null);
  const [note, setNote] = useState(security?.note ?? "");
  const [isRetired, setIsRetired] = useState(security?.isRetired ?? false);
  const { isSending, send } = useSender();

  const currencyOptions = currencyOptionsOf(currency);
  const isSplitCategory = security?.isSplitCategory === true;
  const categoryOptions: readonly Option<string>[] = isSplitCategory
    ? [{ label: security.category ?? "Split allocation", value: "" }]
    : [
        { label: "Unassigned", value: "" },
        ...categories.map((item) => ({ label: item.name, value: item.id })),
      ];
  const effectiveCategoryId =
    !isSplitCategory && categories.some((item) => item.id === categoryId)
      ? categoryId
      : "";
  const formattedToday = formatDay(today);

  const txCount = security?.transactionCount ?? 0;
  const canDelete = isEditing && onDelete !== undefined && txCount === 0;

  function save(): void {
    const trimmedIsin = isin.trim();
    const trimmedTicker = ticker.trim();
    const trimmedNote = note.trim();

    if (security !== undefined) {
      const isInitiallyRetired = security.isRetired;
      const draft: EditPortfolioSecurity = {
        ...(!isSplitCategory &&
          effectiveCategoryId !== "" && { categoryId: effectiveCategoryId }),
        id: security.id,
        ...(trimmedIsin !== "" && { isin: trimmedIsin }),
        isRetired,
        name: name.trim(),
        ...(trimmedNote !== "" && { note: trimmedNote }),
        ...(trimmedTicker !== "" && { ticker: trimmedTicker }),
      };
      send(async () => editPortfolioSecurity(version, draft), {
        failure: "Security not saved",
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

    const draft: NewPortfolioSecurity = {
      ...(effectiveCategoryId !== "" && { categoryId: effectiveCategoryId }),
      currency,
      ...(trimmedIsin !== "" && { isin: trimmedIsin }),
      latestPrice:
        latestPrice !== null && Math.round(latestPrice * 1e8) >= 1
          ? latestPrice
          : null,
      name: name.trim(),
      ...(trimmedNote !== "" && { note: trimmedNote }),
      ...(trimmedTicker !== "" && { ticker: trimmedTicker }),
    };
    send(async () => addPortfolioSecurity(version, draft), {
      failure: "Security not saved",
      onAccepted: (result) => {
        onSaved({ isRetired: false, version: result.version });
      },
      success: (result) => ({
        description: withSyncNote(
          `${draft.name} (${draft.currency}) added to the catalogue`,
          result.syncWarning,
        ),
        title: "Security saved",
      }),
    });
  }

  return (
    <EditDialog
      canSave={name.trim() !== ""}
      eyebrow={isEditing ? "Edit security" : "New security"}
      isSaving={isSending}
      isWide
      onDelete={canDelete ? onDelete : undefined}
      onDismiss={onDismiss}
      onSave={save}
      title={name.trim() || "Untitled security"}
    >
      <FieldRow layout="named">
        <TextField
          defaultValue={name}
          label="Security name"
          maxLength={200}
          onValueChange={setName}
          placeholder="Global Equity Index…"
        />
        <SelectField
          hint={
            isEditing ? "Currency cannot be changed once created" : undefined
          }
          isDisabled={isEditing}
          label="Currency"
          onValueChange={setCurrency}
          options={currencyOptions}
          value={currency}
        />
      </FieldRow>
      <FieldRow layout="pair">
        <TextField
          defaultValue={isin}
          label="ISIN"
          maxLength={32}
          onValueChange={setIsin}
          placeholder="GB00TEST0001"
        />
        <TextField
          defaultValue={ticker}
          label="Ticker"
          maxLength={32}
          onValueChange={setTicker}
          placeholder="GEIDX"
        />
      </FieldRow>
      {isEditing ? (
        <SelectField
          hint={
            isSplitCategory
              ? "Split allocation — edit in Portfolio Performance"
              : undefined
          }
          isDisabled={isSplitCategory}
          label="Asset class"
          onValueChange={setCategoryId}
          options={categoryOptions}
          value={effectiveCategoryId}
        />
      ) : (
        <FieldRow layout="pair">
          <SelectField
            label="Asset class"
            onValueChange={setCategoryId}
            options={categoryOptions}
            value={effectiveCategoryId}
          />
          <PriceField
            currency={currency}
            hint={
              currency === "GBX"
                ? `Optional quote in pence, dated ${formattedToday}`
                : `Optional quote dated ${formattedToday}`
            }
            key={currency}
            label={currency === "GBX" ? "Latest price (pence)" : "Latest price"}
            max={maxPortfolioScaled}
            min={0}
            onCleared={() => {
              setLatestPrice(null);
            }}
            onValueChange={setLatestPrice}
            onValueCommitted={setLatestPrice}
            value={latestPrice}
          />
        </FieldRow>
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
      {!isEditing && (
        <Note>
          Creates the security in the catalogue. Record a purchase or inbound
          delivery to add shares.
        </Note>
      )}
      {isEditing && txCount > 0 && (
        <Note>{`Used by ${counted(txCount, "transaction")} — retire it instead`}</Note>
      )}
    </EditDialog>
  );
}

function currencyOf(code: string | undefined): string {
  return currencies.find((currency) => currency === code) ?? "GBP";
}

function currencyOptionsOf(current: string): readonly Option<string>[] {
  if (currencies.some((code) => code === current)) {
    return currencies.map((code) => ({ label: code, value: code }));
  }
  return [
    ...currencies.map((code) => ({ label: code, value: code })),
    { label: current === "" ? "None" : current, value: current },
  ];
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
      title: "Security retired",
    };
  }
  if (isInitiallyRetired && !isRetired) {
    return {
      description: withSyncNote(
        `${name} restored to active securities`,
        syncWarning,
      ),
      title: "Security restored",
    };
  }
  return {
    description: withSyncNote(`${name} updated`, syncWarning),
    title: "Security saved",
  };
}
