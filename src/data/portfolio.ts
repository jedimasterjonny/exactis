import * as z from "zod";

import type { Portfolio, Target } from "@/data/targets";
import type { Answer } from "@/lib/answer";
import type { OptionGroup } from "@/lib/options";

import { sumOf } from "@/lib/ledger";
import { optionsOf } from "@/lib/options";

// A reference cash account paired beside a securities account: the cash
// account itself, and whether an earlier securities account already
// displayed its balance so column subtotals stay reconciled.
export interface AccountReference {
  readonly account: CashAccount;
  readonly isShared: boolean;
}

// A cash account as a Portfolio Performance file holds it: its UUID,
// name, currency code, balance in that currency, sterling equivalent
// when a GBP rate is known (or null for a non-zero balance in an
// unconvertible currency), optional note, retired flag, and transaction
// count.
export interface CashAccount {
  readonly balance: number;
  readonly balanceGbp: null | number;
  readonly currency: string;
  readonly id: string;
  readonly isRetired: boolean;
  readonly name: string;
  readonly note?: string;
  readonly transactionCount: number;
}

// Input for deleting a cash or securities account from a .portfolio file.
export interface DeletePortfolioAccount {
  readonly id: string;
  readonly kind: "cash" | "securities";
}

// Input for deleting a catalogued security from a .portfolio file.
export interface DeletePortfolioSecurity {
  readonly id: string;
}

// Input for deleting a transaction from a .portfolio file.
export interface DeletePortfolioTransaction {
  readonly id: string;
}

// Input for editing or retiring an existing cash or securities account
// in a .portfolio file.
export type EditPortfolioAccount =
  | {
      readonly id: string;
      readonly isRetired: boolean;
      readonly kind: "cash";
      readonly name: string;
      readonly note?: string;
    }
  | {
      readonly id: string;
      readonly isRetired: boolean;
      readonly kind: "securities";
      readonly name: string;
      readonly note?: string;
      readonly referenceAccountId?: string;
    };

// Input for editing or retiring an existing catalogued security in a
// .portfolio file (quote currency is immutable once created).
export interface EditPortfolioSecurity {
  readonly categoryId?: string;
  readonly id: string;
  readonly isin?: string;
  readonly isRetired: boolean;
  readonly name: string;
  readonly note?: string;
  readonly ticker?: string;
}

// Input for editing an existing transaction in a .portfolio file
// (transaction type is immutable once created).
export interface EditPortfolioTransaction extends NewPortfolioTransaction {
  readonly id: string;
}

// A security in the file's catalogue: its UUID, name, quote currency,
// latest known GBP conversion rate, latest positive quote price and
// date, optional ISIN, ticker, Asset Allocation category display label,
// single-leaf classification id and split-allocation flag, optional
// note, retired flag, raw touching transaction count, active total
// share count, and per-account active share breakdown.
export interface Holding {
  readonly category?: string;
  readonly categoryId?: string;
  readonly currency: string;
  readonly gbpRate: null | number;
  readonly id: string;
  readonly isin?: string;
  readonly isRetired: boolean;
  readonly isSplitCategory: boolean;
  readonly latestPrice: null | number;
  readonly latestPriceDate: null | string;
  readonly name: string;
  readonly note?: string;
  readonly shares: number;
  readonly sharesByAccount: readonly AccountShares[];
  readonly ticker?: string;
  readonly transactionCount: number;
}

// One row prepared for the Holdings table: the security, the share count
// and active-account count under the current filter, valuation status,
// sterling market value (or null when unpriced or missing FX), and share
// of the shown holdings' total value.
export interface HoldingRow {
  readonly accountCount: number;
  readonly holding: Holding;
  readonly marketValueGbp: null | number;
  readonly share: number;
  readonly shares: number;
  readonly status: HoldingStatus;
}

// Input for appending a new cash or securities account to a .portfolio file.
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

// Input for appending a new security (with optional initial quote and
// Asset Allocation classification id) to a .portfolio file.
export interface NewPortfolioSecurity {
  readonly categoryId?: string;
  readonly currency: string;
  readonly isin?: string;
  readonly latestPrice: null | number;
  readonly latestPriceDate?: string;
  readonly name: string;
  readonly note?: string;
  readonly ticker?: string;
}

