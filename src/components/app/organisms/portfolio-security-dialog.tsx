"use client";

import type { JSX } from "react";

import { useState } from "react";

import type { NewPortfolioSecurity, PortfolioCategory } from "@/data/portfolio";
import type { Option } from "@/lib/options";

import { addPortfolioSecurity } from "@/actions/portfolio";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { PriceField } from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { maxPortfolioScaled } from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { formatDay } from "@/lib/months";

interface PortfolioSecurityDialogProps {
  readonly categories: readonly PortfolioCategory[];
  readonly defaultCurrency?: string;
  readonly onDismiss: () => void;
  readonly onSaved: (draft: NewPortfolioSecurity) => void;
  readonly today: string;
  readonly version: number;
}

const currencies = ["GBP", "GBX", "USD", "EUR"] as const;

type Currency = (typeof currencies)[number];

const currencyOptions: readonly Option<Currency>[] = currencies.map((code) => ({
  label: code,
  value: code,
}));

// The dialog for appending a security to the household's stored
// .portfolio catalogue. Controlled selects clear a vanished Asset
// Allocation class cleanly after a stale refresh, and PriceField keys
// on currency so switching to GBX swaps cleanly to pence without
// passing GBX to Intl.
export function PortfolioSecurityDialog({
  categories,
  defaultCurrency,
  onDismiss,
  onSaved,
  today,
  version,
}: PortfolioSecurityDialogProps): JSX.Element {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>(() =>
    currencyOf(defaultCurrency),
  );
  const [isin, setIsin] = useState("");
  const [ticker, setTicker] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [latestPrice, setLatestPrice] = useState<null | number>(null);
  const [note, setNote] = useState("");
  const { isSending, send } = useSender();

  const categoryOptions: readonly Option<string>[] = [
    { label: "Unassigned", value: "" },
    ...categories.map((item) => ({ label: item.name, value: item.id })),
  ];
  const effectiveCategoryId = categories.some((item) => item.id === categoryId)
    ? categoryId
    : "";
  const formattedToday = formatDay(today);

  function save(): void {
    const trimmedIsin = isin.trim();
    const trimmedTicker = ticker.trim();
    const trimmedNote = note.trim();
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
      onAccepted: () => {
        onSaved(draft);
      },
      success: () => ({
        description: `${draft.name} (${draft.currency}) added to the catalogue`,
        title: "Security saved",
      }),
    });
  }

  return (
    <EditDialog
      canSave={name.trim() !== ""}
      eyebrow="New security"
      isSaving={isSending}
      isWide
      onDismiss={onDismiss}
      onSave={save}
      title={name.trim() || "Untitled security"}
    >
      <FieldRow layout="named">
        <TextField
          label="Security name"
          maxLength={200}
          onValueChange={setName}
          placeholder="Global Equity Index…"
        />
        <SelectField
          label="Currency"
          onValueChange={setCurrency}
          options={currencyOptions}
          value={currency}
        />
      </FieldRow>
      <FieldRow layout="pair">
        <TextField
          label="ISIN"
          maxLength={32}
          onValueChange={setIsin}
          placeholder="GB00TEST0001"
        />
        <TextField
          label="Ticker"
          maxLength={32}
          onValueChange={setTicker}
          placeholder="GEIDX"
        />
      </FieldRow>
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
      <TextField label="Note" maxLength={1000} onValueChange={setNote} />
      <Note>
        Creates the security in the catalogue. Record a purchase or inbound
        delivery to add shares.
      </Note>
    </EditDialog>
  );
}

function currencyOf(code: string | undefined): Currency {
  return currencies.find((currency) => currency === code) ?? "GBP";
}
