"use client";

import type { JSX } from "react";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { Eye } from "lucide-react";
import { useState } from "react";

import type {
  Holding,
  PortfolioQuoteBatch,
  PortfolioQuoteUpdate,
} from "@/data/portfolio";

import { updatePortfolioQuotes } from "@/actions/portfolio";
import { FigureInput } from "@/components/app/atoms/figure-input";
import { Note } from "@/components/app/atoms/note";
import { DateField } from "@/components/app/molecules/date-field";
import { LabelledSwitch } from "@/components/app/molecules/labelled-switch";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { Badge } from "@/components/kit/badge";
import { isIsoCalendarDate, maxPortfolioScaled } from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { counted } from "@/lib/count";
import { formatPrice, priceFormatOf } from "@/lib/money";
import { formatDay } from "@/lib/months";

interface PortfolioQuotesDialogProps {
  readonly holdings: readonly Holding[];
  readonly onDismiss: () => void;
  readonly onSaved: () => void;
  readonly today: string;
  readonly version: number;
}

interface QuoteRowProps {
  readonly entered: number | undefined;
  readonly holding: Holding;
  readonly onChange: (price: null | number) => void;
}

// The dialog for recording a batch of dated security quotes into the
// household's stored .portfolio file in one version. Every input opens
// blank so untouched securities keep their existing quotes, active held
// securities sort unpriced then oldest quote date then A-Z, GBX rows
// carry an outline pence cue with a non-blocking 10x sanity hint, and
// hiding retired or zero-share rows prunes their typed prices so hidden
// entries are never silently submitted.
export function PortfolioQuotesDialog({
  holdings,
  onDismiss,
  onSaved,
  today,
  version,
}: PortfolioQuotesDialogProps): JSX.Element {
  const activeHeld = holdings.filter(isActiveHeld);
  const inactiveCount = holdings.length - activeHeld.length;
  const [date, setDate] = useState(today);
  const [isShowingInactive, setIsShowingInactive] = useState(
    () => activeHeld.length === 0,
  );
  const [prices, setPrices] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const { isSending, send } = useSender();

  const isShowingAll = activeHeld.length === 0 || isShowingInactive;
  const visibleHoldings = (isShowingAll ? holdings : activeHeld).toSorted(
    compareQuoteHoldings,
  );

  const quotesToSubmit: PortfolioQuoteUpdate[] = [];
  let hasInvalidPrice = false;
  for (const holding of visibleHoldings) {
    const entered = prices.get(holding.id);
    if (entered !== undefined) {
      if (quotePriceError(entered) === undefined) {
        quotesToSubmit.push({ price: entered, securityId: holding.id });
      } else {
        hasInvalidPrice = true;
      }
    }
  }

  const enteredCount = quotesToSubmit.length;
  const summary =
    enteredCount > 0
      ? `${counted(enteredCount, "price")} entered`
      : "No prices entered yet";
  const canSave =
    isIsoCalendarDate(date) && enteredCount > 0 && !hasInvalidPrice;

  function handlePriceChange(id: string, next: null | number): void {
    setPrices((current) => {
      const updated = new Map(current);
      if (next === null) {
        updated.delete(id);
      } else {
        updated.set(id, next);
      }
      return updated;
    });
  }

  function handleShowingInactiveChange(isChecked: boolean): void {
    setIsShowingInactive(isChecked);
    if (!isChecked) {
      const activeIds = new Set(activeHeld.map((holding) => holding.id));
      setPrices((current) => {
        const updated = new Map<string, number>();
        for (const [id, price] of current) {
          if (activeIds.has(id)) {
            updated.set(id, price);
          }
        }
        return updated;
      });
    }
  }

  function save(): void {
    const batch: PortfolioQuoteBatch = { date, quotes: quotesToSubmit };
    send(async () => updatePortfolioQuotes(version, batch), {
      failure: "Quotes not saved",
      onAccepted: () => {
        onSaved();
      },
      success: (result) => ({
        description: `${counted(result.updatedCount, "price")} saved for ${formatDay(date)}`,
        title: "Quotes updated",
      }),
    });
  }

  return (
    <EditDialog
      canSave={canSave}
      className="sm:max-w-xl"
      eyebrow="Quotes"
      isSaving={isSending}
      onDismiss={onDismiss}
      onSave={save}
      summary={summary}
      title="Update quotes"
    >
      <DateField
        hint="Applies to every price entered below"
        label="Quote date"
        onValueChange={setDate}
        value={date}
      />
      {activeHeld.length > 0 && inactiveCount > 0 && (
        <LabelledSwitch
          className="justify-self-start"
          icon={Eye}
          isChecked={isShowingInactive}
          onCheckedChange={handleShowingInactiveChange}
        >
          Show retired & zero-share securities
        </LabelledSwitch>
      )}
      {visibleHoldings.length === 0 ? (
        <Note>No securities in this file to price.</Note>
      ) : (
        <ul className="divide-y border-y">
          {visibleHoldings.map((holding) => (
            <QuoteRow
              entered={prices.get(holding.id)}
              holding={holding}
              key={holding.id}
              onChange={(next) => {
                handlePriceChange(holding.id, next);
              }}
            />
          ))}
        </ul>
      )}
      <Note>
        Leave a security blank to keep its existing quote. Saved prices update
        every security entered in one version.
      </Note>
    </EditDialog>
  );
}