// Input for appending a new transaction of any of Portfolio
// Performance's fifteen types to a .portfolio file.
export interface NewPortfolioTransaction {
  readonly accountId?: string;
  readonly amount: number;
  readonly currency: string;
  readonly date: string;
  readonly fees: number;
  readonly fxAmount?: number;
  readonly note?: string;
  readonly otherAccountId?: string;
  readonly otherPortfolioId?: string;
  readonly portfolioId?: string;
  readonly securityId?: string;
  readonly shares: number;
  readonly taxes: number;
  readonly type: TransactionType;
}

// One leaf classification in the file's Asset Allocation taxonomy: its
// protobuf classification id, disambiguated display name, and the active
// catalogued security UUIDs assigned to it.
export interface PortfolioCategory {
  readonly id: string;
  readonly name: string;
  readonly securityIds: readonly string[];
}

// Lightweight feed parsed from the household's owned .portfolio file
// for Assumptions, Month end, and Cogitator: quote and transaction
// freshness dates, validated target categories and portfolios (or their
// refusal), and active account/category handoff lookups.
export interface PortfolioFeed {
  readonly handoff: PortfolioHandoff;
  readonly latestQuoteDate: null | string;
  readonly latestTransactionDate: null | string;
  readonly targets: Answer<{
    readonly categories: readonly Target[];
    readonly portfolios: readonly Portfolio[];
  }>;
}

// Cross-currency gross value unit on a Portfolio Performance
// transaction: settlement gross amount and currency, foreign gross
// amount and currency, and optional decoded exchange rate (settlement
// currency per unit of foreign currency).
export interface PortfolioGrossValue {
  readonly amount: number;
  readonly currency: string;
  readonly exchangeRate?: number;
  readonly fxAmount: number;
  readonly fxCurrency: string;
}

// Active securities accounts and per-category security holdings
// extracted from the household's .portfolio file so Cogitator can hand
// off a rebalancing trade directly into the Portfolio transaction
// dialog.
export interface PortfolioHandoff {
  readonly securitiesAccounts: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly securitiesByCategory: Readonly<
    Record<string, readonly PortfolioSecurityHandoff[]>
  >;
}

// Input for recording a batch of historical quotes dated to one ISO
// calendar date across one or more catalogued securities.
export interface PortfolioQuoteBatch {
  readonly date: string;
  readonly quotes: readonly PortfolioQuoteUpdate[];
}

// One security price entry within a batch quote update, optionally
// carrying its own ISO calendar date (falling back to the batch date).
export interface PortfolioQuoteUpdate {
  readonly date?: string;
  readonly price: number;
  readonly securityId: string;
}

// What reading a binary Portfolio Performance file hands the Portfolio
// screen: the file name and base currency, the latest quote date across
// active priced securities (or null when none exist), the securities
// and cash accounts, the security catalogue with per-account shares,
// the Asset Allocation categories when present, active sterling totals,
// and every transaction newest first.
export interface PortfolioSnapshot {
  readonly baseCurrency: string;
  readonly cashAccounts: readonly CashAccount[];
  readonly categories: readonly PortfolioCategory[];
  readonly fileName: string;
  readonly gbpRates: Readonly<Record<string, number>>;
  readonly holdings: readonly Holding[];
  readonly latestQuoteDate: null | string;
  readonly securitiesAccounts: readonly SecuritiesAccount[];
  readonly totalCash: number;
  readonly totalInvested: number;
  readonly transactions: readonly PortfolioTransaction[];
}

