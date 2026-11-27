"use client";

import type { JSX } from "react";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { cn } from "cn";
import { Download, Eye, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  Holding,
  PortfolioQuoteBatch,
  PortfolioQuoteUpdate,
} from "@/data/portfolio";
import type { Answer } from "@/lib/answer";
import type { FetchedQuote } from "@/lib/portfolio-quotes";

import {
  fetchPortfolioQuotes,
  updatePortfolioQuotes,
} from "@/actions/portfolio";
import { FigureInput } from "@/components/app/atoms/figure-input";
import { Note } from "@/components/app/atoms/note";
import { RowAction } from "@/components/app/atoms/row-action";
import { DateField } from "@/components/app/molecules/date-field";
import { LabelledSwitch } from "@/components/app/molecules/labelled-switch";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import {
  isIsoCalendarDate,
  maxPortfolioScaled,
  withSyncNote,
} from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { saved } from "@/lib/answer";
import { counted } from "@/lib/count";
import { formatPercent, formatPrice, priceFormatOf } from "@/lib/money";
import { formatDay } from "@/lib/months";

interface PortfolioQuotesDialogProps {
  readonly holdings: readonly Holding[];
  readonly onDismiss: () => void;
  readonly onSaved: () => void;
  readonly today: string;
  readonly version: number;
}

interface QuoteDialogState {
  readonly entries: ReadonlyMap<string, QuoteEntry>;
  readonly statuses: ReadonlyMap<string, FetchedQuote>;
}

interface QuoteEntry {
  readonly date?: string;
  readonly isFetched: boolean;
  readonly price: number;
}

interface QuoteRowProps {
  readonly entry: QuoteEntry | undefined;
  readonly holding: Holding;
  readonly onChange: (price: null | number) => void;
  readonly status: FetchedQuote | undefined;
}

interface RowStatusLine {
  readonly isCaution: boolean;
  readonly isFigure: boolean;
  readonly text: string;
}

const fetchChunkSize = 50;