// Compares two ISO quote dates, placing undated entries ahead of dated
// ones and older dates ahead of newer dates.
function compareDates(one: null | string, other: null | string): number {
  return (one ?? "").localeCompare(other ?? "");
}

// Sorts active held securities ahead of inactive ones, then unpriced
// first, then oldest quote date ascending, then A-Z by name and id.
function compareQuoteHoldings(one: Holding, other: Holding): number {
  const activeDiff = Number(isActiveHeld(other)) - Number(isActiveHeld(one));
  if (activeDiff !== 0) {
    return activeDiff;
  }
  const pricedDiff =
    Number(one.latestPrice !== null) - Number(other.latestPrice !== null);
  if (pricedDiff !== 0) {
    return pricedDiff;
  }
  const dateDiff = compareDates(one.latestPriceDate, other.latestPriceDate);
  if (dateDiff !== 0) {
    return dateDiff;
  }
  const byName = one.name.localeCompare(other.name);
  return byName !== 0 ? byName : one.id.localeCompare(other.id);
}

function currencyCueOf(currency: string): string | undefined {
  if (currency === "GBX") {
    return "(pence)";
  }
  return currency === "" ? undefined : `(${currency})`;
}

function isActiveHeld(holding: Holding): boolean {
  return !holding.isRetired && holding.shares > 0;
}

// Flags positive entries that differ by at least 10x from the last
// recorded price as a calm, non-blocking pounds-vs-pence sanity hint.
function isOutlierPrice(
  entered: number | undefined,
  latestPrice: null | number,
): boolean {
  if (
    entered === undefined ||
    quotePriceError(entered) !== undefined ||
    latestPrice === null
  ) {
    return false;
  }
  return entered >= latestPrice * 10 || entered * 10 <= latestPrice;
}

function metaOf(holding: Holding): string {
  return [
    holding.ticker,
    holding.isin,
    holding.currency === "" || holding.currency === "GBX"
      ? undefined
      : holding.currency,
    !holding.isRetired && holding.shares === 0 ? "Zero shares" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

function quotePriceError(price: number | undefined): string | undefined {
  return price !== undefined && Math.round(price * 1e8) < 1
    ? "Price must be greater than zero"
    : undefined;
}

// One security row in the batch quote dialog: name, GBX/Retired badges,
// ticker/ISIN/currency cue, last recorded price and date, and a compact
// right-hand price input that stays blank until typed into.
function QuoteRow({ entered, holding, onChange }: QuoteRowProps): JSX.Element {
  const isPence = holding.currency === "GBX";
  const currencyCue = currencyCueOf(holding.currency);
  const meta = metaOf(holding);
  const error = quotePriceError(entered);
  const hint = isOutlierPrice(entered, holding.latestPrice)
    ? "Check pounds vs pence"
    : undefined;

  return (
    <li className="py-3">
      <FieldPrimitive.Root
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem] sm:items-start sm:gap-4"
        invalid={error !== undefined}
      >
        <div className="grid min-w-0 content-start gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <FieldPrimitive.Label className="font-medium">
              {holding.name}
              {currencyCue !== undefined && (
                <>
                  {" "}
                  <span className="sr-only">{currencyCue}</span>
                </>
              )}
            </FieldPrimitive.Label>
            {isPence && <Badge variant="outline">GBX · pence</Badge>}
            {holding.isRetired && <Badge variant="outline">Retired</Badge>}
          </div>
          {meta !== "" && (
            <p className="text-xs text-muted-foreground">{meta}</p>
          )}
          {holding.latestPrice === null ? (
            <p className="text-xs text-caution">Unpriced</p>
          ) : (
            <p className="figure text-xs text-muted-foreground">
              {holding.latestPriceDate !== null
                ? `Last ${formatPrice(holding.latestPrice, holding.currency)} · ${formatDay(holding.latestPriceDate)}`
                : `Last ${formatPrice(holding.latestPrice, holding.currency)}`}
            </p>
          )}
        </div>
        <div className="grid content-start gap-1">
          <FigureInput
            format={priceFormatOf(holding.currency)}
            largeStep={1}
            max={maxPortfolioScaled}
            min={0}
            onCleared={() => {
              onChange(null);
            }}
            onValueChange={onChange}
            onValueCommitted={onChange}
            step={0.01}
            value={entered ?? null}
          />
          {hint !== undefined && (
            <FieldPrimitive.Description className="text-xs text-muted-foreground">
              {hint}
            </FieldPrimitive.Description>
          )}
          {error !== undefined && (
            <FieldPrimitive.Error className="text-xs text-destructive" match>
              {error}
            </FieldPrimitive.Error>
          )}
        </div>
      </FieldPrimitive.Root>
    </li>
  );
}