// One transaction as a Portfolio Performance file holds it: its UUID,
// type, ISO date and epoch-second timestamp, currency, positive amount,
// fee and tax totals, share count, optional resolved account/portfolio/
// security references, and note.
export interface PortfolioTransaction {
  readonly accountId?: string;
  readonly accountName?: string;
  readonly amount: number;
  readonly currency: string;
  readonly date: string;
  readonly fees: number;
  readonly grossValue?: PortfolioGrossValue;
  readonly id: string;
  readonly note?: string;
  readonly otherAccountId?: string;
  readonly otherAccountName?: string;
  readonly otherPortfolioId?: string;
  readonly otherPortfolioName?: string;
  readonly portfolioId?: string;
  readonly portfolioName?: string;
  readonly securityId?: string;
  readonly securityName?: string;
  readonly shares: number;
  readonly taxes: number;
  readonly timestamp: number;
  readonly type: TransactionType;
}

// A securities account as a Portfolio Performance file holds it: its
// UUID, name, count of held securities, sterling market value to two
// decimal places, optional note, retired flag, optional reference cash
// account UUID, and raw touching transaction count.
export interface SecuritiesAccount {
  readonly holdingsCount: number;
  readonly id: string;
  readonly isRetired: boolean;
  readonly marketValue: number;
  readonly name: string;
  readonly note?: string;
  readonly referenceAccountId?: string;
  readonly transactionCount: number;
}

// Every transaction type Portfolio Performance writes in PTransaction.Type.
export type TransactionType =
  | "cash-transfer"
  | "deposit"
  | "dividend"
  | "fee"
  | "fee-refund"
  | "inbound-delivery"
  | "interest"
  | "interest-charge"
  | "outbound-delivery"
  | "purchase"
  | "removal"
  | "sale"
  | "security-transfer"
  | "tax"
  | "tax-refund";

interface AccountPair {
  readonly reference: AccountReference | null;
  readonly securities: SecuritiesAccount;
}

interface AccountShares {
  readonly portfolioId: string;
  readonly shares: number;
}

interface AccountsLayout {
  readonly hasRetired: boolean;
  readonly investedTotal: number;
  readonly pairs: readonly AccountPair[];
  readonly refCashExcluded: readonly string[];
  readonly refCashTotal: number;
  readonly standaloneCash: readonly CashAccount[];
  readonly standaloneCashExcluded: readonly string[];
  readonly standaloneCashTotal: number;
  readonly total: number;
}

interface CashTotals {
  readonly excludedCurrencies: readonly string[];
  readonly totalGbp: number;
}

interface HoldingsFilter {
  readonly accountId: string;
  readonly isShowingZeroShares: boolean;
}

type HoldingStatus = "no-fx" | "unpriced" | "valued" | "zero";

interface HoldingsView {
  readonly hasForeignPrices: boolean;
  readonly hasZeroShare: boolean;
  readonly rows: readonly HoldingRow[];
  readonly totalGbp: number;
}

interface PortfolioSecurityHandoff {
  readonly heldInAccountIds: readonly string[];
  readonly id: string;
}

interface TransactionsFilter {
  readonly accountId: string;
  readonly securityId: string;
  readonly type: "" | TransactionType;
}

// Maximum binary .portfolio file size accepted for upload (decimal 4 MB,
// matching macOS Finder's reported size and leaving ~500 KB headroom
// inside Vercel Hobby's 4.5 MB serverless payload limit).
export const maxPortfolioBytes = 4_000_000;

// Safe upper bounds keeping minor-unit money sums (hundredths) and
// scaled share/price figures (hundred-millionths) well within
// Number.MAX_SAFE_INTEGER across client inputs, Zod schemas, and writers.
export const maxPortfolioMoney = 1_000_000_000_000;
export const maxPortfolioScaled = 90_000_000;

// Refusal copy shown both on the client before opening ConfirmDialog
// and on the server in uploadPortfolio when a file exceeds 4 MB.
export const portfolioTooLarge = "The portfolio file is larger than 4 MB";

// Single-line text with no control characters or Unicode line/paragraph
// separators, matching src/data/schemas.ts.
const oneLine = /^[^\p{Cc}\p{Zl}\p{Zp}]*$/u;

const nameLimitMessage = "Name must be one line of up to 200 characters";
const isinLimitMessage = "ISIN must be one line of up to 32 characters";
const tickerLimitMessage = "Ticker must be one line of up to 32 characters";
const noteLimitMessage = "Note must be up to 1,000 characters";

