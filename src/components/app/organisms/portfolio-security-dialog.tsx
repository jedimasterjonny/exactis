"use client";

import type { JSX } from "react";

import { useState } from "react";

import type { PortfolioCategory } from "@/data/portfolio";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { PriceField } from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";

export interface NewPortfolioSecurity {
  readonly categoryId?: string;
  readonly currency: string;
  readonly isin?: string;
  readonly latestPrice: null | number;
  readonly name: string;
  readonly note?: string;
  readonly ticker?: string;
}

interface PortfolioSecurityDialogProps {
  readonly categories: readonly PortfolioCategory[];
  readonly defaultCurrency?: string;
  readonly onAdd: (draft: NewPortfolioSecurity) => void;
  readonly onDismiss: () => void;
}

const currencies = ["GBP", "GBX", "USD", "EUR"] as const;

type Currency = (typeof currencies)[number];

const currencyOptions: readonly Option<Currency>[] = currencies.map((code) => ({
  label: code,
  value: code,
}));

// The preview dialog for adding a security to the Portfolio screen's
// catalogue. Mounted while open so uncontrolled text and select fields
// start fresh on every opening; PriceField keys on currency so
// switching to GBX swaps cleanly to pence without passing GBX to Intl.
export function PortfolioSecurityDialog({
  categories,
  defaultCurrency,
  onAdd,
  onDismiss,
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

  const categoryOptions: readonly Option<string>[] = [
    { label: "Unassigned", value: "" },
    ...categories.map((item) => ({ label: item.name, value: item.id })),
  ];

  function save(): void {
    const trimmedIsin = isin.trim();
    const trimmedTicker = ticker.trim();
    const trimmedNote = note.trim();
    onAdd({
      ...(categoryId !== "" && { categoryId }),
      currency,
      ...(trimmedIsin !== "" && { isin: trimmedIsin }),
      latestPrice: latestPrice !== null && latestPrice > 0 ? latestPrice : null,
      name: name.trim(),
      ...(trimmedNote !== "" && { note: trimmedNote }),
      ...(trimmedTicker !== "" && { ticker: trimmedTicker }),
    });
  }

  return (
    <EditDialog
      canSave={name.trim() !== ""}
      confirm="Add preview"
      eyebrow="New security"
      isWide
      onDismiss={onDismiss}
      onSave={save}
      title={name.trim() || "Untitled security"}
    >
      <FieldRow layout="named">
        <TextField
          label="Security name"
          onValueChange={setName}
          placeholder="Global Equity Index…"
        />
        <SelectField
          defaultValue={currency}
          label="Currency"
          onValueChange={setCurrency}
          options={currencyOptions}
        />
      </FieldRow>
      <FieldRow layout="triple">
        <TextField
          label="ISIN"
          onValueChange={setIsin}
          placeholder="GB00TEST0001"
        />
        <TextField
          label="Ticker"
          onValueChange={setTicker}
          placeholder="GEIDX"
        />
        <SelectField
          defaultValue={categoryId}
          label="Asset class"
          onValueChange={setCategoryId}
          options={categoryOptions}
        />
      </FieldRow>
      <FieldRow layout="pair">
        <PriceField
          currency={currency}
          hint={
            currency === "GBX"
              ? "Optional quote in pence"
              : "Optional latest quote"
          }
          key={currency}
          label={currency === "GBX" ? "Latest price (pence)" : "Latest price"}
          min={0}
          onCleared={() => {
            setLatestPrice(null);
          }}
          onValueCommitted={setLatestPrice}
          value={latestPrice}
        />
        <TextField label="Note" onValueChange={setNote} />
      </FieldRow>
      <Note>
        Creates the security in the catalogue. Shares come from purchase or
        delivery transactions once saving is wired.
      </Note>
    </EditDialog>
  );
}

function currencyOf(code: string | undefined): Currency {
  return currencies.find((currency) => currency === code) ?? "GBP";
}