// The dialog for recording a batch of dated security quotes into the
// household's stored .portfolio file in one version. Every input opens
// blank so untouched securities keep their existing quotes; users can
// enter prices manually or click "Fetch latest quotes" to preview
// online prices (each keeping its market trading date) before saving.
// Manual edits clear any per-row fetched date so manual overrides use
// the top-level Quote date, 10x fetched outliers stay unapplied with a
// caution notice, and hiding retired or zero-share rows prunes their
// entries and statuses so hidden entries are never silently submitted.
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
  const [quoteState, setQuoteState] = useState<QuoteDialogState>(() => ({
    entries: new Map(),
    statuses: new Map(),
  }));
  const { entries, statuses } = quoteState;
  const isMountedRef = useRef(true);
  const { isSending: isSaving, send: sendSave } = useSender();
  const { isSending: isFetching, send: sendFetch } = useSender();

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const isShowingAll = activeHeld.length === 0 || isShowingInactive;
  const visibleHoldings = (isShowingAll ? holdings : activeHeld).toSorted(
    compareQuoteHoldings,
  );
  const visibleIds = new Set(visibleHoldings.map((holding) => holding.id));

  const { fetchedCount, hasInvalidPrice, quotesToSubmit } =
    collectQuotesToSubmit(visibleHoldings, entries);
  const enteredCount = quotesToSubmit.length;
  const summary = footerSummaryOf(enteredCount, fetchedCount);
  const fetchSummary = fetchSummaryOf(statuses, visibleIds);
  const canSave =
    !isFetching &&
    isIsoCalendarDate(date) &&
    enteredCount > 0 &&
    !hasInvalidPrice;

  function fetchLatest(): void {
    const ids = visibleHoldings.map((holding) => holding.id);
    sendFetch(async () => fetchQuoteChunks(ids, () => isMountedRef.current), {
      failure: "Quotes not fetched",
      onAccepted: (results) => {
        setQuoteState((current) => mergeFetchedState(current, results));
      },
    });
  }

  function handlePriceChange(id: string, next: null | number): void {
    setQuoteState((current) => {
      const nextEntries = new Map(current.entries);
      if (next === null) {
        nextEntries.delete(id);
      } else {
        nextEntries.set(id, { isFetched: false, price: next });
      }
      let nextStatuses = current.statuses;
      if (current.statuses.get(id)?.status === "fetched") {
        const pruned = new Map(current.statuses);
        pruned.delete(id);
        nextStatuses = pruned;
      }
      return { entries: nextEntries, statuses: nextStatuses };
    });
  }

  function handleShowingInactiveChange(isChecked: boolean): void {
    setIsShowingInactive(isChecked);
    if (!isChecked) {
      const activeIds = new Set(activeHeld.map((holding) => holding.id));
      setQuoteState((current) => ({
        entries: pruneMapByIds(current.entries, activeIds),
        statuses: pruneMapByIds(current.statuses, activeIds),
      }));
    }
  }

  function save(): void {
    const batch: PortfolioQuoteBatch = { date, quotes: quotesToSubmit };
    sendSave(async () => updatePortfolioQuotes(version, batch), {
      failure: "Quotes not saved",
      onAccepted: () => {
        onSaved();
      },
      success: (result) => ({
        description: saveDescriptionOf({
          defaultDate: date,
          quotes: quotesToSubmit,
          syncWarning: result.syncWarning,
          updatedCount: result.updatedCount,
        }),
        title: "Quotes updated",
      }),
    });
  }

  return (
    <EditDialog
      canSave={canSave}
      className="sm:max-w-xl"
      eyebrow="Quotes"
      isSaving={isSaving}
      onDismiss={onDismiss}
      onSave={save}
      summary={summary}
      title="Update quotes"
    >
      <DateField
        hint={
          fetchedCount > 0
            ? "Applies to manual entries; fetched quotes keep their market date"
            : "Applies to every price entered below"
        }
        label="Quote date"
        onValueChange={setDate}
        value={date}
      />
      {visibleHoldings.length > 0 && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              disabled={isSaving}
              isBusy={isFetching}
              onClick={fetchLatest}
              size="sm"
              variant="outline"
            >
              <Download aria-hidden />
              Fetch latest quotes
            </Button>
            {activeHeld.length > 0 && inactiveCount > 0 && (
              <LabelledSwitch
                icon={Eye}
                isChecked={isShowingInactive}
                isDisabled={isFetching}
                onCheckedChange={handleShowingInactiveChange}
              >
                Show retired & zero-share securities
              </LabelledSwitch>
            )}
          </div>
          <p
            className={
              fetchSummary === "" ? "sr-only" : "text-xs text-muted-foreground"
            }
            role="status"
          >
            {fetchSummary}
          </p>
        </div>
      )}
      {visibleHoldings.length === 0 ? (
        <Note>No securities in this file to price.</Note>
      ) : (
        <ul className="divide-y border-y">
          {visibleHoldings.map((holding) => (
            <QuoteRow
              entry={entries.get(holding.id)}
              holding={holding}
              key={holding.id}
              onChange={(next) => {
                handlePriceChange(holding.id, next);
              }}
              status={statuses.get(holding.id)}
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

function collectQuotesToSubmit(
  visibleHoldings: readonly Holding[],
  entries: ReadonlyMap<string, QuoteEntry>,
): {
  readonly fetchedCount: number;
  readonly hasInvalidPrice: boolean;
  readonly quotesToSubmit: readonly PortfolioQuoteUpdate[];
} {
  const quotesToSubmit: PortfolioQuoteUpdate[] = [];
  let fetchedCount = 0;
  let hasInvalidPrice = false;
  for (const holding of visibleHoldings) {
    const entry = entries.get(holding.id);
    if (entry !== undefined) {
      if (quotePriceError(entry.price) === undefined) {
        quotesToSubmit.push({
          ...(entry.date !== undefined && { date: entry.date }),
          price: entry.price,
          securityId: holding.id,
        });
        if (entry.isFetched) {
          fetchedCount += 1;
        }
      } else {
        hasInvalidPrice = true;
      }
    }
  }
  return { fetchedCount, hasInvalidPrice, quotesToSubmit };
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

async function fetchQuoteChunks(
  ids: readonly string[],
  isMounted: () => boolean,
): Promise<Answer<readonly FetchedQuote[]>> {
  const all: FetchedQuote[] = [];
  for (let start = 0; start < ids.length; start += fetchChunkSize) {
    const chunk = await fetchPortfolioQuotes({
      securityIds: ids.slice(start, start + fetchChunkSize),
    });
    if (!isMounted()) {
      return saved([]);
    }
    if (chunk.kind === "refused") {
      return chunk;
    }
    all.push(...chunk.value);
  }
  return saved(all);
}

function fetchSummaryOf(
  statuses: ReadonlyMap<string, FetchedQuote>,
  visibleIds: ReadonlySet<string>,
): string {
  let fetched = 0;
  let skipped = 0;
  let attention = 0;
  for (const [id, result] of statuses) {
    if (!visibleIds.has(id)) {
      continue;
    }
    switch (result.status) {
      case "currency-mismatch":
      case "failed":
      case "outlier":
        attention += 1;
        break;
      case "fetched":
        fetched += 1;
        break;
      case "manual-feed":
      case "missing-ticker":
      case "unsupported-feed":
        skipped += 1;
        break;
    }
  }
  const parts = [
    ...(fetched > 0 ? [`${counted(fetched, "quote")} fetched`] : []),
    ...(skipped > 0 ? [`${String(skipped)} skipped`] : []),
    ...(attention > 0 ? [`${String(attention)} need review`] : []),
  ];
  return parts.join(" · ");
}

function footerSummaryOf(enteredCount: number, fetchedCount: number): string {
  if (enteredCount === 0) {
    return "No prices entered yet";
  }
  return fetchedCount > 0
    ? `${counted(enteredCount, "price")} ready (${String(fetchedCount)} fetched)`
    : `${counted(enteredCount, "price")} entered`;
}

function formatQuoteDelta(
  price: number,
  latestPrice: null | number,
): string | undefined {
  if (latestPrice === null) {
    return undefined;
  }
  const ratio = (price - latestPrice) / latestPrice;
  const formatted = formatPercent(ratio);
  return ratio > 0 && formatted !== "0.00%" ? `+${formatted}` : formatted;
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

function mergeFetchedState(
  current: QuoteDialogState,
  results: readonly FetchedQuote[],
): QuoteDialogState {
  const entries = new Map(current.entries);
  const statuses = new Map(current.statuses);
  for (const result of results) {
    const existing = entries.get(result.securityId);
    const isManual = existing !== undefined && !existing.isFetched;
    if (result.status === "fetched") {
      if (!isManual) {
        entries.set(result.securityId, {
          date: result.date,
          isFetched: true,
          price: result.price,
        });
        statuses.set(result.securityId, result);
      }
    } else {
      statuses.set(result.securityId, result);
    }
  }
  return { entries, statuses };
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

function pruneMapByIds<TValue>(
  current: ReadonlyMap<string, TValue>,
  allowedIds: ReadonlySet<string>,
): ReadonlyMap<string, TValue> {
  const updated = new Map<string, TValue>();
  for (const [id, value] of current) {
    if (allowedIds.has(id)) {
      updated.set(id, value);
    }
  }
  return updated;
}

function quotePriceError(price: number | undefined): string | undefined {
  return price !== undefined && Math.round(price * 1e8) < 1
    ? "Price must be greater than zero"
    : undefined;
}

// One security row in the batch quote dialog: name, GBX/Retired badges,
// ticker/ISIN/currency cue, last recorded price and date, optional
// online fetch status line, compact price input, and clear action.
function QuoteRow({
  entry,
  holding,
  onChange,
  status,
}: QuoteRowProps): JSX.Element {
  const isPence = holding.currency === "GBX";
  const currencyCue = currencyCueOf(holding.currency);
  const meta = metaOf(holding);
  const entered = entry?.price;
  const error = quotePriceError(entered);
  const hint = isOutlierPrice(entered, holding.latestPrice)
    ? "Check pounds vs pence"
    : undefined;
  const statusLine = rowStatusOf(holding, status);

  return (
    <li className="py-3">
      <FieldPrimitive.Root
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_auto] sm:items-start sm:gap-x-3 sm:gap-y-2"
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
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {holding.latestPriceDate !== null
                ? `Last ${formatPrice(holding.latestPrice, holding.currency)} · ${formatDay(holding.latestPriceDate)}`
                : `Last ${formatPrice(holding.latestPrice, holding.currency)}`}
            </p>
          )}
          {statusLine !== undefined && (
            <p
              className={cn(
                "text-xs",
                statusLine.isFigure && "font-mono tabular-nums",
                statusLine.isCaution ? "text-caution" : "text-muted-foreground",
              )}
            >
              {statusLine.text}
            </p>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1 sm:contents">
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
          {entry === undefined ? (
            <span aria-hidden className="w-7 shrink-0 pointer-coarse:w-11" />
          ) : (
            <RowAction
              className="mt-0.5 shrink-0"
              icon={X}
              name={`Clear quote for ${holding.name}`}
              onClick={() => {
                onChange(null);
              }}
            />
          )}
        </div>
      </FieldPrimitive.Root>
    </li>
  );
}

function rowStatusOf(
  holding: Holding,
  status: FetchedQuote | undefined,
): RowStatusLine | undefined {
  if (status === undefined) {
    return undefined;
  }
  switch (status.status) {
    case "currency-mismatch":
    case "failed":
      return { isCaution: true, isFigure: false, text: status.reason };
    case "fetched": {
      const delta = formatQuoteDelta(status.price, holding.latestPrice);
      const parts = [
        `Fetched ${formatDay(status.date)}`,
        delta,
        status.convertedFrom === undefined
          ? undefined
          : `Converted from ${status.convertedFrom}`,
        holding.latestPriceDate !== null &&
        status.date < holding.latestPriceDate
          ? "Older than latest quote"
          : undefined,
      ].filter((part) => part !== undefined);
      return { isCaution: false, isFigure: true, text: parts.join(" · ") };
    }
    case "manual-feed":
    case "missing-ticker":
    case "unsupported-feed":
      return { isCaution: false, isFigure: false, text: status.reason };
    case "outlier":
      return {
        isCaution: true,
        isFigure: false,
        text: `Fetched ${formatPrice(status.price, holding.currency)} (${formatDay(status.date)}) — ≥10× off last price; enter manually if intended`,
      };
  }
}

function saveDescriptionOf({
  defaultDate,
  quotes,
  syncWarning,
  updatedCount,
}: {
  readonly defaultDate: string;
  readonly quotes: readonly PortfolioQuoteUpdate[];
  readonly syncWarning: string | undefined;
  readonly updatedCount: number;
}): string {
  const uniqueDates = new Set(quotes.map((entry) => entry.date ?? defaultDate));
  const [onlyDate] = uniqueDates;
  const base =
    uniqueDates.size === 1 && onlyDate !== undefined
      ? `${counted(updatedCount, "price")} saved for ${formatDay(onlyDate)}`
      : `${counted(updatedCount, "price")} saved`;
  return withSyncNote(base, syncWarning);
}