const singleLineText = (max: number, message: string): z.ZodString =>
  z.string().trim().min(1).max(max, message).regex(oneLine, message);

const optionalSingleLineText = (
  max: number,
  message: string,
): z.ZodExactOptional<z.ZodString> =>
  singleLineText(max, message).exactOptional();

const optionalNote = z
  .string()
  .trim()
  .min(1)
  .max(1000, noteLimitMessage)
  .exactOptional();
const requiredId = z.string().trim().min(1).max(200).regex(oneLine);
const optionalId = requiredId.exactOptional();

const securityCurrency = z.string().regex(/^[A-Z]{3}$/u);
const cashCurrency = securityCurrency.refine(
  (code) => code !== "GBX",
  "Pence (GBX) is only valid for securities",
);
const isoDate = z
  .string()
  .refine(isIsoCalendarDate, "Enter a valid calendar date");

const nonNegativeMoney = z.number().min(0).max(maxPortfolioMoney);
const positiveMoney = nonNegativeMoney.refine(
  (value) => Math.round(value * 100) >= 1,
  "Must be greater than zero",
);
const nonNegativeScaled = z.number().min(0).max(maxPortfolioScaled);
const positiveScaled = nonNegativeScaled.refine(
  (value) => Math.round(value * 1e8) >= 1,
  "Must be greater than zero",
);

const transactionTypeValues: readonly [TransactionType, ...TransactionType[]] =
  [
    "cash-transfer",
    "deposit",
    "dividend",
    "fee",
    "fee-refund",
    "inbound-delivery",
    "interest",
    "interest-charge",
    "outbound-delivery",
    "purchase",
    "removal",
    "sale",
    "security-transfer",
    "tax",
    "tax-refund",
  ];

// Optimistic version for in-place portfolio file mutations: 1 up to
// Postgres int4 max minus 1 so version + 1 always fits.
export const afterVersionSchema = z.number().int().min(1).max(2_147_483_646);

// Server-side validation schema for requesting online quote lookups
// against stored securities in the household's .portfolio file.
export const fetchPortfolioQuotesInputSchema = z.object({
  securityIds: z
    .array(requiredId)
    .min(1, "Select at least one security")
    .max(100)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Each security can only be fetched once per batch",
    ),
});

// Server-side validation schema for appending a cash or securities account.
export const newPortfolioAccountSchema = z.discriminatedUnion("kind", [
  z.object({
    currency: cashCurrency,
    kind: z.literal("cash"),
    name: singleLineText(200, nameLimitMessage),
    note: optionalNote,
  }),
  z.object({
    kind: z.literal("securities"),
    name: singleLineText(200, nameLimitMessage),
    note: optionalNote,
    referenceAccountId: optionalId,
  }),
]) satisfies z.ZodType<NewPortfolioAccount>;

// Server-side validation schema for appending a security to the catalogue.
export const newPortfolioSecuritySchema = z.object({
  categoryId: optionalId,
  currency: securityCurrency,
  isin: optionalSingleLineText(32, isinLimitMessage),
  latestPrice: positiveScaled.nullable(),
  latestPriceDate: isoDate.exactOptional(),
  name: singleLineText(200, nameLimitMessage),
  note: optionalNote,
  ticker: optionalSingleLineText(32, tickerLimitMessage),
}) satisfies z.ZodType<NewPortfolioSecurity>;

// Server-side validation schema for appending any of Portfolio
// Performance's fifteen transaction types.
export const newPortfolioTransactionSchema = z
  .object({
    accountId: optionalId,
    amount: nonNegativeMoney,
    currency: cashCurrency,
    date: isoDate,
    fees: nonNegativeMoney,
    fxAmount: positiveMoney.exactOptional(),
    note: optionalNote,
    otherAccountId: optionalId,
    otherPortfolioId: optionalId,
    portfolioId: optionalId,
    securityId: optionalId,
    shares: nonNegativeScaled,
    taxes: nonNegativeMoney,
    type: z.enum(transactionTypeValues),
  })
  .refine(
    (tx) => tx.type === "security-transfer" || Math.round(tx.amount * 100) >= 1,
    "Amount must be greater than zero",
  )
  .refine(
    (tx) => !hasShareMovement(tx.type) || Math.round(tx.shares * 1e8) >= 1,
    "Shares must be greater than zero",
  ) satisfies z.ZodType<NewPortfolioTransaction>;

// Server-side validation schema for a batch of dated security quotes
// (1..1000 unique securities per save).
export const portfolioQuoteBatchSchema = z.object({
  date: isoDate,
  quotes: z
    .array(
      z.object({
        date: isoDate.exactOptional(),
        price: positiveScaled,
        securityId: requiredId,
      }),
    )
    .min(1, "Enter at least one security price")
    .max(1000)
    .refine(
      (quotes) =>
        new Set(quotes.map((entry) => entry.securityId)).size === quotes.length,
      "Each security can only be updated once per batch",
    ),
}) satisfies z.ZodType<PortfolioQuoteBatch>;

// Human-readable names for every Portfolio Performance transaction type.
export const transactionTypeLabels: Record<TransactionType, string> = {
  "cash-transfer": "Cash transfer",
  deposit: "Deposit",
  dividend: "Dividend",
  fee: "Fee",
  "fee-refund": "Fee refund",
  "inbound-delivery": "Inbound delivery",
  interest: "Interest",
  "interest-charge": "Interest charge",
  "outbound-delivery": "Outbound delivery",
  purchase: "Purchase",
  removal: "Removal",
  sale: "Sale",
  "security-transfer": "Security transfer",
  tax: "Tax",
  "tax-refund": "Tax refund",
};

// The fifteen transaction types grouped for filter and dialog selects.
export const transactionTypeGroups: readonly OptionGroup<TransactionType>[] = [
  {
    label: "Trades",
    options: optionsOf(transactionTypeLabels, ["purchase", "sale"]),
  },
  {
    label: "Deliveries",
    options: optionsOf(transactionTypeLabels, [
      "inbound-delivery",
      "outbound-delivery",
    ]),
  },
  {
    label: "Cash flow",
    options: optionsOf(transactionTypeLabels, ["deposit", "removal"]),
  },
  {
    label: "Income & costs",
    options: optionsOf(transactionTypeLabels, [
      "dividend",
      "interest",
      "interest-charge",
      "tax",
      "tax-refund",
      "fee",
      "fee-refund",
    ]),
  },
  {
    label: "Transfers",
    options: optionsOf(transactionTypeLabels, [
      "cash-transfer",
      "security-transfer",
    ]),
  },
];

const statusRank: Record<HoldingStatus, number> = {
  "no-fx": 1,
  unpriced: 1,
  valued: 0,
  zero: 2,
};

// The Accounts section laid out by UUID: each visible securities
// account paired with its visible reference cash account (marking a
// shared reference account after its first appearance so its balance is
// shown and totalled once), every remaining visible cash account listed
// standalone, and sterling subtotals that reconcile to the penny.
export function accountsLayoutOf(
  securitiesAccounts: readonly SecuritiesAccount[],
  cashAccounts: readonly CashAccount[],
  isShowingRetired: boolean,
): AccountsLayout {
  const hasRetired =
    securitiesAccounts.some((account) => account.isRetired) ||
    cashAccounts.some((account) => account.isRetired);
  const visibleSecurities = isShowingRetired
    ? securitiesAccounts
    : securitiesAccounts.filter((account) => !account.isRetired);
  const visibleCash = isShowingRetired
    ? cashAccounts
    : cashAccounts.filter((account) => !account.isRetired);

  const cashById = new Map(visibleCash.map((account) => [account.id, account]));
  const seenReferenceIds = new Set<string>();
  const uniqueReferences: CashAccount[] = [];

  const pairs: readonly AccountPair[] = visibleSecurities.map((securities) => {
    const linked =
      securities.referenceAccountId === undefined
        ? undefined
        : cashById.get(securities.referenceAccountId);
    if (linked === undefined) {
      return { reference: null, securities };
    }
    const isShared = seenReferenceIds.has(linked.id);
    if (!isShared) {
      seenReferenceIds.add(linked.id);
      uniqueReferences.push(linked);
    }
    return { reference: { account: linked, isShared }, securities };
  });

  const standaloneCash = visibleCash.filter(
    (account) => !seenReferenceIds.has(account.id),
  );
  const investedTotal = roundPence(
    sumOf(visibleSecurities, (account) => account.marketValue),
  );
  const { excludedCurrencies: refCashExcluded, totalGbp: refCashTotal } =
    cashTotalsOf(uniqueReferences);
  const {
    excludedCurrencies: standaloneCashExcluded,
    totalGbp: standaloneCashTotal,
  } = cashTotalsOf(standaloneCash);

  return {
    hasRetired,
    investedTotal,
    pairs,
    refCashExcluded,
    refCashTotal,
    standaloneCash,
    standaloneCashExcluded,
    standaloneCashTotal,
    total: roundPence(investedTotal + refCashTotal + standaloneCashTotal),
  };
}

// The sterling total across a set of cash accounts, to two decimal
// places, alongside the sorted distinct currencies of any accounts
// holding a non-zero balance with no known GBP rate.
export function cashTotalsOf(accounts: readonly CashAccount[]): CashTotals {
  const totalGbp = roundPence(
    sumOf(accounts, (account) => account.balanceGbp ?? 0),
  );
  const excludedCurrencies = [
    ...new Set(
      accounts
        .filter(
          (account) => account.balanceGbp === null && account.balance !== 0,
        )
        .map((account) => account.currency),
    ),
  ].toSorted((one, other) => one.localeCompare(other));
  return { excludedCurrencies, totalGbp };
}

// The ISO date stamped onto synced household targets: the latest
// known data date from active security quotes or transactions,
// falling back to the upload/mutation save date when the file carries
// neither.
export function effectiveSyncedOn({
  latestQuoteDate,
  latestTransactionDate,
  savedOn,
}: {
  readonly latestQuoteDate: null | string;
  readonly latestTransactionDate: null | string;
  readonly savedOn: string;
}): string {
  if (latestQuoteDate !== null && latestTransactionDate !== null) {
    return latestQuoteDate >= latestTransactionDate
      ? latestQuoteDate
      : latestTransactionDate;
  }
  return latestQuoteDate ?? latestTransactionDate ?? savedOn;
}

// The Holdings section prepared under an account filter and zero-share
// toggle: aggregates across active securities accounts when accountId
// is empty, scopes to a single account UUID otherwise, sorts valued
// rows by sterling value descending followed by unpriced/no-fx and
// zero-share rows alphabetically, and computes shares against the shown
// subtotal so filtered views sum to 100%.
export function holdingsViewOf(
  holdings: readonly Holding[],
  { accountId, isShowingZeroShares }: HoldingsFilter,
): HoldingsView {
  const candidates = holdings.map((holding) =>
    holdingCandidateOf(holding, accountId),
  );
  const hasZeroShare = candidates.some((row) => row.status === "zero");
  const visible = (
    isShowingZeroShares
      ? candidates
      : candidates.filter((row) => row.status !== "zero")
  ).toSorted(compareHoldingRows);
  const totalGbp = roundPence(sumOf(visible, (row) => row.marketValueGbp ?? 0));
  const hasForeignPrices = visible.some(
    (row) =>
      row.holding.latestPrice !== null &&
      row.holding.currency !== "" &&
      row.holding.currency !== "GBP" &&
      row.holding.currency !== "GBX",
  );
  const rows: readonly HoldingRow[] = visible.map((row) => ({
    ...row,
    share:
      totalGbp > 0 && row.marketValueGbp !== null
        ? row.marketValueGbp / totalGbp
        : 0,
  }));
  return { hasForeignPrices, hasZeroShare, rows, totalGbp };
}

// Whether a string is a valid four-digit Gregorian calendar date in
// YYYY-MM-DD form (years 1000..9999), rejecting rollovers such as
// 2026-02-31 or out-of-range years such as 0500-01-01.
export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  if (year < 1000) {
    return false;
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
  );
}

// A bookkeeping sum rounded to the penny, with minus nothing normalised
// to zero.
export function roundPence(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

// Which way a transaction's amount moves cash: in (+), out (−), or
// neutral (deliveries and internal transfers).
export function transactionDirectionOf(
  type: TransactionType,
): "in" | "neutral" | "out" {
  switch (type) {
    case "cash-transfer":
    case "inbound-delivery":
    case "outbound-delivery":
    case "security-transfer":
      return "neutral";
    case "deposit":
    case "dividend":
    case "fee-refund":
    case "interest":
    case "sale":
    case "tax-refund":
      return "in";
    case "fee":
    case "interest-charge":
    case "purchase":
    case "removal":
    case "tax":
      return "out";
  }
}

// Transactions matching the optional account/portfolio UUID, security
// UUID, and transaction type filters, preserving the caller's order.
export function transactionsViewOf(
  transactions: readonly PortfolioTransaction[],
  { accountId, securityId, type }: TransactionsFilter,
): readonly PortfolioTransaction[] {
  return transactions.filter((transaction) => {
    if (
      accountId !== "" &&
      transaction.accountId !== accountId &&
      transaction.portfolioId !== accountId &&
      transaction.otherAccountId !== accountId &&
      transaction.otherPortfolioId !== accountId
    ) {
      return false;
    }
    if (securityId !== "" && transaction.securityId !== securityId) {
      return false;
    }
    return type === "" || transaction.type === type;
  });
}

// Formats a portfolio mutation's toast description, appending a calm
// warning when auto-syncing the household target allocation failed.
export function withSyncNote(
  description: string,
  syncWarning: string | undefined,
): string {
  return syncWarning === undefined
    ? description
    : `${description}. Targets not synced: ${syncWarning}`;
}

// Valued holdings first (largest sterling value first, then by name),
// then unpriced / missing-FX holdings alphabetically, then zero-share
// securities alphabetically.
function compareHoldingRows(one: HoldingRow, other: HoldingRow): number {
  const rankDiff = statusRank[one.status] - statusRank[other.status];
  if (rankDiff !== 0) {
    return rankDiff;
  }
  const valueDiff = Number(other.marketValueGbp) - Number(one.marketValueGbp);
  return valueDiff === 0
    ? one.holding.name.localeCompare(other.holding.name)
    : valueDiff;
}

function hasShareMovement(type: TransactionType): boolean {
  return (
    type === "purchase" ||
    type === "sale" ||
    type === "inbound-delivery" ||
    type === "outbound-delivery" ||
    type === "security-transfer"
  );
}

// One security's share count, account count and sterling valuation
// under an optional single-account UUID filter. Each account lot is
// rounded to the penny before summing so Holdings and Accounts totals
// reconcile identically whether filtered or unfiltered.
function holdingCandidateOf(holding: Holding, accountId: string): HoldingRow {
  const lots =
    accountId === ""
      ? holding.sharesByAccount
      : holding.sharesByAccount.filter(
          (entry) => entry.portfolioId === accountId,
        );
  const shares =
    accountId === "" ? holding.shares : sumOf(lots, (entry) => entry.shares);
  const { marketValueGbp, status } = valuationOf(holding, lots, shares);
  return {
    accountCount: lots.length,
    holding,
    marketValueGbp,
    share: 0,
    shares,
    status,
  };
}

function valuationOf(
  holding: Holding,
  lots: readonly AccountShares[],
  shares: number,
): { readonly marketValueGbp: null | number; readonly status: HoldingStatus } {
  if (shares <= 0) {
    return { marketValueGbp: 0, status: "zero" };
  }
  if (holding.latestPrice === null) {
    return { marketValueGbp: null, status: "unpriced" };
  }
  if (holding.gbpRate === null) {
    return { marketValueGbp: null, status: "no-fx" };
  }
  const { gbpRate, latestPrice } = holding;
  return {
    marketValueGbp: roundPence(
      sumOf(lots, (lot) => roundPence(lot.shares * latestPrice * gbpRate)),
    ),
    status: "valued",
  };
}
