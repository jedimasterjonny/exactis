import type { Unzipped } from "fflate";

import { strToU8, zipSync } from "fflate";

import type {
  CashAccount,
  DeletePortfolioAccount,
  DeletePortfolioSecurity,
  DeletePortfolioTransaction,
  EditPortfolioAccount,
  EditPortfolioSecurity,
  EditPortfolioTransaction,
  Holding,
  NewPortfolioAccount,
  NewPortfolioSecurity,
  NewPortfolioTransaction,
  PortfolioCategory,
  PortfolioFeed,
  PortfolioGrossValue,
  PortfolioQuoteBatch,
  PortfolioQuoteUpdate,
  PortfolioSnapshot,
  PortfolioTransaction,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";
import type { Portfolio, Target } from "@/data/targets";
import type { QuotableSecurity } from "@/lib/portfolio-quotes";
import type { Message } from "@/lib/protobuf";

import {
  cashTotalsOf,
  isIsoCalendarDate,
  maxPortfolioBytes,
  maxPortfolioMoney,
  maxPortfolioScaled,
  roundPence,
} from "@/data/portfolio";
import { answerOf, Refusal } from "@/lib/answer";
import { counted } from "@/lib/count";
import { sumOf } from "@/lib/ledger";
import { formatPercent } from "@/lib/money";
import { yahooFeeds } from "@/lib/portfolio-quotes";
import {
  bytesAt,
  delimitedOf,
  int32At,
  int64At,
  joined,
  messageOf,
  messagesAt,
  textAt,
  textField,
  wholeField,
  withMessageAt,
  withMessagesAt,
  withoutField,
  withReplacedMessagesAt,
  withTextAt,
  withWholeAt,
} from "@/lib/protobuf";
import { unzipped } from "@/lib/workbook";

// A holding assigned to a class as the file gives it: the id of the
// vehicle, a security or an account, and how much of the holding the
// class takes, in hundredths of a per cent, since a holding may be
// split between classes.
interface Assignment {
  readonly vehicle: string;
  readonly weight: number;
}

// A class of the taxonomy as the file gives it: its id, the id of the
// class it sits beneath, which only the taxonomy's root has none of,
// its name, its weight of its parent, its place among the classes
// beside it, and the holdings assigned to it.
interface Class {
  readonly assignments: readonly Assignment[];
  readonly id: string;
  readonly name: string;
  readonly parent: string | undefined;
  readonly rank: number;
  readonly weight: number;
}

// Validated cross-currency GROSS_VALUE unit ready to serialize into a
// PTransactionUnit message.
interface GrossValueSpec {
  readonly amountPence: number;
  readonly currency: string;
  readonly fxAmountMinor: number;
  readonly fxCurrency: string;
  readonly rate: number;
}

// A file opened: the parts of the zip, and the client's protobuf behind
// the signature.
interface Opened {
  readonly client: Uint8Array;
  readonly parts: Unzipped;
}

// Per-securities-account valuation and completeness diagnostics shared
// by readPortfolioSnapshot and readPortfolioFeed.
interface PortfolioValuation {
  readonly foreignCurrencies: readonly string[];
  readonly hasUncurrenciedHoldings: boolean;
  readonly holdingsCount: number;
  readonly marketValueGbp: number;
  readonly noFxCurrencies: readonly string[];
  readonly oldestQuoteDate: null | string;
  readonly unpricedCount: number;
}

interface PortfolioValuationAccumulator {
  readonly foreignCurrencies: Set<string>;
  hasUncurrenciedHoldings: boolean;
  hasUndatedQuote: boolean;
  holdingsCount: number;
  readonly noFxCurrencies: Set<string>;
  oldestQuoteDate: null | string;
  unpricedCount: number;
  valueSum: number;
}

// Validated transaction payload ready for appendTransaction or updateTransaction.
interface PreparedTransaction {
  readonly amountPence: number;
  readonly currency: string;
  readonly date: string;
  readonly dateBytes: Uint8Array;
  readonly feesPence: number;
  readonly grossValue: GrossValueSpec | undefined;
  readonly note: string | undefined;
  readonly refs: ResolvedTransactionRefs;
  readonly rule: TransactionWriteRule;
  readonly sharesScaled: number;
  readonly taxesPence: number;
}

// Shared decoded cash-account base fields used by both
// readPortfolioSnapshot and readPortfolioFeed so balances reconcile.
interface RawCashAccount {
  readonly balance: number;
  readonly balanceGbp: null | number;
  readonly currency: string;
  readonly id: string;
  readonly isRetired: boolean;
  readonly name: string;
  readonly note: string | undefined;
}

// Raw protobuf transaction counts keyed by entity UUID across every
// PTransaction message (regardless of enum type, counting self-transfers
// once per transaction).
interface RawTransactionCounts {
  readonly cashAccounts: ReadonlyMap<string, number>;
  readonly securities: ReadonlyMap<string, number>;
  readonly securitiesAccounts: ReadonlyMap<string, number>;
}

// Validated account, portfolio and security UUIDs (plus optional
// cross-currency counterpart) resolved for a transaction against raw
// protobuf field-1 ids.
interface ResolvedTransactionRefs {
  readonly accountId: string | undefined;
  readonly fxCurrency: string | undefined;
  readonly otherAccountId: string | undefined;
  readonly otherPortfolioId: string | undefined;
  readonly portfolioId: string | undefined;
  readonly securityId: string | undefined;
}

// A security as the file holds and prices it: its name, quote currency
// (or "no currency" when omitted), optional ISIN, ticker, note and
// retired flag, its last positive price in that currency (or 0 when
// unpriced), and the ISO date of that quote, or null when undated.
interface Security {
  readonly currency: string;
  readonly isin: string | undefined;
  readonly isRetired: boolean;
  readonly name: string;
  readonly note: string | undefined;
  readonly price: number;
  readonly quoteDate: null | string;
  readonly ticker: string | undefined;
}

// Single-leaf Asset Allocation assignment status for one security UUID:
// a unique 100% root-reachable named leaf id, or split/complex status
// when assigned across multiple classes, partial weight, or a non-leaf.
interface SecurityCategoryStatus {
  readonly categoryId: string | undefined;
  readonly isSplitCategory: boolean;
}

// A named leaf class reachable from the taxonomy's root alongside the
// trimmed ancestor class names beneath the root for disambiguation.
interface TaxonomyLeaf {
  readonly ancestors: readonly string[];
  readonly assignments: readonly Assignment[];
  readonly id: string;
  readonly name: string;
  readonly sourceClass: Class;
}

// Declarative wire and validation rule for writing each of Portfolio
// Performance's fifteen PTransaction.Type values.
interface TransactionWriteRule {
  readonly code: number;
  readonly hasAccount: boolean;
  readonly hasCosts: boolean;
  readonly hasCrossEntry: boolean;
  readonly hasOtherAccount: boolean;
  readonly hasOtherPortfolio: boolean;
  readonly hasPortfolio: boolean;
  readonly hasSecurity: boolean;
  readonly hasShares: boolean;
  readonly isAmountOptional: boolean;
  readonly isCostsBoundedByAmount: boolean;
}

// A taxonomy's classes as the tree from its root: the root, and the
// classes beneath any class, in the order Portfolio Performance ranks
// them.
interface Tree {
  readonly beneath: (above: Class) => readonly Class[];
  readonly root: Class;
}

// Optional deterministic clock and id generator for testing protobuf
// writers without wall-clock or random UUID nondeterminism.
interface WriteOptions {
  readonly now?: Date;
  readonly today?: string;
  readonly uuid?: () => string;
}

// The taxonomy the target allocation is read from, as tradey reads it.
const taxonomy = "Asset Allocation";

// What Portfolio Performance writes ahead of the protobuf in a file
// saved in binary, and the part of the zip it writes both to.
const signature = "PPPBV1";
const part = "data.portfolio";

// What Portfolio Performance writes at the head of a file it saves with
// a password, at the head of one it saves as XML, and the part of the
// zip it writes XML to when it compresses it.
const encrypted = "PORTFOLIO";
const xml = "<";
const xmlPart = "data.xml";

// Why a file saved as XML, compressed or not, is refused.
const savedAsXml =
  "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read";

// A class's weight of the whole of its parent, and a holding's of the
// whole of itself, as Portfolio Performance writes a weight: in
// hundredths of a per cent.
const whole = 10_000;

// How far shares given to write may add up from the whole: nothing but
// the rounding of the arithmetic that made them, as the household
// holds the targets.
const tolerance = 1e-9;

// What a count of shares and a price are both written in:
// hundred-millionths.
const scaled = 1e8;

// List formatter for naming referencing accounts in delete refusals.
const listFormat = new Intl.ListFormat("en-GB");

// What a pound is in each currency the reader prices on its own,
// sterling and pence. Any other is priced at a rate read off the file's
// transactions, or refused by name when none gives one, rather than
// priced wrongly or at nothing.
const factors: ReadonlyMap<string, number> = new Map([
  ["GBP", 1],
  ["GBX", 0.01],
]);

// What a transaction of each type does to what its securities account
// holds of its security: a purchase or a delivery in adds its shares, a
// sale or a delivery out takes them off, and the rest, a dividend or a
// fee, moves none, so is not listed.
const signs: ReadonlyMap<number, -1 | 1> = new Map([
  [0, 1],
  [1, -1],
  [2, 1],
  [3, -1],
]);

// The type of a transaction moving shares from one securities account
// to another, which Portfolio Performance writes once, from the account
// it names to the other it names.
const transfer = 4;

// The types of a transaction moving cash from one cash account to
// another, which Portfolio Performance writes once, from the account it
// names to the other it names; of one paying cash into an account from
// outside the file; and of one taking it out.
const cashTransfer = 5;
const deposit = 6;
const removal = 7;

// What an amount of money is written in: hundredths of the currency.
const hundredths = 100;

// Unit type tags in PTransactionUnit.Type and the highest known
// PTransaction.Type enum value (0..14).
const grossValueUnit = 0;
const taxUnit = 1;
const feeUnit = 2;
const maxTransactionType = 14;

// Bounds for decoding PDecimalValue exchange rates without overflowing
// JS Number precision or allocating huge exponents.
const maxDecimalBytes = 16;
const maxDecimalScale = 18;

// Safe epoch-day and epoch-second ranges producing valid four-digit ISO
// years (1000..9999).
const minEpochDay = -354_285;
const maxEpochDay = 2_932_896;
const minTimestamp = -30_610_224_000;
const maxTimestamp = 253_402_300_799;

// Every transaction type enum Portfolio Performance writes in
// PTransaction.Type (0..14); unknown future enum values are skipped
// rather than throwing when opening a file.
const transactionTypes: ReadonlyMap<number, TransactionType> = new Map([
  [0, "purchase"],
  [1, "sale"],
  [2, "inbound-delivery"],
  [3, "outbound-delivery"],
  [4, "security-transfer"],
  [5, "cash-transfer"],
  [6, "deposit"],
  [7, "removal"],
  [8, "dividend"],
  [9, "interest"],
  [10, "interest-charge"],
  [11, "tax"],
  [12, "tax-refund"],
  [13, "fee"],
  [14, "fee-refund"],
]);

// What a transaction of each type does to the cash account it names: a
// sale, a deposit, a dividend, interest and a refund put its amount in,
// and a purchase, a removal, interest charged, a tax and a fee take it
// out, as does cash moved to another account, which puts it into the
// other; a delivery or a transfer of shares moves no cash, so is not
// listed. Portfolio Performance writes every amount above nothing and
// says which way it goes by the type.
const cashSigns: ReadonlyMap<number, -1 | 1> = new Map([
  [0, -1],
  [1, 1],
  [8, 1],
  [9, 1],
  [10, -1],
  [11, -1],
  [12, 1],
  [13, -1],
  [14, 1],
  [cashTransfer, -1],
  [deposit, 1],
  [removal, -1],
]);

// The fields read, by their numbers in Portfolio Performance's
// client.proto: the client's securities, cash accounts, securities
// accounts, transactions and taxonomies, a security's id, name, currency
// and prices, a cash account's id and currency, a securities account's
// id, name and the cash account it takes as its reference, a price's
// close, a transaction's type, date, currency, amount, shares,
// security, units, cash account and the other it moves cash to,
// securities account and the other it moves shares to, a timestamp's
// seconds, a unit's amount and the same in the currency it was carried
// from, a taxonomy's name and classes, what a class holds, and a
// holding's vehicle and weight.
const fields = {
  account: { currency: 3, id: 1, isRetired: 5, name: 2, note: 4, updatedAt: 7 },
  assignment: { rank: 3, vehicle: 1, weight: 2 },
  class: { assignments: 9, id: 1, name: 3, parent: 2, rank: 7, weight: 6 },
  client: {
    accounts: 3,
    baseCurrency: 12,
    portfolios: 4,
    securities: 2,
    taxonomies: 8,
    transactions: 5,
  },
  decimal: { precision: 2, scale: 1, value: 3 },
  portfolio: {
    id: 1,
    isRetired: 4,
    name: 2,
    note: 3,
    reference: 5,
    updatedAt: 7,
  },
  price: { close: 2, date: 1 },
  security: {
    currency: 4,
    feed: 11,
    id: 1,
    isin: 7,
    isRetired: 20,
    latest: 16,
    latestFeed: 14,
    name: 3,
    note: 6,
    prices: 13,
    ticker: 8,
    updatedAt: 21,
  },
  taxonomy: { classes: 5, name: 2 },
  timestamp: { nanos: 2, seconds: 1 },
  transaction: {
    account: 3,
    amount: 11,
    currency: 10,
    date: 9,
    id: 1,
    note: 13,
    otherAccount: 5,
    otherPortfolio: 6,
    otherUpdatedAt: 8,
    otherUuid: 7,
    portfolio: 4,
    security: 14,
    shares: 12,
    type: 2,
    units: 15,
    updatedAt: 16,
  },
  unit: {
    amount: 2,
    currency: 3,
    fxAmount: 4,
    fxCurrency: 5,
    fxRateToBase: 6,
    type: 1,
  },
} as const;

const baseRule: Omit<TransactionWriteRule, "code"> = {
  hasAccount: false,
  hasCosts: false,
  hasCrossEntry: false,
  hasOtherAccount: false,
  hasOtherPortfolio: false,
  hasPortfolio: false,
  hasSecurity: false,
  hasShares: false,
  isAmountOptional: false,
  isCostsBoundedByAmount: false,
};

const cashOnlyRule: Omit<TransactionWriteRule, "code"> = {
  ...baseRule,
  hasAccount: true,
};

const transactionWriteRules: Record<TransactionType, TransactionWriteRule> = {
  "cash-transfer": {
    ...cashOnlyRule,
    code: cashTransfer,
    hasCrossEntry: true,
    hasOtherAccount: true,
  },
  deposit: { ...cashOnlyRule, code: deposit },
  dividend: { ...cashOnlyRule, code: 8, hasCosts: true, hasSecurity: true },
  fee: { ...cashOnlyRule, code: 13 },
  "fee-refund": { ...cashOnlyRule, code: 14 },
  "inbound-delivery": {
    ...baseRule,
    code: 2,
    hasCosts: true,
    hasPortfolio: true,
    hasSecurity: true,
    hasShares: true,
    isCostsBoundedByAmount: true,
  },
  interest: { ...cashOnlyRule, code: 9 },
  "interest-charge": { ...cashOnlyRule, code: 10 },
  "outbound-delivery": {
    ...baseRule,
    code: 3,
    hasCosts: true,
    hasPortfolio: true,
    hasSecurity: true,
    hasShares: true,
  },
  purchase: {
    ...cashOnlyRule,
    code: 0,
    hasCosts: true,
    hasCrossEntry: true,
    hasPortfolio: true,
    hasSecurity: true,
    hasShares: true,
    isCostsBoundedByAmount: true,
  },
  removal: { ...cashOnlyRule, code: removal },
  sale: {
    ...cashOnlyRule,
    code: 1,
    hasCosts: true,
    hasCrossEntry: true,
    hasPortfolio: true,
    hasSecurity: true,
    hasShares: true,
  },
  "security-transfer": {
    ...baseRule,
    code: transfer,
    hasCrossEntry: true,
    hasOtherPortfolio: true,
    hasPortfolio: true,
    hasSecurity: true,
    hasShares: true,
    isAmountOptional: true,
  },
  tax: { ...cashOnlyRule, code: 11 },
  "tax-refund": { ...cashOnlyRule, code: 12 },
};

// Appends a new cash account (PAccount) or securities account
// (PPortfolio) to a binary Portfolio Performance file, preserving every
// existing protobuf message, unknown field and sibling zip entry byte
// for byte.
export function appendAccount(
  file: Uint8Array,
  input: NewPortfolioAccount,
  options?: WriteOptions,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const { makeId, now } = writeContextOf(options);
  let id = "";
  const content = rewriteClient(file, (clientBytes) => {
    const name = trimmedRequired(input.name, "Account name");
    const note = trimmedOptional(input.note);
    const updatedAt = timestampBytesOf(now);
    if (input.kind === "cash") {
      const currency = currencyCodeOf(input.currency, {
        isPenceAllowed: false,
      });
      id = makeId();
      const entry = joined([
        textField(fields.account.id, id),
        textField(fields.account.name, name),
        textField(fields.account.currency, currency),
        ...(note === undefined ? [] : [textField(fields.account.note, note)]),
        delimitedOf(fields.account.updatedAt, updatedAt),
      ]);
      return joined([clientBytes, delimitedOf(fields.client.accounts, entry)]);
    }
    const referenceAccountId = trimmedOptional(input.referenceAccountId);
    if (referenceAccountId !== undefined) {
      const cashIds = rawIdsOf(
        messageOf(clientBytes),
        fields.client.accounts,
        fields.account.id,
      );
      if (!cashIds.has(referenceAccountId)) {
        throw new Refusal("The selected reference cash account was not found");
      }
    }
    id = makeId();
    const entry = joined([
      textField(fields.portfolio.id, id),
      textField(fields.portfolio.name, name),
      ...(note === undefined ? [] : [textField(fields.portfolio.note, note)]),
      ...(referenceAccountId === undefined
        ? []
        : [textField(fields.portfolio.reference, referenceAccountId)]),
      delimitedOf(fields.portfolio.updatedAt, updatedAt),
    ]);
    return joined([clientBytes, delimitedOf(fields.client.portfolios, entry)]);
  });
  return { content, id };
}

// Appends a new catalogued security (PSecurity) with an optional dated
// historical quote and optional Asset Allocation leaf assignment,
// preserving untouched entries and sibling zip parts byte for byte.
export function appendSecurity(
  file: Uint8Array,
  input: NewPortfolioSecurity,
  options?: WriteOptions,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const { makeId, now, today } = writeContextOf(options);
  let id = "";
  const content = rewriteClient(file, (clientBytes) => {
    const name = trimmedRequired(input.name, "Security name");
    const currency = currencyCodeOf(input.currency, { isPenceAllowed: true });
    const isin = trimmedOptional(input.isin);
    const ticker = trimmedOptional(input.ticker);
    const note = trimmedOptional(input.note);
    const categoryId = trimmedOptional(input.categoryId);
    const priceField = initialPriceFieldOf(input, today);
    const client = messageOf(clientBytes);
    const leafIndex =
      categoryId === undefined ? -1 : taxonomyLeafIndexOf(client, categoryId);
    if (categoryId !== undefined && leafIndex === -1) {
      throw new Refusal("The selected asset class was not found");
    }
    id = makeId();
    const entry = joined([
      textField(fields.security.id, id),
      textField(fields.security.name, name),
      textField(fields.security.currency, currency),
      ...(note === undefined ? [] : [textField(fields.security.note, note)]),
      ...(isin === undefined ? [] : [textField(fields.security.isin, isin)]),
      ...(ticker === undefined
        ? []
        : [textField(fields.security.ticker, ticker)]),
      ...(priceField === undefined ? [] : [priceField]),
      delimitedOf(fields.security.updatedAt, timestampBytesOf(now)),
    ]);
    const withSecurity = joined([
      clientBytes,
      delimitedOf(fields.client.securities, entry),
    ]);
    return leafIndex === -1
      ? withSecurity
      : withAssignedCategory(withSecurity, leafIndex, id);
  });
  return { content, id };
}

// Appends a new transaction (PTransaction) of any of Portfolio
// Performance's fifteen types, verifying raw protobuf references,
// cash-account currency matching, integer minor-unit positivity and
// cost bounds, and cross-entry uuid/updatedAt invariants.
export function appendTransaction(
  file: Uint8Array,
  input: NewPortfolioTransaction,
  options?: WriteOptions,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const { makeId, now } = writeContextOf(options);
  let id = "";
  const content = rewriteClient(file, (clientBytes) => {
    const prepared = prepareTransactionMutation(messageOf(clientBytes), input);
    id = makeId();
    const entry = buildTransactionBytes({
      amountPence: prepared.amountPence,
      currency: prepared.currency,
      dateBytes: prepared.dateBytes,
      feesPence: prepared.feesPence,
      grossValue: prepared.grossValue,
      id,
      note: prepared.note,
      otherId: prepared.rule.hasCrossEntry ? makeId() : undefined,
      refs: prepared.refs,
      rule: prepared.rule,
      sharesScaled: prepared.sharesScaled,
      taxesPence: prepared.taxesPence,
      updatedAt: timestampBytesOf(now),
    });
    return joined([
      clientBytes,
      delimitedOf(fields.client.transactions, entry),
    ]);
  });
  return { content, id };
}

// Deletes an existing cash or securities account after verifying a
// unique raw protobuf field-1 match, zero raw touching transactions,
// and (for cash accounts) zero referencing securities accounts, while
// stripping any taxonomy assignments referencing the deleted UUID.
export function deleteAccount(
  file: Uint8Array,
  input: DeletePortfolioAccount,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const id = trimmedRequired(input.id, "Account");
  const content = rewriteClient(file, (clientBytes) => {
    const client = messageOf(clientBytes);
    const listField =
      input.kind === "cash" ? fields.client.accounts : fields.client.portfolios;
    const idField =
      input.kind === "cash" ? fields.account.id : fields.portfolio.id;
    const label = input.kind === "cash" ? "cash account" : "securities account";
    requireUniqueRawId(client, { idField, label, listField, targetId: id });
    const txCounts = rawTransactionCountsOf(
      messagesAt(client, fields.client.transactions),
    );
    const txCount =
      (input.kind === "cash"
        ? txCounts.cashAccounts.get(id)
        : txCounts.securitiesAccounts.get(id)) ?? 0;
    if (txCount > 0) {
      throw new Refusal(
        `Used by ${counted(txCount, "transaction")} — retire it instead`,
      );
    }
    if (input.kind === "cash") {
      const referencing = messagesAt(client, fields.client.portfolios)
        .filter(
          (portfolio) =>
            optionalText(portfolio, fields.portfolio.reference) === id,
        )
        .map(
          (portfolio) =>
            optionalText(portfolio, fields.portfolio.name) ??
            "a securities account",
        );
      if (referencing.length > 0) {
        throw new Refusal(
          `Referenced by ${listFormat.format(referencing)} — unlink first to delete, or retire it instead`,
        );
      }
    }
    const withoutAccount = withReplacedMessagesAt(
      clientBytes,
      listField,
      (entries) =>
        entries.filter((raw) => optionalText(messageOf(raw), idField) !== id),
    );
    return stripTaxonomyAssignments(withoutAccount, id, {
      isAssetAllocationOnly: false,
    });
  });
  return { content, id };
}

// Deletes an existing catalogued security after verifying a unique raw
// protobuf field-1 match and zero raw touching transactions, stripping
// any taxonomy assignments referencing the deleted UUID.
export function deleteSecurity(
  file: Uint8Array,
  input: DeletePortfolioSecurity,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const id = trimmedRequired(input.id, "Security");
  const content = rewriteClient(file, (clientBytes) => {
    const client = messageOf(clientBytes);
    requireUniqueRawId(client, {
      idField: fields.security.id,
      label: "security",
      listField: fields.client.securities,
      targetId: id,
    });
    const txCount =
      rawTransactionCountsOf(
        messagesAt(client, fields.client.transactions),
      ).securities.get(id) ?? 0;
    if (txCount > 0) {
      throw new Refusal(
        `Used by ${counted(txCount, "transaction")} — retire it instead`,
      );
    }
    const withoutSecurity = withReplacedMessagesAt(
      clientBytes,
      fields.client.securities,
      (entries) =>
        entries.filter(
          (raw) => optionalText(messageOf(raw), fields.security.id) !== id,
        ),
    );
    return stripTaxonomyAssignments(withoutSecurity, id, {
      isAssetAllocationOnly: false,
    });
  });
  return { content, id };
}

// Deletes an existing transaction after verifying a unique raw protobuf
// field-1 match, preserving every other transaction and unknown field
// byte for byte.
export function deleteTransaction(
  file: Uint8Array,
  input: DeletePortfolioTransaction,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const id = trimmedRequired(input.id, "Transaction");
  const content = rewriteClient(file, (clientBytes) => {
    const client = messageOf(clientBytes);
    requireUniqueRawId(client, {
      idField: fields.transaction.id,
      label: "transaction",
      listField: fields.client.transactions,
      targetId: id,
    });
    return withReplacedMessagesAt(
      clientBytes,
      fields.client.transactions,
      (entries) =>
        entries.filter(
          (raw) => optionalText(messageOf(raw), fields.transaction.id) !== id,
        ),
    );
  });
  return { content, id };
}

// Opens a binary Portfolio Performance file once and extracts the
// lightweight feed consumed by Assumptions, Month end, and Cogitator:
// quote and transaction freshness dates, validated target categories
// and portfolios (or their refusal), and active account/category
// handoff lookups.
export function readPortfolioFeed(file: Uint8Array): PortfolioFeed {
  const client = messageOf(opened(file).client);
  const securities = securitiesOf(client);
  const held = sharesHeld(client);
  const pounds = poundsPer(client);
  const rawTransactions = messagesAt(client, fields.client.transactions);
  const accounts = feedAccountsOf(client, {
    held,
    pounds,
    rawTransactions,
    securities,
  });
  const latestQuoteDate = latestQuoteDateOf(
    securities,
    held,
    activePortfolioIdsOf(client),
  );
  const latestTransactionDate = latestTransactionDateOf(rawTransactions);
  const targets = answerOf(() => {
    const categories = readTargetsFromClient(client);
    validateTargetShares(categories);
    return { categories, portfolios: readPortfoliosFromClient(client) };
  });
  const { categories } = taxonomyInfoOf(client, securities);
  const securitiesAccounts = messagesAt(client, fields.client.portfolios)
    .filter((portfolio) => int32At(portfolio, fields.portfolio.isRetired) === 0)
    .flatMap((portfolio) => {
      const id = optionalText(portfolio, fields.portfolio.id);
      const name = textOf(portfolio, fields.portfolio.name);
      return id === undefined || name.trim() === "" ? [] : [{ id, name }];
    });
  const handoffPortfolioIds = new Set(
    securitiesAccounts.map((account) => account.id),
  );
  const securitiesByCategory = Object.fromEntries(
    categories.map((category) => [
      category.id,
      category.securityIds.map((id) => ({
        heldInAccountIds: [...(held.get(id) ?? [])]
          .filter(
            ([portfolioId, written]) =>
              handoffPortfolioIds.has(portfolioId) && written > 0,
          )
          .map(([portfolioId]) => portfolioId),
        id,
      })),
    ]),
  );
  return {
    accounts,
    handoff: { securitiesAccounts, securitiesByCategory },
    latestQuoteDate,
    latestTransactionDate,
    targets,
  };
}

// What a binary Portfolio Performance file holds for the Portfolio
// screen: its base currency, the latest quote date across priced
// securities, each securities account with its holdings count and
// sterling market value, each cash account with its balance, sterling
// equivalent where a GBP rate is known, and transaction count, plus the
// active (non-retired) sterling totals so the headline, summary strip
// and default Accounts ledger agree to the penny. Unlike readTargets, a
// held security priced in a currency with no GBP rate is still counted
// in holdingsCount and valued at nothing rather than refusing the file,
// so every valid binary file opens cleanly.
export function readPortfolioSnapshot(
  file: Uint8Array,
  fileName: string,
): PortfolioSnapshot {
  const client = messageOf(opened(file).client);
  const baseCurrency =
    optionalText(client, fields.client.baseCurrency) ?? "GBP";
  const securities = securitiesOf(client);
  const held = sharesHeld(client);
  const pounds = poundsPer(client);
  const transactions = messagesAt(client, fields.client.transactions);
  const valuations = portfolioValuationsOf(held, securities, pounds);
  const cashBalances = cashBalancesOf(transactions);
  const txCounts = rawTransactionCountsOf(transactions);

  const securitiesAccounts: readonly SecuritiesAccount[] = messagesAt(
    client,
    fields.client.portfolios,
  ).map((portfolio, index) => {
    const id =
      optionalText(portfolio, fields.portfolio.id) ??
      `portfolio-${String(index)}`;
    const note = optionalText(portfolio, fields.portfolio.note);
    const referenceAccountId = optionalText(
      portfolio,
      fields.portfolio.reference,
    );
    const valuation = valuations.get(id);
    return {
      holdingsCount: valuation?.holdingsCount ?? 0,
      id,
      isRetired: int32At(portfolio, fields.portfolio.isRetired) !== 0,
      marketValue: valuation?.marketValueGbp ?? 0,
      name: textOf(portfolio, fields.portfolio.name),
      ...(note !== undefined && { note }),
      ...(referenceAccountId !== undefined && { referenceAccountId }),
      transactionCount: txCounts.securitiesAccounts.get(id) ?? 0,
    };
  });

  const cashAccounts: readonly CashAccount[] = rawCashAccountsOf(client, {
    baseCurrency,
    cashBalances,
    pounds,
  }).map(({ note, ...account }) => ({
    ...account,
    ...(note !== undefined && { note }),
    transactionCount: txCounts.cashAccounts.get(account.id) ?? 0,
  }));

  const { totalGbp: totalCash } = cashTotalsOf(
    cashAccounts.filter((account) => !account.isRetired),
  );
  const activePortfolioIds = new Set(
    securitiesAccounts
      .filter((account) => !account.isRetired)
      .map((account) => account.id),
  );
  const totalInvested = roundPence(
    sumOf(
      securitiesAccounts.filter((account) => !account.isRetired),
      (account) => account.marketValue,
    ),
  );
  const { categories, categoryBySecurity, categoryStatusBySecurity } =
    taxonomyInfoOf(client, securities);
  const holdings = holdingsOf(securities, held, {
    activePortfolioIds,
    categoryBySecurity,
    categoryStatusBySecurity,
    pounds,
    securityTxCounts: txCounts.securities,
  });
  const accountNames = new Map(
    cashAccounts.map((account) => [account.id, account.name]),
  );
  const portfolioNames = new Map(
    securitiesAccounts.map((account) => [account.id, account.name]),
  );
  const decodedTransactions = transactionsOf(transactions, {
    accountNames,
    baseCurrency,
    portfolioNames,
    securities,
  });

  return {
    baseCurrency,
    cashAccounts,
    categories,
    fileName,
    gbpRates: Object.fromEntries(pounds),
    holdings,
    latestQuoteDate: latestQuoteDateOf(securities, held, activePortfolioIds),
    securitiesAccounts,
    totalCash,
    totalInvested,
    transactions: decodedTransactions,
  };
}

// Opens a binary Portfolio Performance file once and reads its Asset
// Allocation categories (validating share bounds and 100% total),
// securities accounts' cash and daily paid-in history, and latest
// active quote and transaction dates in a single pass.
export function readPortfolioTargets(file: Uint8Array): {
  readonly categories: readonly Target[];
  readonly latestQuoteDate: null | string;
  readonly latestTransactionDate: null | string;
  readonly portfolios: readonly Portfolio[];
} {
  const client = messageOf(opened(file).client);
  const securities = securitiesOf(client);
  const held = sharesHeld(client);
  const categories = targetsOf(
    classesIn(client),
    worthOf(client, securities, held),
  );
  validateTargetShares(categories);
  return {
    categories,
    latestQuoteDate: latestQuoteDateOf(
      securities,
      held,
      activePortfolioIdsOf(client),
    ),
    latestTransactionDate: latestTransactionDateOf(
      messagesAt(client, fields.client.transactions),
    ),
    portfolios: readPortfoliosFromClient(client),
  };
}

// Extracts stored quote-lookup metadata (currency, resolved feed,
// ticker, and latest positive price) for requested raw protobuf field-1
// security ids, preserving request order and skipping any ids absent
// from the stored file.
export function readQuotableSecurities(
  file: Uint8Array,
  securityIds: readonly string[],
): readonly QuotableSecurity[] {
  const client = messageOf(opened(file).client);
  const byId = new Map<string, QuotableSecurity>();
  for (const security of messagesAt(client, fields.client.securities)) {
    const id = optionalText(security, fields.security.id);
    if (id !== undefined) {
      const { price } = latestQuoteOf(security);
      byId.set(id, {
        currency: optionalText(security, fields.security.currency) ?? "",
        feed: resolvedFeedOf(security),
        id,
        latestPrice: price > 0 ? price : null,
        ticker: optionalText(security, fields.security.ticker),
      });
    }
  }
  return securityIds.flatMap((id) => {
    const found = byId.get(id);
    return found === undefined ? [] : [found];
  });
}

// The target allocation a Portfolio Performance file holds, from its
// Asset Allocation taxonomy, and what each category of it holds. The
// file is the one Portfolio Performance saves in binary: a zip holding
// one part, the protobuf of the whole client behind a signature. The
// taxonomy is read out of it, and beside it the securities, the
// securities accounts and the transactions, to say what each category
// holds, and how much of it in each securities account; nothing else
// the client holds, its cash accounts among them, is opened. Each class with
// none beneath it is a category, and its share of the whole is its
// weight times the weight of every class above it, the root's aside,
// since the root is the whole. What it holds is each security assigned
// to it, what is held of the security summed from the transactions,
// bought and delivered in less sold and delivered out, at the last
// price the file holds for it, by the weight of the holding the class
// takes, to the whole pound; and what each securities account holds of
// it the same way, a transfer moving shares from one account to
// another, the accounts named as the file names them. A price in sterling or in pence is a
// pound's worth as it is, and one in any other currency is carried
// into pounds at the rate the file's latest transaction in pounds
// carrying that currency was made at, which is as old as that
// transaction; a security held in a currency no transaction gives a
// rate for is refused by name, since the reader cannot price it and
// the file leaves nothing on the network to ask. An account assigned
// to a category is worth nothing to the reader, which does not open
// the accounts, as is a security the file holds no price for. The
// classes at the top are read in the order Portfolio Performance ranks
// them, each with its categories together beneath it, the largest
// share first and a tie in the taxonomy's order. Whether the shares
// add up to the whole is the household's to hold, not the file's. What
// the reader cannot read, or cannot find, is refused in words naming
// it, since the screen says why a file was not imported. A file
// Portfolio Performance saved some other way, with a password or as
// XML, compressed or not, is known by how it opens, as Portfolio
// Performance knows it, and refused in words saying how it was saved,
// since saving it again in binary is what makes it read.
export function readTargets(file: Uint8Array): readonly Target[] {
  return readTargetsFromClient(messageOf(opened(file).client));
}

// The file with its Asset Allocation taxonomy's weights set so that
// each category holds the share of the whole given for it, by its id,
// and everything else in the file as it was, byte for byte: the other
// taxonomies, the holdings, the transactions, and the taxonomy's own
// classes, names and assignments. A class's weight is of its parent,
// so the share of a class with classes beneath it is theirs added up,
// and each class is weighted by its share over its parent's, the
// classes beneath one parent rounded to add up to the whole of it, the
// odd hundredths of a per cent given one each to the largest
// remainders; so the shares read back out of the file add up to the
// whole. Shares given that do not add up to the whole are refused
// saying what they add up to, since weighting each by its parent's
// would scale them to the whole without a word, and the household's
// check that the targets add up could then never fire. Beneath a class
// holding nothing every class weighs nothing, and a category given no
// share holds none. The root's weight is left as written, since the
// root is the whole. The file is opened as it is read, and refused as
// it is read, so a file that could not be read is not written either.
export function reweighted(
  file: Uint8Array,
  shares: ReadonlyMap<string, number>,
): Uint8Array<ArrayBuffer> {
  return rewriteClient(file, (client) => {
    const total = sumOf([...shares.values()], (share) => share);
    if (Math.abs(total - 1) > tolerance) {
      throw new Refusal(
        `The shares given add up to ${formatPercent(total)} rather than 100%`,
      );
    }
    const weights = weightsOf(classesIn(messageOf(client)), shares);
    return withMessagesAt(client, fields.client.taxonomies, (written) =>
      textAt(messageOf(written), fields.taxonomy.name) === taxonomy
        ? withMessagesAt(written, fields.taxonomy.classes, (each) => {
            const weight = weights.get(
              textOf(messageOf(each), fields.class.id),
            );
            return weight === undefined
              ? each
              : withWholeAt(each, fields.class.weight, weight);
          })
        : written,
    );
  });
}

// Updates an existing cash or securities account in place (name, note,
// retired flag, and optional reference cash account for securities
// accounts), keeping account kind, cash currency, untouched accounts,
// and unknown fields byte for byte.
export function updateAccount(
  file: Uint8Array,
  input: EditPortfolioAccount,
  options?: WriteOptions,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const { now } = writeContextOf(options);
  const id = trimmedRequired(input.id, "Account");
  const content = rewriteClient(file, (clientBytes) => {
    const client = messageOf(clientBytes);
    const name = trimmedRequired(input.name, "Account name");
    const note = trimmedOptional(input.note);
    const updatedAt = timestampBytesOf(now);
    if (input.kind === "cash") {
      requireUniqueRawId(client, {
        idField: fields.account.id,
        label: "cash account",
        listField: fields.client.accounts,
        targetId: id,
      });
      return withMessagesAt(clientBytes, fields.client.accounts, (raw) => {
        if (optionalText(messageOf(raw), fields.account.id) !== id) {
          return raw;
        }
        let patched = withTextAt(raw, fields.account.name, name);
        patched = withTextAt(patched, fields.account.note, note);
        patched = withWholeAt(
          patched,
          fields.account.isRetired,
          input.isRetired ? 1 : 0,
        );
        return withMessageAt(patched, fields.account.updatedAt, updatedAt);
      });
    }
    requireUniqueRawId(client, {
      idField: fields.portfolio.id,
      label: "securities account",
      listField: fields.client.portfolios,
      targetId: id,
    });
    const referenceAccountId = trimmedOptional(input.referenceAccountId);
    if (referenceAccountId !== undefined) {
      const cashIds = rawIdsOf(
        client,
        fields.client.accounts,
        fields.account.id,
      );
      if (!cashIds.has(referenceAccountId)) {
        throw new Refusal("The selected reference cash account was not found");
      }
    }
    return withMessagesAt(clientBytes, fields.client.portfolios, (raw) => {
      if (optionalText(messageOf(raw), fields.portfolio.id) !== id) {
        return raw;
      }
      let patched = withTextAt(raw, fields.portfolio.name, name);
      patched = withTextAt(patched, fields.portfolio.note, note);
      patched = withWholeAt(
        patched,
        fields.portfolio.isRetired,
        input.isRetired ? 1 : 0,
      );
      patched = withTextAt(
        patched,
        fields.portfolio.reference,
        referenceAccountId,
      );
      return withMessageAt(patched, fields.portfolio.updatedAt, updatedAt);
    });
  });
  return { content, id };
}

// Upserts dated historical quotes for one or more catalogued
// securities, keeping untouched securities and untouched historical
// price entries byte for byte, maintaining ascending epoch-day order
// on field 13, and clearing shadowed PSecurity.latest entries.
export function updateQuotes(
  file: Uint8Array,
  input: PortfolioQuoteBatch,
  options?: WriteOptions,
): {
  readonly content: Uint8Array<ArrayBuffer>;
  readonly updatedCount: number;
} {
  const { now } = writeContextOf(options);
  let updatedCount = 0;
  const content = rewriteClient(file, (clientBytes) => {
    const defaultEpochDay = isoDateToEpochDay(input.date);
    const updates = quoteUpdatesMapOf(input.quotes, defaultEpochDay);
    const knownIds = rawIdsOf(
      messageOf(clientBytes),
      fields.client.securities,
      fields.security.id,
    );
    for (const id of updates.keys()) {
      if (!knownIds.has(id)) {
        throw new Refusal("A selected security was not found");
      }
    }
    const updatedAt = timestampBytesOf(now);
    updatedCount = updates.size;
    return withMessagesAt(
      clientBytes,
      fields.client.securities,
      (securityBytes) => {
        const secId = optionalText(
          messageOf(securityBytes),
          fields.security.id,
        );
        const update = secId === undefined ? undefined : updates.get(secId);
        return update === undefined
          ? securityBytes
          : rewriteSecurityQuote(securityBytes, {
              closeScaled: update.closeScaled,
              quoteEpochDay: update.quoteEpochDay,
              updatedAt,
            });
      },
    );
  });
  return { content, updatedCount };
}

// Updates an existing catalogued security in place (name, ISIN, ticker,
// note, retired flag, and single-leaf Asset Allocation class), keeping
// currency, price history, feeds, split allocations, and untouched
// entries byte for byte.
export function updateSecurity(
  file: Uint8Array,
  input: EditPortfolioSecurity,
  options?: WriteOptions,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const { now } = writeContextOf(options);
  const id = trimmedRequired(input.id, "Security");
  const content = rewriteClient(file, (clientBytes) => {
    const client = messageOf(clientBytes);
    requireUniqueRawId(client, {
      idField: fields.security.id,
      label: "security",
      listField: fields.client.securities,
      targetId: id,
    });
    const name = trimmedRequired(input.name, "Security name");
    const isin = trimmedOptional(input.isin);
    const ticker = trimmedOptional(input.ticker);
    const note = trimmedOptional(input.note);
    const categoryId = trimmedOptional(input.categoryId);
    const existingStatus = securityCategoryStatusMapOf(client).get(id) ?? {
      categoryId: undefined,
      isSplitCategory: false,
    };
    if (existingStatus.isSplitCategory && categoryId !== undefined) {
      throw new Refusal(
        "This security has a split asset allocation that cannot be overwritten here",
      );
    }
    const isCategoryChanged =
      !existingStatus.isSplitCategory &&
      categoryId !== existingStatus.categoryId;
    const targetLeafIndex =
      isCategoryChanged && categoryId !== undefined
        ? taxonomyLeafIndexOf(client, categoryId)
        : -1;
    if (
      isCategoryChanged &&
      categoryId !== undefined &&
      targetLeafIndex === -1
    ) {
      throw new Refusal("The selected asset class was not found");
    }
    const updatedAt = timestampBytesOf(now);
    const withSecurity = withMessagesAt(
      clientBytes,
      fields.client.securities,
      (raw) => {
        if (optionalText(messageOf(raw), fields.security.id) !== id) {
          return raw;
        }
        let patched = withTextAt(raw, fields.security.name, name);
        patched = withTextAt(patched, fields.security.note, note);
        patched = withTextAt(patched, fields.security.isin, isin);
        patched = withTextAt(patched, fields.security.ticker, ticker);
        patched = withWholeAt(
          patched,
          fields.security.isRetired,
          input.isRetired ? 1 : 0,
        );
        return withMessageAt(patched, fields.security.updatedAt, updatedAt);
      },
    );
    if (!isCategoryChanged) {
      return withSecurity;
    }
    const stripped = stripTaxonomyAssignments(withSecurity, id, {
      isAssetAllocationOnly: true,
    });
    return targetLeafIndex === -1
      ? stripped
      : withAssignedCategory(stripped, targetLeafIndex, id);
  });
  return { content, id };
}

// Updates an existing transaction in place while enforcing type
// immutability and preserving unknown PTransaction fields, unknown
// PTransactionUnit types (> 2), unchanged intra-day timestamps,
// existing otherUuid, and unchanged FEE, TAX, and GROSS_VALUE units
// byte for byte.
export function updateTransaction(
  file: Uint8Array,
  input: EditPortfolioTransaction,
  options?: WriteOptions,
): { readonly content: Uint8Array<ArrayBuffer>; readonly id: string } {
  const { now } = writeContextOf(options);
  const id = trimmedRequired(input.id, "Transaction");
  const content = rewriteClient(file, (clientBytes) => {
    const client = messageOf(clientBytes);
    const existing = requireUniqueRawId(client, {
      idField: fields.transaction.id,
      label: "transaction",
      listField: fields.client.transactions,
      targetId: id,
    });
    const existingType = transactionTypes.get(
      int32At(existing, fields.transaction.type),
    );
    if (existingType === undefined) {
      throw new Refusal("This transaction type cannot be edited");
    }
    if (input.type !== existingType) {
      throw new Refusal("Transaction type cannot be changed");
    }
    const prepared = prepareTransactionMutation(client, input);
    const baseCurrency =
      optionalText(client, fields.client.baseCurrency) ?? "GBP";
    const updatedAt = timestampBytesOf(now);
    return withMessagesAt(clientBytes, fields.client.transactions, (raw) =>
      optionalText(messageOf(raw), fields.transaction.id) === id
        ? patchTransactionBytes(raw, { baseCurrency, prepared, updatedAt })
        : raw,
    );
  });
  return { content, id };
}

// Most recent valid ISO transaction date per cash account and per
// securities account across known transaction types with in-range
// timestamps.
function accountTransactionDatesOf(rawTransactions: readonly Message[]): {
  readonly cash: ReadonlyMap<string, string>;
  readonly securities: ReadonlyMap<string, string>;
} {
  const cash = new Map<string, string>();
  const securities = new Map<string, string>();
  for (const entry of rawTransactions) {
    const date = validTransactionDateOf(entry);
    if (date === null) {
      continue;
    }
    recordLatestDate(
      cash,
      optionalText(entry, fields.transaction.account),
      date,
    );
    recordLatestDate(
      cash,
      optionalText(entry, fields.transaction.otherAccount),
      date,
    );
    recordLatestDate(
      securities,
      optionalText(entry, fields.transaction.portfolio),
      date,
    );
    recordLatestDate(
      securities,
      optionalText(entry, fields.transaction.otherPortfolio),
      date,
    );
  }
  return { cash, securities };
}

// Active (non-retired) securities account ids declared in PClient.
function activePortfolioIdsOf(client: Message): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const portfolio of messagesAt(client, fields.client.portfolios)) {
    const id = optionalText(portfolio, fields.portfolio.id);
    if (
      id !== undefined &&
      int32At(portfolio, fields.portfolio.isRetired) === 0
    ) {
      ids.add(id);
    }
  }
  return ids;
}

// Accumulates one positive-share holding into its securities account's
// valuation and completeness diagnostics.
function addHoldingToValuation(
  acc: PortfolioValuationAccumulator,
  written: number,
  {
    factor,
    security,
  }: { readonly factor: number | undefined; readonly security: Security },
): void {
  acc.holdingsCount += 1;
  if (security.price <= 0) {
    acc.unpricedCount += 1;
    return;
  }
  if (security.quoteDate === null) {
    acc.hasUndatedQuote = true;
  } else if (
    acc.oldestQuoteDate === null ||
    security.quoteDate < acc.oldestQuoteDate
  ) {
    acc.oldestQuoteDate = security.quoteDate;
  }
  if (security.currency === "no currency") {
    acc.hasUncurrenciedHoldings = true;
    return;
  }
  if (factor === undefined) {
    acc.noFxCurrencies.add(security.currency);
    return;
  }
  acc.valueSum += roundPence((written / scaled) * security.price * factor);
  if (security.currency !== "GBP" && security.currency !== "GBX") {
    acc.foreignCurrencies.add(security.currency);
  }
}

// Record positive GBP FX rates from a transaction's units (in either
// direction: GBP -> foreign or foreign -> GBP), filtered to gross-value
// or non-gross units so gross rates take precedence over rounded fee or
// tax units on the same transaction.
function applyFxUnits(
  rates: Map<string, number>,
  units: readonly Message[],
  {
    isGrossOnly,
    txCurrency,
  }: { readonly isGrossOnly: boolean; readonly txCurrency: string },
): void {
  for (const unit of units) {
    const isGross = int32At(unit, fields.unit.type) === grossValueUnit;
    if (isGross !== isGrossOnly) {
      continue;
    }
    const unitCurrency = optionalText(unit, fields.unit.currency) ?? txCurrency;
    const fxCurrency = optionalText(unit, fields.unit.fxCurrency);
    const amount = int64At(unit, fields.unit.amount);
    const foreign = int64At(unit, fields.unit.fxAmount);
    if (amount <= 0 || foreign <= 0 || fxCurrency === undefined) {
      continue;
    }
    if (unitCurrency === "GBP") {
      rates.set(fxCurrency, amount / foreign);
    } else if (fxCurrency === "GBP") {
      rates.set(unitCurrency, foreign / amount);
    }
  }
}

// A cash account's sterling balance when a GBP rate is known or the
// balance is zero, or null when a non-zero foreign balance cannot be
// converted.
function balanceInGbp(
  balance: number,
  rate: number | undefined,
): null | number {
  if (balance === 0) {
    return 0;
  }
  return rate === undefined ? null : roundPence(balance * rate);
}

// Encodes one PTransaction message in canonical field-number order.
function buildTransactionBytes({
  amountPence,
  currency,
  dateBytes,
  feesPence,
  grossValue,
  id,
  note,
  otherId,
  refs,
  rule,
  sharesScaled,
  taxesPence,
  updatedAt,
}: {
  readonly amountPence: number;
  readonly currency: string;
  readonly dateBytes: Uint8Array;
  readonly feesPence: number;
  readonly grossValue: GrossValueSpec | undefined;
  readonly id: string;
  readonly note: string | undefined;
  readonly otherId: string | undefined;
  readonly refs: ResolvedTransactionRefs;
  readonly rule: TransactionWriteRule;
  readonly sharesScaled: number;
  readonly taxesPence: number;
  readonly updatedAt: Uint8Array;
}): Uint8Array {
  return joined([
    textField(fields.transaction.id, id),
    ...(rule.code === 0
      ? []
      : [wholeField(fields.transaction.type, rule.code)]),
    ...(refs.accountId === undefined
      ? []
      : [textField(fields.transaction.account, refs.accountId)]),
    ...(refs.portfolioId === undefined
      ? []
      : [textField(fields.transaction.portfolio, refs.portfolioId)]),
    ...(refs.otherAccountId === undefined
      ? []
      : [textField(fields.transaction.otherAccount, refs.otherAccountId)]),
    ...(refs.otherPortfolioId === undefined
      ? []
      : [textField(fields.transaction.otherPortfolio, refs.otherPortfolioId)]),
    ...(otherId === undefined
      ? []
      : [
          textField(fields.transaction.otherUuid, otherId),
          delimitedOf(fields.transaction.otherUpdatedAt, updatedAt),
        ]),
    delimitedOf(fields.transaction.date, dateBytes),
    textField(fields.transaction.currency, currency),
    ...(amountPence === 0
      ? []
      : [wholeField(fields.transaction.amount, amountPence)]),
    ...(sharesScaled === 0
      ? []
      : [wholeField(fields.transaction.shares, sharesScaled)]),
    ...(note === undefined ? [] : [textField(fields.transaction.note, note)]),
    ...(refs.securityId === undefined
      ? []
      : [textField(fields.transaction.security, refs.securityId)]),
    ...transactionUnitsOf({ currency, feesPence, grossValue, taxesPence }),
    delimitedOf(fields.transaction.updatedAt, updatedAt),
  ]);
}

// Each cash account's unrounded native balance, summed from every known
// transaction naming it as account or as the receiving otherAccount of
// a cash transfer (crediting the foreign gross-value amount for
// cross-currency transfers).
function cashBalancesOf(
  transactions: readonly Message[],
): ReadonlyMap<string, number> {
  const balances = new Map<string, number>();
  for (const transaction of transactions) {
    const type = int32At(transaction, fields.transaction.type);
    if (type < 0 || type > maxTransactionType) {
      continue;
    }
    const amount = int64At(transaction, fields.transaction.amount) / hundredths;
    const account = textOf(transaction, fields.transaction.account);
    const otherAccount = textOf(transaction, fields.transaction.otherAccount);
    if (account !== "") {
      const sign = cashSigns.get(type);
      if (sign !== undefined) {
        balances.set(account, (balances.get(account) ?? 0) + sign * amount);
      }
    }
    if (type === cashTransfer && otherAccount !== "") {
      balances.set(
        otherAccount,
        (balances.get(otherAccount) ?? 0) +
          transferCreditOf(transaction, amount),
      );
    }
  }
  return balances;
}

// Raw protobuf cash account ids mapped to their settlement currency,
// falling back to the client's base currency when field 3 is absent.
function cashCurrenciesOf(
  client: Message,
  baseCurrency: string,
): ReadonlyMap<string, string> {
  const currencies = new Map<string, string>();
  for (const account of messagesAt(client, fields.client.accounts)) {
    const id = optionalText(account, fields.account.id);
    if (id !== undefined) {
      currencies.set(
        id,
        optionalText(account, fields.account.currency) ?? baseCurrency,
      );
    }
  }
  return currencies;
}

// The classes of the client's Asset Allocation taxonomy, as written,
// or a refusal naming the taxonomies it has instead.
function classesIn(client: Message): readonly Class[] {
  const taxonomies = messagesAt(client, fields.client.taxonomies);
  const found = taxonomies.find(
    (each) => textAt(each, fields.taxonomy.name) === taxonomy,
  );
  if (found === undefined) {
    throw new Refusal(
      `The file has no ${taxonomy} taxonomy, only ${listed(taxonomies)}`,
    );
  }
  return messagesAt(found, fields.taxonomy.classes).map(classOf);
}

function classOf(message: Message): Class {
  return {
    assignments: messagesAt(message, fields.class.assignments).map((each) => ({
      vehicle: textOf(each, fields.assignment.vehicle),
      weight: int32At(each, fields.assignment.weight),
    })),
    id: textOf(message, fields.class.id),
    name: textOf(message, fields.class.name),
    parent: textAt(message, fields.class.parent),
    rank: int32At(message, fields.class.rank),
    weight: int32At(message, fields.class.weight),
  };
}

// Validates an ISO-style 3-letter uppercase currency code, allowing GBX
// only where pence-quoted securities are accepted.
function currencyCodeOf(
  value: string,
  { isPenceAllowed }: { readonly isPenceAllowed: boolean },
): string {
  const trimmed = value.trim();
  if (!/^[A-Z]{3}$/u.test(trimmed) || (!isPenceAllowed && trimmed === "GBX")) {
    throw new Refusal(`Currency "${trimmed}" is not supported`);
  }
  return trimmed;
}

// When a transaction was made, in seconds since the epoch as Portfolio
// Performance writes a timestamp, or nought for one with no date.
function dateOf(transaction: Message): number {
  const [date] = messagesAt(transaction, fields.transaction.date);
  return date === undefined ? 0 : int64At(date, fields.timestamp.seconds);
}

// The day a transaction was made, as an ISO date: the day of its date in
// UTC, as Portfolio Performance writes the moment.
function dayOf(transaction: Message): string {
  return isoDateOf(dateOf(transaction));
}

// Decodes a positive Portfolio Performance PDecimalValue (scale,
// precision, big-endian signed two's-complement BigInteger bytes),
// returning undefined for missing, negative, zero, or out-of-bounds
// values.
function decodeDecimalValue(message: Message): number | undefined {
  const scale = int32At(message, fields.decimal.scale);
  const raw = bytesAt(message, fields.decimal.value);
  const first = raw?.[0];
  if (
    raw === undefined ||
    first === undefined ||
    first >= 0x80 ||
    raw.length > maxDecimalBytes ||
    scale < 0 ||
    scale > maxDecimalScale
  ) {
    return undefined;
  }
  let unscaled = 0n;
  for (const byte of raw) {
    unscaled = (unscaled << 8n) | BigInt(byte);
  }
  const value = Number(unscaled) / 10 ** scale;
  return value > 0 ? value : undefined;
}

// One decoded transaction alongside its original index for stable
// tie-breaking, or null for an unknown future enum value.
function decodeTransaction(
  entry: Message,
  index: number,
  {
    accountNames,
    baseCurrency,
    portfolioNames,
    securities,
  }: {
    readonly accountNames: ReadonlyMap<string, string>;
    readonly baseCurrency: string;
    readonly portfolioNames: ReadonlyMap<string, string>;
    readonly securities: ReadonlyMap<string, Security>;
  },
): null | {
  readonly index: number;
  readonly transaction: PortfolioTransaction;
} {
  const type = transactionTypes.get(int32At(entry, fields.transaction.type));
  if (type === undefined) {
    return null;
  }
  const timestamp = dateOf(entry);
  if (timestamp < minTimestamp || timestamp > maxTimestamp) {
    throw new Refusal("A transaction carries an unreadable date");
  }
  const accountId = optionalText(entry, fields.transaction.account);
  const otherAccountId = optionalText(entry, fields.transaction.otherAccount);
  const portfolioId = optionalText(entry, fields.transaction.portfolio);
  const otherPortfolioId = optionalText(
    entry,
    fields.transaction.otherPortfolio,
  );
  const securityId = optionalText(entry, fields.transaction.security);
  const note = optionalText(entry, fields.transaction.note);
  const accountName = lookupName(accountNames, accountId);
  const otherAccountName = lookupName(accountNames, otherAccountId);
  const portfolioName = lookupName(portfolioNames, portfolioId);
  const otherPortfolioName = lookupName(portfolioNames, otherPortfolioId);
  const securityName =
    securityId === undefined ? undefined : securities.get(securityId)?.name;
  const currency =
    optionalText(entry, fields.transaction.currency) ?? baseCurrency;
  const { fees, taxes } = transactionCostsOf(entry);
  const grossValue = grossValueOf(entry, currency);

  return {
    index,
    transaction: {
      ...(accountId !== undefined && { accountId }),
      ...(accountName !== undefined && { accountName }),
      amount: roundPence(
        int64At(entry, fields.transaction.amount) / hundredths,
      ),
      currency,
      date: isoDateOf(timestamp),
      fees,
      ...(grossValue !== undefined && { grossValue }),
      id: optionalText(entry, fields.transaction.id) ?? `tx-${String(index)}`,
      ...(note !== undefined && { note }),
      ...(otherAccountId !== undefined && { otherAccountId }),
      ...(otherAccountName !== undefined && { otherAccountName }),
      ...(otherPortfolioId !== undefined && { otherPortfolioId }),
      ...(otherPortfolioName !== undefined && { otherPortfolioName }),
      ...(portfolioId !== undefined && { portfolioId }),
      ...(portfolioName !== undefined && { portfolioName }),
      ...(securityId !== undefined && { securityId }),
      ...(securityName !== undefined && { securityName }),
      shares: int64At(entry, fields.transaction.shares) / scaled,
      taxes,
      timestamp,
      type,
    },
  };
}

// Encodes a positive finite exchange rate into Portfolio Performance's
// PDecimalValue (scale <= 8 with trailing fractional zeroes trimmed,
// exact BigDecimal precision, and minimal big-endian signed
// two's-complement BigInteger bytes).
function encodeDecimalValue(rate: number): Uint8Array {
  const scaledInt = Math.round(rate * scaled);
  if (!Number.isSafeInteger(scaledInt) || scaledInt < 1) {
    throw new Refusal("Exchange rate is out of range");
  }
  let unscaled = BigInt(scaledInt);
  let scale = 8;
  while (scale > 0 && unscaled % 10n === 0n) {
    unscaled /= 10n;
    scale -= 1;
  }
  const precision = unscaled.toString().length;
  let left = unscaled;
  let high = 0;
  const bytes: number[] = [];
  while (left > 0n) {
    high = Number(left & 0xffn);
    bytes.push(high);
    left >>= 8n;
  }
  if (high >= 0x80) {
    bytes.push(0);
  }
  bytes.reverse();
  return joined([
    ...(scale === 0 ? [] : [wholeField(fields.decimal.scale, scale)]),
    wholeField(fields.decimal.precision, precision),
    delimitedOf(fields.decimal.value, new Uint8Array(bytes)),
  ]);
}

// Per-account valuation, reference-cash pairing, and quote/transaction
// freshness summaries exposed on PortfolioFeed unconditionally (even
// when Asset Allocation targets are refused).
function feedAccountsOf(
  client: Message,
  {
    held,
    pounds,
    rawTransactions,
    securities,
  }: {
    readonly held: ReadonlyMap<string, ReadonlyMap<string, number>>;
    readonly pounds: ReadonlyMap<string, number>;
    readonly rawTransactions: readonly Message[];
    readonly securities: ReadonlyMap<string, Security>;
  },
): PortfolioFeed["accounts"] {
  const baseCurrency =
    optionalText(client, fields.client.baseCurrency) ?? "GBP";
  const valuations = portfolioValuationsOf(held, securities, pounds);
  const cashBalances = cashBalancesOf(rawTransactions);
  const txDates = accountTransactionDatesOf(rawTransactions);
  const rawCash = rawCashAccountsOf(client, {
    baseCurrency,
    cashBalances,
    pounds,
  });
  const rawPortfolios = messagesAt(client, fields.client.portfolios).map(
    (portfolio, index) => ({
      id:
        optionalText(portfolio, fields.portfolio.id) ??
        `portfolio-${String(index)}`,
      isRetired: int32At(portfolio, fields.portfolio.isRetired) !== 0,
      name: textOf(portfolio, fields.portfolio.name),
      referenceAccountId: optionalText(portfolio, fields.portfolio.reference),
    }),
  );

  const referencedById = new Map<string, Set<string>>();
  const referenceCountById = new Map<string, number>();
  for (const portfolio of rawPortfolios) {
    if (!portfolio.isRetired && portfolio.referenceAccountId !== undefined) {
      const refId = portfolio.referenceAccountId;
      referenceCountById.set(refId, (referenceCountById.get(refId) ?? 0) + 1);
      const trimmed = portfolio.name.trim();
      const label = trimmed === "" ? "a securities account" : trimmed;
      const names = referencedById.get(refId) ?? new Set<string>();
      names.add(label);
      referencedById.set(refId, names);
    }
  }

  const cash = rawCash.map((account) => ({
    balance: account.balance,
    balanceGbp: account.balanceGbp,
    currency: account.currency,
    id: account.id,
    isRetired: account.isRetired,
    lastTransactionDate: txDates.cash.get(account.id) ?? null,
    name: account.name,
    referencedBy: [...(referencedById.get(account.id) ?? [])],
  }));
  const cashById = new Map(cash.map((account) => [account.id, account]));

  const securitiesAccounts = rawPortfolios.map((portfolio) => {
    const valuation = valuations.get(portfolio.id);
    const linkedCash =
      portfolio.referenceAccountId === undefined
        ? undefined
        : cashById.get(portfolio.referenceAccountId);
    return {
      foreignCurrencies: valuation?.foreignCurrencies ?? [],
      hasUncurrenciedHoldings: valuation?.hasUncurrenciedHoldings ?? false,
      holdingsCount: valuation?.holdingsCount ?? 0,
      id: portfolio.id,
      isRetired: portfolio.isRetired,
      lastTransactionDate: txDates.securities.get(portfolio.id) ?? null,
      marketValueGbp: valuation?.marketValueGbp ?? 0,
      name: portfolio.name,
      noFxCurrencies: valuation?.noFxCurrencies ?? [],
      oldestQuoteDate: valuation?.oldestQuoteDate ?? null,
      referenceCash:
        linkedCash === undefined
          ? null
          : {
              balance: linkedCash.balance,
              balanceGbp: linkedCash.balanceGbp,
              currency: linkedCash.currency,
              id: linkedCash.id,
              isRetired: linkedCash.isRetired,
              isShared: (referenceCountById.get(linkedCash.id) ?? 0) > 1,
              lastTransactionDate: linkedCash.lastTransactionDate,
              name: linkedCash.name,
            },
      unpricedCount: valuation?.unpricedCount ?? 0,
    };
  });

  return { cash, securities: securitiesAccounts };
}

// Encodes a single FEE PTransactionUnit submessage.
function feeUnitBytesOf(currency: string, feesPence: number): Uint8Array {
  return joined([
    wholeField(fields.unit.type, feeUnit),
    wholeField(fields.unit.amount, feesPence),
    textField(fields.unit.currency, currency),
  ]);
}

// Counterpart foreign currency when a transaction crosses currencies,
// or undefined for same-currency or currency-less entries.
function fxCurrencyOf({
  currency,
  otherCashCurrency,
  rule,
  securityCurrency,
}: {
  readonly currency: string;
  readonly otherCashCurrency: string | undefined;
  readonly rule: TransactionWriteRule;
  readonly securityCurrency: string | undefined;
}): string | undefined {
  if (otherCashCurrency !== undefined) {
    return otherCashCurrency === currency ? undefined : otherCashCurrency;
  }
  return rule.hasCosts &&
    securityCurrency !== undefined &&
    securityCurrency !== "" &&
    securityCurrency !== currency
    ? securityCurrency
    : undefined;
}

// Settlement gross amount in minor units for a cross-currency
// transaction: total less fees/taxes for buys and inbound deliveries,
// total plus fees/taxes for sales, outbound deliveries and dividends,
// or the debited amount itself for cash transfers.
function grossAmountPenceOf({
  amountPence,
  feesPence,
  rule,
  taxesPence,
}: {
  readonly amountPence: number;
  readonly feesPence: number;
  readonly rule: TransactionWriteRule;
  readonly taxesPence: number;
}): number {
  if (rule.isCostsBoundedByAmount) {
    const gross = amountPence - feesPence - taxesPence;
    if (gross < 1) {
      throw new Refusal(
        "Fees and taxes must be less than the transaction amount for cross-currency trades",
      );
    }
    return gross;
  }
  if (rule.hasCosts) {
    const gross = amountPence + feesPence + taxesPence;
    if (gross > maxPortfolioMoney * hundredths) {
      throw new Refusal("Gross amount is out of range");
    }
    return gross;
  }
  return amountPence;
}

// Encodes a single GROSS_VALUE PTransactionUnit submessage.
function grossUnitBytesOf(grossValue: GrossValueSpec): Uint8Array {
  return joined([
    wholeField(fields.unit.amount, grossValue.amountPence),
    textField(fields.unit.currency, grossValue.currency),
    wholeField(fields.unit.fxAmount, grossValue.fxAmountMinor),
    textField(fields.unit.fxCurrency, grossValue.fxCurrency),
    delimitedOf(fields.unit.fxRateToBase, encodeDecimalValue(grossValue.rate)),
  ]);
}

// First positive cross-currency GROSS_VALUE unit on a transaction,
// including its optional decoded PDecimalValue exchange rate.
function grossValueOf(
  entry: Message,
  txCurrency: string,
): PortfolioGrossValue | undefined {
  for (const unit of messagesAt(entry, fields.transaction.units)) {
    if (int32At(unit, fields.unit.type) !== grossValueUnit) {
      continue;
    }
    const rawAmount = int64At(unit, fields.unit.amount);
    const rawFxAmount = int64At(unit, fields.unit.fxAmount);
    const fxCurrency = optionalText(unit, fields.unit.fxCurrency);
    if (rawAmount > 0 && rawFxAmount > 0 && fxCurrency !== undefined) {
      const rawRate = messagesAt(unit, fields.unit.fxRateToBase).at(-1);
      const exchangeRate =
        rawRate === undefined ? undefined : decodeDecimalValue(rawRate);
      return {
        amount: roundPence(rawAmount / hundredths),
        currency: optionalText(unit, fields.unit.currency) ?? txCurrency,
        ...(exchangeRate !== undefined && { exchangeRate }),
        fxAmount: roundPence(rawFxAmount / hundredths),
        fxCurrency,
      };
    }
  }
  return undefined;
}

// Encodes one PHistoricalPrice entry, always writing field 1 so
// epoch-day 0 (1970-01-01) preserves wire presence.
function historicalPriceBytesOf(
  epochDay: number,
  closeScaled: number,
): Uint8Array {
  return joined([
    wholeField(fields.price.date, epochDay),
    wholeField(fields.price.close, closeScaled),
  ]);
}

// Each security in the catalogue paired with its active per-account
// share breakdown, Asset Allocation category and split status, raw
// touching transaction count, latest positive quote and GBP rate.
function holdingsOf(
  securities: ReadonlyMap<string, Security>,
  held: ReadonlyMap<string, ReadonlyMap<string, number>>,
  {
    activePortfolioIds,
    categoryBySecurity,
    categoryStatusBySecurity,
    pounds,
    securityTxCounts,
  }: {
    readonly activePortfolioIds: ReadonlySet<string>;
    readonly categoryBySecurity: ReadonlyMap<string, string>;
    readonly categoryStatusBySecurity: ReadonlyMap<
      string,
      SecurityCategoryStatus
    >;
    readonly pounds: ReadonlyMap<string, number>;
    readonly securityTxCounts: ReadonlyMap<string, number>;
  },
): readonly Holding[] {
  return [...securities].map(([id, security]) => {
    const activeLots = [...(held.get(id) ?? [])].filter(
      ([portfolioId, written]) =>
        activePortfolioIds.has(portfolioId) && written > 0,
    );
    const sharesByAccount = activeLots.map(([portfolioId, written]) => ({
      portfolioId,
      shares: written / scaled,
    }));
    const category = categoryBySecurity.get(id);
    const categoryStatus = categoryStatusBySecurity.get(id) ?? {
      categoryId: undefined,
      isSplitCategory: false,
    };
    return {
      ...(category !== undefined && { category }),
      ...(categoryStatus.categoryId !== undefined && {
        categoryId: categoryStatus.categoryId,
      }),
      currency: security.currency === "no currency" ? "" : security.currency,
      gbpRate: pounds.get(security.currency) ?? null,
      id,
      isRetired: security.isRetired,
      ...(security.isin !== undefined && { isin: security.isin }),
      isSplitCategory: categoryStatus.isSplitCategory,
      latestPrice: security.price > 0 ? security.price : null,
      latestPriceDate: security.quoteDate,
      name: security.name,
      ...(security.note !== undefined && { note: security.note }),
      shares: sumOf(activeLots, ([, written]) => written) / scaled,
      sharesByAccount,
      ...(security.ticker !== undefined && { ticker: security.ticker }),
      transactionCount: securityTxCounts.get(id) ?? 0,
    };
  });
}

// Fractions of a whole as hundredths of a per cent that add up to the
// whole of what the fractions add up to: each rounded down, and the
// hundredths left over given one each to the largest remainders, in
// order, so fractions adding up to one add up to the whole, and
// fractions of nothing stay nothing.
function hundredthsOf(
  fractions: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const entries = [...fractions];
  const down = (fraction: number): number => Math.floor(fraction * whole);
  const left =
    Math.round(sumOf(entries, ([, fraction]) => fraction) * whole) -
    sumOf(entries, ([, fraction]) => down(fraction));
  const bumped = new Set(
    entries
      .map(([id, fraction]) => [id, fraction * whole - down(fraction)] as const)
      .toSorted(([, one], [, other]) => other - one)
      .slice(0, left)
      .map(([id]) => id),
  );
  return new Map(
    entries.map(([id, fraction]) => [
      id,
      down(fraction) + (bumped.has(id) ? 1 : 0),
    ]),
  );
}

// Optional initial PHistoricalPrice field for a newly created security.
function initialPriceFieldOf(
  input: NewPortfolioSecurity,
  today: string,
): Uint8Array | undefined {
  if (input.latestPrice === null) {
    return undefined;
  }
  const closeScaled = scaledValueOf(input.latestPrice, "Latest price");
  const epochDay = isoDateToEpochDay(input.latestPriceDate ?? today);
  return delimitedOf(
    fields.security.prices,
    historicalPriceBytesOf(epochDay, closeScaled),
  );
}

// Whether an existing list of GROSS_VALUE units holds a single unit
// matching the target (grossPence, currency, fxAmountMinor, fxCurrency).
function isMatchingGrossUnit(
  existingGross: readonly { readonly message: Message }[],
  grossValue: GrossValueSpec | undefined,
  existingCurrency: string,
): boolean {
  const [single, extra] = existingGross;
  if (grossValue === undefined || single === undefined || extra !== undefined) {
    return false;
  }
  return (
    int64At(single.message, fields.unit.amount) === grossValue.amountPence &&
    (optionalText(single.message, fields.unit.currency) ?? existingCurrency) ===
      grossValue.currency &&
    int64At(single.message, fields.unit.fxAmount) ===
      grossValue.fxAmountMinor &&
    optionalText(single.message, fields.unit.fxCurrency) ===
      grossValue.fxCurrency
  );
}

// Formats UTC epoch seconds as an ISO calendar date (YYYY-MM-DD).
function isoDateOf(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

// Converts a validated YYYY-MM-DD calendar date to UTC epoch days.
function isoDateToEpochDay(date: string): number {
  if (!isIsoCalendarDate(date)) {
    throw new Refusal("Enter a valid calendar date");
  }
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

// Encodes a validated YYYY-MM-DD calendar date as UTC midnight
// google.protobuf.Timestamp bytes (zero-length for 1970-01-01).
function isoDateToTimestampBytes(date: string): Uint8Array {
  const seconds = isoDateToEpochDay(date) * 86_400;
  return seconds === 0
    ? new Uint8Array()
    : wholeField(fields.timestamp.seconds, seconds);
}

// Whether an existing PSecurity.latest entry carries a positive price
// strictly newer than the quote date being recorded.
function isStrictlyNewerLatest(
  latest: Message,
  quoteEpochDay: number,
): boolean {
  const close = int64At(latest, fields.price.close);
  if (close <= 0 || !latest.has(fields.price.date)) {
    return false;
  }
  return int64At(latest, fields.price.date) > quoteEpochDay;
}

// The most recent quote ISO date across active (non-retired)
// securities with positive shares in at least one active securities
// account, falling back to all active securities with a quote date
// when no active held security is priced, or null when none exist.
function latestQuoteDateOf(
  securities: ReadonlyMap<string, Security>,
  held: ReadonlyMap<string, ReadonlyMap<string, number>>,
  activePortfolioIds: ReadonlySet<string>,
): null | string {
  let latestHeld: null | string = null;
  let latestActive: null | string = null;
  for (const [id, { isRetired, quoteDate }] of securities) {
    if (isRetired || quoteDate === null) {
      continue;
    }
    if (latestActive === null || quoteDate > latestActive) {
      latestActive = quoteDate;
    }
    const inAccounts = held.get(id);
    const isActivelyHeld =
      inAccounts !== undefined &&
      [...inAccounts].some(
        ([portfolioId, written]) =>
          activePortfolioIds.has(portfolioId) && written > 0,
      );
    if (isActivelyHeld && (latestHeld === null || quoteDate > latestHeld)) {
      latestHeld = quoteDate;
    }
  }
  return latestHeld ?? latestActive;
}

// The latest positive quote a security carries, comparing every
// positive historical price and optional latest quote by date so
// unsorted historical series still yield the newest quote.
function latestQuoteOf(security: Message): {
  readonly date: null | string;
  readonly price: number;
} {
  const quotes = [
    ...messagesAt(security, fields.security.prices),
    ...messagesAt(security, fields.security.latest),
  ]
    .map(quoteOf)
    .filter((quote) => quote !== null);
  return quotes.reduce(
    (best, quote) => ((quote.date ?? "") >= (best.date ?? "") ? quote : best),
    { date: null, price: 0 },
  );
}

// The most recent ISO transaction date across known transaction types
// that carry an explicit in-range timestamp, or null when none do.
function latestTransactionDateOf(
  rawTransactions: readonly Message[],
): null | string {
  let latest: null | string = null;
  for (const entry of rawTransactions) {
    const date = validTransactionDateOf(entry);
    if (date !== null && (latest === null || date > latest)) {
      latest = date;
    }
  }
  return latest;
}

// The names of the taxonomies with one, as a sentence lists them, or
// none.
function listed(taxonomies: readonly Message[]): string {
  const names = taxonomies.flatMap(
    (each) => textAt(each, fields.taxonomy.name) ?? [],
  );
  return names.length === 0 ? "none" : names.join(", ");
}

function lookupName(
  names: ReadonlyMap<string, string>,
  id: string | undefined,
): string | undefined {
  return id === undefined ? undefined : names.get(id);
}

// Rounds a money figure to integer hundredths before asserting
// positivity so sub-penny values never silently round to zero.
function moneyToHundredths(
  value: number,
  label: string,
  { isZeroAllowed }: { readonly isZeroAllowed: boolean },
): number {
  if (!Number.isFinite(value) || value < 0 || value > maxPortfolioMoney) {
    throw new Refusal(`${label} is out of range`);
  }
  const minor = Math.round(value * hundredths);
  if (!isZeroAllowed && minor < 1) {
    throw new Refusal(`${label} must be greater than zero`);
  }
  return minor;
}

// The file opened, as Portfolio Performance knows a file it saved in
// binary: a zip holding the client's protobuf behind the signature. A
// file saved some other way, with a password or as XML, compressed or
// not, is known by how it opens and refused in words saying how it was
// saved, since saving it again in binary is what makes it read.
function opened(file: Uint8Array): Opened {
  if (opensWith(file, encrypted)) {
    throw new Refusal(
      "The file is encrypted, and only a Portfolio Performance file saved in binary without a password can be read",
    );
  }
  if (opensWith(file, xml)) {
    throw new Refusal(savedAsXml);
  }
  const parts = unzipped(
    file,
    "The file is not a zip, as a Portfolio Performance file saved in binary is",
  );
  const data = parts[part];
  if (data === undefined) {
    throw new Refusal(
      parts[xmlPart] === undefined ? `The file holds no ${part}` : savedAsXml,
    );
  }
  if (!opensWith(data, signature)) {
    throw new Refusal(
      "The file is not in Portfolio Performance's binary format",
    );
  }
  return { client: data.subarray(signature.length), parts };
}

// Whether the bytes open with the text given, written as UTF-8 as
// every signature read here is.
function opensWith(bytes: Uint8Array, text: string): boolean {
  return strToU8(text).every((byte, at) => bytes[at] === byte);
}

// Trimmed text written under a number, or undefined when missing or blank.
function optionalText(message: Message, number: number): string | undefined {
  const value = textAt(message, number)?.trim();
  return value === undefined || value === "" ? undefined : value;
}

// Patches an existing PTransaction message in place while keeping
// unknown fields, unknown unit types (> 2), existing otherUuid,
// unchanged intra-day timestamps, and unchanged FEE/TAX/GROSS_VALUE
// units byte for byte.
function patchTransactionBytes(
  txBytes: Uint8Array,
  {
    baseCurrency,
    prepared,
    updatedAt,
  }: {
    readonly baseCurrency: string;
    readonly prepared: PreparedTransaction;
    readonly updatedAt: Uint8Array;
  },
): Uint8Array {
  const existing = messageOf(txBytes);
  const existingCurrency =
    optionalText(existing, fields.transaction.currency) ?? baseCurrency;
  const existingTimestamp = dateOf(existing);
  const isDateUnchanged =
    existing.has(fields.transaction.date) &&
    existingTimestamp >= minTimestamp &&
    existingTimestamp <= maxTimestamp &&
    isoDateOf(existingTimestamp) === prepared.date;

  let patched = withTextAt(
    txBytes,
    fields.transaction.account,
    prepared.refs.accountId,
  );
  patched = withTextAt(
    patched,
    fields.transaction.portfolio,
    prepared.refs.portfolioId,
  );
  patched = withTextAt(
    patched,
    fields.transaction.otherAccount,
    prepared.refs.otherAccountId,
  );
  patched = withTextAt(
    patched,
    fields.transaction.otherPortfolio,
    prepared.refs.otherPortfolioId,
  );
  if (prepared.rule.hasCrossEntry) {
    patched = withMessageAt(
      patched,
      fields.transaction.otherUpdatedAt,
      updatedAt,
    );
  }
  if (!isDateUnchanged) {
    patched = withMessageAt(
      patched,
      fields.transaction.date,
      prepared.dateBytes,
    );
  }
  patched = withTextAt(patched, fields.transaction.currency, prepared.currency);
  patched = withWholeAt(
    patched,
    fields.transaction.amount,
    prepared.amountPence,
  );
  patched = withWholeAt(
    patched,
    fields.transaction.shares,
    prepared.sharesScaled,
  );
  patched = withTextAt(patched, fields.transaction.note, prepared.note);
  patched = withTextAt(
    patched,
    fields.transaction.security,
    prepared.refs.securityId,
  );
  patched = withReplacedMessagesAt(
    patched,
    fields.transaction.units,
    (existingUnits) =>
      patchTransactionUnits(existingUnits, {
        currency: prepared.currency,
        existingCurrency,
        feesPence: prepared.feesPence,
        grossValue: prepared.grossValue,
        taxesPence: prepared.taxesPence,
      }),
  );
  return withMessageAt(patched, fields.transaction.updatedAt, updatedAt);
}

// Reconciles PTransaction.units in place: unknown unit types (> 2) and
// unchanged GROSS_VALUE, FEE, and TAX units stay byte for byte in their
// original positions; changed or removed units are rewritten cleanly.
function patchTransactionUnits(
  existingUnits: readonly Uint8Array[],
  {
    currency,
    existingCurrency,
    feesPence,
    grossValue,
    taxesPence,
  }: {
    readonly currency: string;
    readonly existingCurrency: string;
    readonly feesPence: number;
    readonly grossValue: GrossValueSpec | undefined;
    readonly taxesPence: number;
  },
): readonly Uint8Array[] {
  const decoded = existingUnits.map((raw) => {
    const message = messageOf(raw);
    return { message, raw, type: int32At(message, fields.unit.type) };
  });
  const isGrossUnchanged = isMatchingGrossUnit(
    decoded.filter((entry) => entry.type === grossValueUnit),
    grossValue,
    existingCurrency,
  );
  const isFeesUnchanged =
    currency === existingCurrency &&
    sumOf(
      decoded.filter((entry) => entry.type === feeUnit),
      ({ message }) => int64At(message, fields.unit.amount),
    ) === feesPence;
  const isTaxesUnchanged =
    currency === existingCurrency &&
    sumOf(
      decoded.filter((entry) => entry.type === taxUnit),
      ({ message }) => int64At(message, fields.unit.amount),
    ) === taxesPence;

  const slots = new Map<
    number,
    {
      isPlaced: boolean;
      readonly isUnchanged: boolean;
      readonly next: readonly Uint8Array[];
    }
  >([
    [
      feeUnit,
      {
        isPlaced: false,
        isUnchanged: isFeesUnchanged,
        next: feesPence > 0 ? [feeUnitBytesOf(currency, feesPence)] : [],
      },
    ],
    [
      grossValueUnit,
      {
        isPlaced: false,
        isUnchanged: isGrossUnchanged,
        next: grossValue === undefined ? [] : [grossUnitBytesOf(grossValue)],
      },
    ],
    [
      taxUnit,
      {
        isPlaced: false,
        isUnchanged: isTaxesUnchanged,
        next: taxesPence > 0 ? [taxUnitBytesOf(currency, taxesPence)] : [],
      },
    ],
  ]);

  const result: Uint8Array[] = [];
  for (const { raw, type } of decoded) {
    const slot = slots.get(type);
    if (slot === undefined || slot.isUnchanged) {
      result.push(raw);
    } else if (!slot.isPlaced) {
      result.push(...slot.next);
      slot.isPlaced = true;
    }
  }
  for (const slot of slots.values()) {
    if (!slot.isUnchanged && !slot.isPlaced) {
      result.push(...slot.next);
    }
  }
  return result;
}

// Each securities account's count of held catalogued securities,
// penny-reconciled sterling market value, quote freshness, and FX or
// pricing completeness diagnostics.
function portfolioValuationsOf(
  held: ReadonlyMap<string, ReadonlyMap<string, number>>,
  securities: ReadonlyMap<string, Security>,
  pounds: ReadonlyMap<string, number>,
): ReadonlyMap<string, PortfolioValuation> {
  const accumulators = new Map<string, PortfolioValuationAccumulator>();
  for (const [securityId, inAccounts] of held) {
    const security = securities.get(securityId);
    if (security === undefined) {
      continue;
    }
    const factor = pounds.get(security.currency);
    for (const [portfolioId, written] of inAccounts) {
      if (written <= 0) {
        continue;
      }
      let acc = accumulators.get(portfolioId);
      if (acc === undefined) {
        acc = {
          foreignCurrencies: new Set(),
          hasUncurrenciedHoldings: false,
          hasUndatedQuote: false,
          holdingsCount: 0,
          noFxCurrencies: new Set(),
          oldestQuoteDate: null,
          unpricedCount: 0,
          valueSum: 0,
        };
        accumulators.set(portfolioId, acc);
      }
      addHoldingToValuation(acc, written, { factor, security });
    }
  }

  return new Map(
    [...accumulators].map(([portfolioId, acc]) => [
      portfolioId,
      {
        foreignCurrencies: [...acc.foreignCurrencies].toSorted((one, other) =>
          one.localeCompare(other),
        ),
        hasUncurrenciedHoldings: acc.hasUncurrenciedHoldings,
        holdingsCount: acc.holdingsCount,
        marketValueGbp: roundPence(acc.valueSum),
        noFxCurrencies: [...acc.noFxCurrencies].toSorted((one, other) =>
          one.localeCompare(other),
        ),
        oldestQuoteDate: acc.hasUndatedQuote ? null : acc.oldestQuoteDate,
        unpricedCount: acc.unpricedCount,
      },
    ]),
  );
}

// What a pound is in each currency the file gives a rate for, beside
// sterling and pence. Portfolio Performance writes a cross-currency
// transaction with its gross value (and any foreign fee or tax) in both
// currencies: GBP over the foreign amount (or foreign GBP credit over
// the transaction amount for inverse foreign -> GBP entries) gives the
// rate the transaction was made at. The file holds no rate of the day,
// so the latest transaction's is taken, by date rather than by the
// order written, since the file writes them in neither. A transaction
// involving neither currency as GBP is skipped, and a unit worth
// nothing in either currency gives no rate; on any transaction,
// gross-value units take precedence over rounded fee or tax units.
function poundsPer(client: Message): ReadonlyMap<string, number> {
  const baseCurrency =
    optionalText(client, fields.client.baseCurrency) ?? "GBP";
  const rates = new Map<string, number>();
  const dated = messagesAt(client, fields.client.transactions)
    .map((each) => [dateOf(each), each] as const)
    .toSorted(([one], [other]) => one - other);
  for (const [, transaction] of dated) {
    const txCurrency =
      optionalText(transaction, fields.transaction.currency) ?? baseCurrency;
    const units = messagesAt(transaction, fields.transaction.units);
    applyFxUnits(rates, units, { isGrossOnly: false, txCurrency });
    applyFxUnits(rates, units, { isGrossOnly: true, txCurrency });
  }
  return new Map([...rates, ...factors]);
}

// Validates and normalizes a transaction payload shared by
// appendTransaction and updateTransaction.
function prepareTransactionMutation(
  client: Message,
  input: NewPortfolioTransaction,
): PreparedTransaction {
  const rule = transactionWriteRules[input.type];
  const currency = currencyCodeOf(input.currency, { isPenceAllowed: false });
  const dateBytes = isoDateToTimestampBytes(input.date);
  const amountPence = moneyToHundredths(input.amount, "Amount", {
    isZeroAllowed: rule.isAmountOptional,
  });
  if (!rule.hasCosts && (input.fees !== 0 || input.taxes !== 0)) {
    throw new Refusal("This transaction type does not take fees or taxes");
  }
  const feesPence = rule.hasCosts
    ? moneyToHundredths(input.fees, "Fees", { isZeroAllowed: true })
    : 0;
  const taxesPence = rule.hasCosts
    ? moneyToHundredths(input.taxes, "Taxes", { isZeroAllowed: true })
    : 0;
  if (rule.isCostsBoundedByAmount && feesPence + taxesPence > amountPence) {
    throw new Refusal("Fees and taxes cannot exceed the transaction amount");
  }
  if (!rule.hasShares && input.shares !== 0) {
    throw new Refusal("This transaction type does not take shares");
  }
  const sharesScaled = rule.hasShares
    ? scaledValueOf(input.shares, "Shares")
    : 0;
  const refs = validateTransactionRefs(client, input, { currency, rule });
  const grossValue = resolveGrossValue({
    amountPence,
    currency,
    feesPence,
    fxAmount: input.fxAmount,
    fxCurrency: refs.fxCurrency,
    rule,
    taxesPence,
  });
  return {
    amountPence,
    currency,
    date: input.date,
    dateBytes,
    feesPence,
    grossValue,
    note: trimmedOptional(input.note),
    refs,
    rule,
    sharesScaled,
    taxesPence,
  };
}

// A single historical or latest price entry decoded into its price and
// optional ISO quote date (when within valid four-digit ISO years), or
// null when the close is not positive.
function quoteOf(
  entry: Message,
): null | { readonly date: null | string; readonly price: number } {
  const close = int64At(entry, fields.price.close);
  if (close <= 0) {
    return null;
  }
  const epochDay = entry.has(fields.price.date)
    ? int64At(entry, fields.price.date)
    : null;
  const date =
    epochDay !== null && epochDay >= minEpochDay && epochDay <= maxEpochDay
      ? new Date(epochDay * 86_400_000).toISOString().slice(0, 10)
      : null;
  return { date, price: close / scaled };
}

// Validates a non-empty batch of unique security quote updates and
// converts each price to integer hundred-millionths and each optional
// per-quote date (falling back to defaultEpochDay) to UTC epoch days.
function quoteUpdatesMapOf(
  quotes: readonly PortfolioQuoteUpdate[],
  defaultEpochDay: number,
): ReadonlyMap<
  string,
  { readonly closeScaled: number; readonly quoteEpochDay: number }
> {
  if (quotes.length === 0) {
    throw new Refusal("Enter at least one security price");
  }
  const updates = new Map<
    string,
    { readonly closeScaled: number; readonly quoteEpochDay: number }
  >();
  for (const { date, price, securityId } of quotes) {
    const id = trimmedRequired(securityId, "Security");
    if (updates.has(id)) {
      throw new Refusal("Each security can only be updated once per batch");
    }
    updates.set(id, {
      closeScaled: scaledValueOf(price, "Quote price"),
      quoteEpochDay:
        date === undefined ? defaultEpochDay : isoDateToEpochDay(date),
    });
  }
  return updates;
}

// Decoded cash accounts with penny-rounded native and sterling balances,
// shared between readPortfolioSnapshot and readPortfolioFeed.
function rawCashAccountsOf(
  client: Message,
  {
    baseCurrency,
    cashBalances,
    pounds,
  }: {
    readonly baseCurrency: string;
    readonly cashBalances: ReadonlyMap<string, number>;
    readonly pounds: ReadonlyMap<string, number>;
  },
): readonly RawCashAccount[] {
  return messagesAt(client, fields.client.accounts).map((account, index) => {
    const id =
      optionalText(account, fields.account.id) ?? `account-${String(index)}`;
    const currency =
      optionalText(account, fields.account.currency) ?? baseCurrency;
    const balance = roundPence(cashBalances.get(id) ?? 0);
    return {
      balance,
      balanceGbp: balanceInGbp(balance, pounds.get(currency)),
      currency,
      id,
      isRetired: int32At(account, fields.account.isRetired) !== 0,
      name: textOf(account, fields.account.name),
      note: optionalText(account, fields.account.note),
    };
  });
}

// The set of non-blank raw protobuf field-1 ids present under a
// repeated client list field (excluding synthetic reader fallbacks).
function rawIdsOf(
  client: Message,
  listField: number,
  idField: number,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const entry of messagesAt(client, listField)) {
    const id = optionalText(entry, idField);
    if (id !== undefined) {
      ids.add(id);
    }
  }
  return ids;
}

// Counts raw protobuf transaction references for every cash account,
// securities account, and security UUID across all PTransaction entries
// (regardless of enum type, counting self-transfers once per transaction)
// so snapshot counts and server delete guards always agree.
function rawTransactionCountsOf(
  rawTransactions: readonly Message[],
): RawTransactionCounts {
  const cashAccounts = new Map<string, number>();
  const securitiesAccounts = new Map<string, number>();
  const securities = new Map<string, number>();
  for (const transaction of rawTransactions) {
    const account = optionalText(transaction, fields.transaction.account);
    const otherAccount = optionalText(
      transaction,
      fields.transaction.otherAccount,
    );
    if (account !== undefined) {
      cashAccounts.set(account, (cashAccounts.get(account) ?? 0) + 1);
    }
    if (otherAccount !== undefined && otherAccount !== account) {
      cashAccounts.set(otherAccount, (cashAccounts.get(otherAccount) ?? 0) + 1);
    }
    const portfolio = optionalText(transaction, fields.transaction.portfolio);
    const otherPortfolio = optionalText(
      transaction,
      fields.transaction.otherPortfolio,
    );
    if (portfolio !== undefined) {
      securitiesAccounts.set(
        portfolio,
        (securitiesAccounts.get(portfolio) ?? 0) + 1,
      );
    }
    if (otherPortfolio !== undefined && otherPortfolio !== portfolio) {
      securitiesAccounts.set(
        otherPortfolio,
        (securitiesAccounts.get(otherPortfolio) ?? 0) + 1,
      );
    }
    const security = optionalText(transaction, fields.transaction.security);
    if (security !== undefined) {
      securities.set(security, (securities.get(security) ?? 0) + 1);
    }
  }
  return { cashAccounts, securities, securitiesAccounts };
}

// What each securities account a Portfolio Performance file lists held
// in cash and was paid, read off its reference account, the cash
// account its purchases are paid from: the account's name; the cash
// left uninvested there, to the pound, what every transaction naming it
// has put in and taken out as the signs take them; and what was paid
// into it from outside the securities accounts' reference accounts on
// each day anything was, less what was taken out, to the pound, earliest
// first. A deposit is paid in and a removal taken out, and so is cash
// moved from or to a cash account no securities account takes as its
// reference, as a current account kept in the file is, while cash moved
// between two reference accounts is paid into neither. Securities
// accounts of one name are read together, over the reference accounts
// they take, each once. One taking no reference account, or one kept in
// a currency other than sterling, is left out, since the reader cannot
// say what it holds in pounds, and so is one with no name, as the
// cogitator leaves it. A day is the one the file dates a transaction on,
// which it writes as a moment in UTC.
// ponytail: two securities accounts of different names taking one
// reference account each read its cash whole; split it by what each
// bought if a file ever shares one.
function readPortfoliosFromClient(client: Message): readonly Portfolio[] {
  const baseCurrency =
    optionalText(client, fields.client.baseCurrency) ?? "GBP";
  const sterling = new Set(
    messagesAt(client, fields.client.accounts).flatMap((each) => {
      const id = optionalText(each, fields.account.id);
      const currency =
        optionalText(each, fields.account.currency) ?? baseCurrency;
      return id !== undefined && currency === "GBP" ? [id] : [];
    }),
  );
  const references = new Map<string, Set<string>>();
  for (const portfolio of messagesAt(client, fields.client.portfolios)) {
    const reference = textAt(portfolio, fields.portfolio.reference);
    const name = textOf(portfolio, fields.portfolio.name);
    if (reference !== undefined && name !== "") {
      references.set(
        name,
        (references.get(name) ?? new Set<string>()).add(reference),
      );
    }
  }
  const inside = new Set([...references.values()].flatMap((each) => [...each]));
  const transactions = messagesAt(client, fields.client.transactions);
  return [...references]
    .filter(([, accounts]) => [...accounts].every((id) => sterling.has(id)))
    .map(([name, accounts]) => {
      let cash = 0;
      const paid = new Map<string, number>();
      for (const transaction of transactions) {
        const type = int32At(transaction, fields.transaction.type);
        const amount =
          int64At(transaction, fields.transaction.amount) / hundredths;
        const from = textOf(transaction, fields.transaction.account);
        const to = textOf(transaction, fields.transaction.otherAccount);
        const debit = accounts.has(from)
          ? (cashSigns.get(type) ?? 0) * amount
          : 0;
        const credit =
          type === cashTransfer && accounts.has(to)
            ? transferCreditOf(transaction, amount)
            : 0;
        const delta = debit + credit;
        cash += delta;
        const isPaid =
          type === deposit ||
          type === removal ||
          (type === cashTransfer && !(inside.has(from) && inside.has(to)));
        if (delta !== 0 && isPaid) {
          const on = dayOf(transaction);
          paid.set(on, (paid.get(on) ?? 0) + delta);
        }
      }
      return {
        cash: Math.round(cash),
        name,
        paid: [...paid]
          .map(([on, amount]) => ({ amount: Math.round(amount), on }))
          .filter(({ amount }) => amount !== 0)
          .toSorted((one, other) => one.on.localeCompare(other.on)),
      };
    });
}

function readTargetsFromClient(client: Message): readonly Target[] {
  return targetsOf(
    classesIn(client),
    worthOf(client, securitiesOf(client), sharesHeld(client)),
  );
}

function recordLatestDate(
  dates: Map<string, string>,
  id: string | undefined,
  date: string,
): void {
  if (id === undefined) {
    return;
  }
  const existing = dates.get(id);
  if (existing === undefined || date > existing) {
    dates.set(id, date);
  }
}

// Verifies that exactly one raw protobuf message in `listField` carries
// `targetId` under `idField`, returning that decoded message or
// refusing on 0 (not found) or > 1 (duplicate id).
function requireUniqueRawId(
  client: Message,
  {
    idField,
    label,
    listField,
    targetId,
  }: {
    readonly idField: number;
    readonly label: string;
    readonly listField: number;
    readonly targetId: string;
  },
): Message {
  let matched: Message | undefined;
  let matches = 0;
  for (const entry of messagesAt(client, listField)) {
    if (optionalText(entry, idField) === targetId) {
      matched = entry;
      matches += 1;
    }
  }
  if (matched === undefined) {
    throw new Refusal(`The selected ${label} was not found`);
  }
  if (matches > 1) {
    throw new Refusal(
      `Multiple ${label} entries share this id, so it cannot be changed safely`,
    );
  }
  return matched;
}

function resolveCashRef(
  cashCurrencies: ReadonlyMap<string, string>,
  id: string | undefined,
  expectedCurrency: string,
): string {
  const trimmed = trimmedOptional(id);
  const actual =
    trimmed === undefined ? undefined : cashCurrencies.get(trimmed);
  if (trimmed === undefined || actual === undefined) {
    throw new Refusal("The selected cash account was not found");
  }
  if (actual !== expectedCurrency) {
    throw new Refusal(
      "Transaction currency must match the cash account currency",
    );
  }
  return trimmed;
}

// Effective quote feed for a security: historical feed (field 11) is
// primary, with Yahoo feeds winning over non-Yahoo/NO_DATA companion
// feeds so PP's common feed=YAHOO + latestFeed=NO_DATA setup stays
// Yahoo-eligible.
function resolvedFeedOf(security: Message): string | undefined {
  const historical = optionalText(security, fields.security.feed);
  const latest = optionalText(security, fields.security.latestFeed);
  if (historical !== undefined && yahooFeeds.has(historical)) {
    return historical;
  }
  if (latest !== undefined && yahooFeeds.has(latest)) {
    return latest;
  }
  return historical ?? latest;
}

// Validates and derives the cross-currency GROSS_VALUE unit for a
// transaction, auto-computing GBP -> GBX at 0.01 and deriving
// fxRateToBase from gross settlement / foreign amount otherwise.
function resolveGrossValue({
  amountPence,
  currency,
  feesPence,
  fxAmount,
  fxCurrency,
  rule,
  taxesPence,
}: {
  readonly amountPence: number;
  readonly currency: string;
  readonly feesPence: number;
  readonly fxAmount: number | undefined;
  readonly fxCurrency: string | undefined;
  readonly rule: TransactionWriteRule;
  readonly taxesPence: number;
}): GrossValueSpec | undefined {
  if (fxCurrency === undefined) {
    if (fxAmount !== undefined) {
      throw new Refusal(
        "Foreign amount only applies to cross-currency transactions",
      );
    }
    return undefined;
  }
  const grossPence = grossAmountPenceOf({
    amountPence,
    feesPence,
    rule,
    taxesPence,
  });
  if (currency === "GBP" && fxCurrency === "GBX") {
    if (fxAmount !== undefined) {
      throw new Refusal("GBP to GBX conversions are calculated automatically");
    }
    const fxAmountMinor = grossPence * hundredths;
    if (fxAmountMinor > Number.MAX_SAFE_INTEGER) {
      throw new Refusal("Gross amount is out of range");
    }
    return {
      amountPence: grossPence,
      currency,
      fxAmountMinor,
      fxCurrency,
      rate: 0.01,
    };
  }
  if (fxAmount === undefined) {
    throw new Refusal(`Enter the foreign amount in ${fxCurrency}`);
  }
  const fxAmountMinor = moneyToHundredths(fxAmount, "Foreign amount", {
    isZeroAllowed: false,
  });
  return {
    amountPence: grossPence,
    currency,
    fxAmountMinor,
    fxCurrency,
    rate: grossPence / fxAmountMinor,
  };
}
function resolveIdRef(
  knownIds: ReadonlySet<string>,
  id: string | undefined,
  notFoundMessage: string,
): string {
  const trimmed = trimmedOptional(id);
  if (trimmed === undefined || !knownIds.has(trimmed)) {
    throw new Refusal(notFoundMessage);
  }
  return trimmed;
}

function resolveOtherCashRef(
  cashCurrencies: ReadonlyMap<string, string>,
  id: string | undefined,
  accountId: string | undefined,
): { readonly currency: string; readonly id: string } {
  const trimmed = trimmedOptional(id);
  const otherCurrency =
    trimmed === undefined ? undefined : cashCurrencies.get(trimmed);
  if (trimmed === undefined || otherCurrency === undefined) {
    throw new Refusal("The destination cash account was not found");
  }
  if (trimmed === accountId) {
    throw new Refusal("Source and destination accounts must differ");
  }
  return { currency: otherCurrency, id: trimmed };
}

// Opens a binary .portfolio file, validates its PClient protobuf stream,
// applies a byte-preserving protobuf edit, and re-zips it alongside
// every sibling entry, retrying at maximum deflate level when default
// compression crosses maxPortfolioBytes.
function rewriteClient(
  file: Uint8Array,
  edit: (client: Uint8Array) => Uint8Array,
): Uint8Array<ArrayBuffer> {
  const { client, parts } = opened(file);
  messageOf(client);
  const rewritten = edit(client);
  const entries = { ...parts, [part]: joined([strToU8(signature), rewritten]) };
  const compressed = new Uint8Array(zipSync(entries));
  if (compressed.byteLength <= maxPortfolioBytes) {
    return compressed;
  }
  return new Uint8Array(zipSync(entries, { level: 9 }));
}

// Upserts one historical price into a PSecurity message, clears
// shadowed latest quotes, and refreshes PSecurity.updatedAt while
// keeping every other field byte for byte.
function rewriteSecurityQuote(
  securityBytes: Uint8Array,
  {
    closeScaled,
    quoteEpochDay,
    updatedAt,
  }: {
    readonly closeScaled: number;
    readonly quoteEpochDay: number;
    readonly updatedAt: Uint8Array;
  },
): Uint8Array {
  const security = messageOf(securityBytes);
  const newPrice = historicalPriceBytesOf(quoteEpochDay, closeScaled);
  const withPrices = withReplacedMessagesAt(
    securityBytes,
    fields.security.prices,
    (existing) => upsertHistoricalPrice(existing, quoteEpochDay, newPrice),
  );
  const latest = messagesAt(security, fields.security.latest).at(-1);
  const withLatest =
    latest !== undefined && !isStrictlyNewerLatest(latest, quoteEpochDay)
      ? withoutField(withPrices, fields.security.latest)
      : withPrices;
  return withMessageAt(withLatest, fields.security.updatedAt, updatedAt);
}

// Rounds a share count or quote price to integer hundred-millionths
// before asserting positivity.
function scaledValueOf(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > maxPortfolioScaled) {
    throw new Refusal(`${label} is out of range`);
  }
  const units = Math.round(value * scaled);
  if (units < 1) {
    throw new Refusal(`${label} must be greater than zero`);
  }
  return units;
}

// The securities the file holds, by id, each as it is priced.
function securitiesOf(client: Message): ReadonlyMap<string, Security> {
  return new Map(
    messagesAt(client, fields.client.securities).map((security, index) => {
      const { date, price } = latestQuoteOf(security);
      return [
        optionalText(security, fields.security.id) ??
          `security-${String(index)}`,
        {
          currency:
            optionalText(security, fields.security.currency) ?? "no currency",
          isin: optionalText(security, fields.security.isin),
          isRetired: int32At(security, fields.security.isRetired) !== 0,
          name: textOf(security, fields.security.name),
          note: optionalText(security, fields.security.note),
          price,
          quoteDate: date,
          ticker: optionalText(security, fields.security.ticker),
        },
      ];
    }),
  );
}

// Scans every classification in the first Asset Allocation taxonomy to
// determine each assigned vehicle's single-leaf status: exactly one
// 100% assignment on a root-reachable named leaf yields categoryId and
// isSplitCategory: false; any other assignment shape yields
// isSplitCategory: true.
function securityCategoryStatusMapOf(
  client: Message,
): ReadonlyMap<string, SecurityCategoryStatus> {
  const found = messagesAt(client, fields.client.taxonomies).find(
    (each) => textAt(each, fields.taxonomy.name) === taxonomy,
  );
  if (found === undefined) {
    return new Map();
  }
  const classes = messagesAt(found, fields.taxonomy.classes).map(classOf);
  const root = classes.find((each) => each.parent === undefined);
  const leafClasses =
    root === undefined
      ? new Set<Class>()
      : new Set(
          taxonomyLeavesOf(classes, root).map((leaf) => leaf.sourceClass),
        );
  const statusByVehicle = new Map<string, SecurityCategoryStatus>();
  for (const cls of classes) {
    const isLeaf = leafClasses.has(cls);
    for (const { vehicle, weight } of cls.assignments) {
      const isSingleFullLeaf =
        !statusByVehicle.has(vehicle) && isLeaf && weight === whole;
      statusByVehicle.set(
        vehicle,
        isSingleFullLeaf
          ? { categoryId: cls.id, isSplitCategory: false }
          : { categoryId: undefined, isSplitCategory: true },
      );
    }
  }
  return statusByVehicle;
}

// Raw protobuf security ids mapped to their optional quote currency
// (empty string when omitted in field 4).
function securityCurrenciesOf(client: Message): ReadonlyMap<string, string> {
  const currencies = new Map<string, string>();
  for (const security of messagesAt(client, fields.client.securities)) {
    const id = optionalText(security, fields.security.id);
    if (id !== undefined) {
      currencies.set(
        id,
        optionalText(security, fields.security.currency) ?? "",
      );
    }
  }
  return currencies;
}

// What each securities account holds of each security, by the
// security's id and then the account's, summed from the transactions as
// the signs take them, a transfer taking its shares off the account it
// names and adding them to the other, in hundred-millionths of a share
// as they are written. A transaction on no security, a deposit or a
// removal, holds none, and one naming no account is held in an account
// of no id.
function sharesHeld(
  client: Message,
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const held = new Map<string, Map<string, number>>();
  const add = (security: string, account: string, shares: number): void => {
    const accounts = held.get(security) ?? new Map<string, number>();
    accounts.set(account, (accounts.get(account) ?? 0) + shares);
    held.set(security, accounts);
  };
  for (const transaction of messagesAt(client, fields.client.transactions)) {
    const security = textAt(transaction, fields.transaction.security);
    const type = int32At(transaction, fields.transaction.type);
    const sign = signs.get(type);
    const account = textOf(transaction, fields.transaction.portfolio);
    const shares = int64At(transaction, fields.transaction.shares);
    if (security !== undefined && sign !== undefined) {
      add(security, account, sign * shares);
    }
    if (security !== undefined && type === transfer) {
      add(security, account, -shares);
      add(
        security,
        textOf(transaction, fields.transaction.otherPortfolio),
        shares,
      );
    }
  }
  return held;
}

// Strips every assignment referencing `vehicleId` from taxonomies
// (either only the first Asset Allocation taxonomy or every taxonomy),
// rewriting only affected taxonomies and classes so untouched entries
// stay byte for byte identical.
function stripTaxonomyAssignments(
  clientBytes: Uint8Array,
  vehicleId: string,
  { isAssetAllocationOnly }: { readonly isAssetAllocationOnly: boolean },
): Uint8Array {
  let hasVisitedAssetAllocation = false;
  return withMessagesAt(clientBytes, fields.client.taxonomies, (taxBytes) => {
    const parsedTax = messageOf(taxBytes);
    if (isAssetAllocationOnly) {
      if (
        hasVisitedAssetAllocation ||
        textAt(parsedTax, fields.taxonomy.name) !== taxonomy
      ) {
        return taxBytes;
      }
      hasVisitedAssetAllocation = true;
    }
    const hasTaxMatch = messagesAt(parsedTax, fields.taxonomy.classes).some(
      (cls) =>
        messagesAt(cls, fields.class.assignments).some(
          (assignment) =>
            textOf(assignment, fields.assignment.vehicle) === vehicleId,
        ),
    );
    if (!hasTaxMatch) {
      return taxBytes;
    }
    return withMessagesAt(taxBytes, fields.taxonomy.classes, (classBytes) => {
      const hasClassMatch = messagesAt(
        messageOf(classBytes),
        fields.class.assignments,
      ).some(
        (assignment) =>
          textOf(assignment, fields.assignment.vehicle) === vehicleId,
      );
      if (!hasClassMatch) {
        return classBytes;
      }
      return withReplacedMessagesAt(
        classBytes,
        fields.class.assignments,
        (assignments) =>
          assignments.filter(
            (raw) =>
              textOf(messageOf(raw), fields.assignment.vehicle) !== vehicleId,
          ),
      );
    });
  });
}

// The categories of a taxonomy's classes, from its root down, each
// worth what the holdings assigned to it come to. A category with no
// name, which the household keeps none of, is refused in words saying
// where it sits.
function targetsOf(
  classes: readonly Class[],
  worth: (
    assignments: readonly Assignment[],
  ) => Pick<Target, "accounts" | "value">,
): readonly Target[] {
  const { beneath, root } = treeOf(classes);
  const categoriesOf = (
    of: Class,
    above: readonly string[],
    share: number,
  ): readonly Target[] => {
    const within = (share * of.weight) / whole;
    const below = beneath(of);
    const name = of.name.trim();
    if (below.length === 0 && name === "") {
      throw new Refusal(
        `The ${taxonomy} taxonomy has a category with no name beneath ${above.length === 0 ? "its root" : above.join(" · ")}`,
      );
    }
    return below.length === 0
      ? [
          {
            ...worth(of.assignments),
            classes: above,
            id: of.id,
            isImplemented: of.assignments.length > 0,
            name,
            share: within,
          },
        ]
      : below.flatMap((each) =>
          categoriesOf(each, [...above, of.name], within),
        );
  };
  return beneath(root).flatMap((each) =>
    categoriesOf(each, [], 1).toSorted((one, other) => other.share - one.share),
  );
}

// Optional root-reachable leaf categories (with their classification
// ids, disambiguated by ancestor path when two leaves share a name),
// sorted security assignment labels, and complete single-leaf / split
// assignment status from the file's Asset Allocation taxonomy,
// returning empty results rather than refusing when the taxonomy or root
// is absent.
function taxonomyInfoOf(
  client: Message,
  securities: ReadonlyMap<string, Security>,
): {
  readonly categories: readonly PortfolioCategory[];
  readonly categoryBySecurity: ReadonlyMap<string, string>;
  readonly categoryStatusBySecurity: ReadonlyMap<
    string,
    SecurityCategoryStatus
  >;
} {
  const categoryStatusBySecurity = securityCategoryStatusMapOf(client);
  const found = messagesAt(client, fields.client.taxonomies).find(
    (each) => textAt(each, fields.taxonomy.name) === taxonomy,
  );
  if (found === undefined) {
    return {
      categories: [],
      categoryBySecurity: new Map(),
      categoryStatusBySecurity,
    };
  }
  const classes = messagesAt(found, fields.taxonomy.classes).map(classOf);
  const root = classes.find((each) => each.parent === undefined);
  if (root === undefined) {
    return {
      categories: [],
      categoryBySecurity: new Map(),
      categoryStatusBySecurity,
    };
  }
  const leaves = taxonomyLeavesOf(classes, root);
  const seenNames = new Set<string>();
  const duplicateNames = new Set<string>();
  for (const leaf of leaves) {
    if (seenNames.has(leaf.name)) {
      duplicateNames.add(leaf.name);
    } else {
      seenNames.add(leaf.name);
    }
  }
  const labeled = leaves.map((leaf) => ({
    assignments: leaf.assignments,
    id: leaf.id,
    name: duplicateNames.has(leaf.name)
      ? [...leaf.ancestors, leaf.name].join(" · ")
      : leaf.name,
  }));
  const categories: readonly PortfolioCategory[] = labeled
    .map(({ assignments, id, name }) => {
      const securityIds: string[] = [];
      const seenSecurityIds = new Set<string>();
      for (const { vehicle } of assignments) {
        const security = securities.get(vehicle);
        if (
          security !== undefined &&
          !security.isRetired &&
          !seenSecurityIds.has(vehicle)
        ) {
          seenSecurityIds.add(vehicle);
          securityIds.push(vehicle);
        }
      }
      return { id, name, securityIds };
    })
    .toSorted((one, other) => {
      const byName = one.name.localeCompare(other.name);
      return byName !== 0 ? byName : one.id.localeCompare(other.id);
    });
  const assigned = new Map<string, Set<string>>();
  for (const leaf of labeled) {
    for (const { vehicle } of leaf.assignments) {
      assigned.set(
        vehicle,
        (assigned.get(vehicle) ?? new Set<string>()).add(leaf.name),
      );
    }
  }
  return {
    categories,
    categoryBySecurity: new Map(
      [...assigned].map(([vehicle, labels]) => [
        vehicle,
        [...labels]
          .toSorted((one, other) => one.localeCompare(other))
          .join(", "),
      ]),
    ),
    categoryStatusBySecurity,
  };
}

// Index of the first root-reachable named leaf matching categoryId in
// the file's Asset Allocation taxonomy, or -1 when absent.
function taxonomyLeafIndexOf(client: Message, categoryId: string): number {
  const found = messagesAt(client, fields.client.taxonomies).find(
    (each) => textAt(each, fields.taxonomy.name) === taxonomy,
  );
  if (found === undefined) {
    return -1;
  }
  const classes = messagesAt(found, fields.taxonomy.classes).map(classOf);
  const root = classes.find((each) => each.parent === undefined);
  if (root === undefined) {
    return -1;
  }
  const leaf = taxonomyLeavesOf(classes, root).find(
    (entry) => entry.id === categoryId,
  );
  return leaf === undefined ? -1 : classes.indexOf(leaf.sourceClass);
}

// Named leaf classes reachable from a taxonomy's root, ignoring blank
// ids/names, duplicate ids, and orphaned subtrees, and guarding against
// cyclic parent pointers while tracking ancestor names beneath the root.
function taxonomyLeavesOf(
  classes: readonly Class[],
  root: Class,
): readonly TaxonomyLeaf[] {
  const leaves: TaxonomyLeaf[] = [];
  const seenLeafIds = new Set<string>();
  const walk = (
    node: Class,
    ancestors: readonly string[],
    seen: ReadonlySet<string>,
  ): void => {
    const children = classes.filter(
      (each) => each.parent === node.id && !seen.has(each.id),
    );
    const trimmedName = node.name.trim();
    if (children.length === 0) {
      if (
        node.id !== root.id &&
        node.id.trim() !== "" &&
        trimmedName !== "" &&
        !seenLeafIds.has(node.id)
      ) {
        seenLeafIds.add(node.id);
        leaves.push({
          ancestors,
          assignments: node.assignments,
          id: node.id,
          name: trimmedName,
          sourceClass: node,
        });
      }
      return;
    }
    const nextSeen = new Set([...seen, node.id]);
    const nextAncestors =
      node.id === root.id || trimmedName === ""
        ? ancestors
        : [...ancestors, trimmedName];
    for (const child of children) {
      walk(child, nextAncestors, nextSeen);
    }
  };
  walk(root, [], new Set());
  return leaves;
}

// Encodes a single TAX PTransactionUnit submessage.
function taxUnitBytesOf(currency: string, taxesPence: number): Uint8Array {
  return joined([
    wholeField(fields.unit.type, taxUnit),
    wholeField(fields.unit.amount, taxesPence),
    textField(fields.unit.currency, currency),
  ]);
}

// The text written under a number, or nothing where none was, as an id
// or a name the file leaves out reads.
function textOf(message: Message, number: number): string {
  return textAt(message, number) ?? "";
}

// Encodes a UTC Date as google.protobuf.Timestamp bytes, omitting
// zero fields so epoch 0 produces an empty submessage.
function timestampBytesOf(date: Date): Uint8Array {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  const nanos = (ms - seconds * 1000) * 1_000_000;
  return joined([
    ...(seconds === 0 ? [] : [wholeField(fields.timestamp.seconds, seconds)]),
    ...(nanos === 0 ? [] : [wholeField(fields.timestamp.nanos, nanos)]),
  ]);
}

// Summed fee and tax units for a single transaction, rounded to the penny.
function transactionCostsOf(entry: Message): {
  readonly fees: number;
  readonly taxes: number;
} {
  let fees = 0;
  let taxes = 0;
  for (const unit of messagesAt(entry, fields.transaction.units)) {
    const unitType = int32At(unit, fields.unit.type);
    const unitAmount = int64At(unit, fields.unit.amount) / hundredths;
    if (unitType === feeUnit) {
      fees += unitAmount;
    } else if (unitType === taxUnit) {
      taxes += unitAmount;
    }
  }
  return { fees: roundPence(fees), taxes: roundPence(taxes) };
}

// Every known Portfolio Performance transaction decoded with resolved
// account/portfolio/security names, summed fee and tax units, and
// sorted newest first with deterministic original-order tie-breaking.
function transactionsOf(
  rawTransactions: readonly Message[],
  context: {
    readonly accountNames: ReadonlyMap<string, string>;
    readonly baseCurrency: string;
    readonly portfolioNames: ReadonlyMap<string, string>;
    readonly securities: ReadonlyMap<string, Security>;
  },
): readonly PortfolioTransaction[] {
  return rawTransactions
    .map((entry, index) => decodeTransaction(entry, index, context))
    .filter((item) => item !== null)
    .toSorted((one, other) =>
      other.transaction.timestamp !== one.transaction.timestamp
        ? other.transaction.timestamp - one.transaction.timestamp
        : one.index - other.index,
    )
    .map(({ transaction }) => transaction);
}

// Encodes optional GROSS_VALUE (with PDecimalValue exchange rate) plus
// positive fee and tax PTransactionUnit submessages.
function transactionUnitsOf({
  currency,
  feesPence,
  grossValue,
  taxesPence,
}: {
  readonly currency: string;
  readonly feesPence: number;
  readonly grossValue: GrossValueSpec | undefined;
  readonly taxesPence: number;
}): readonly Uint8Array[] {
  const units: Uint8Array[] = [];
  if (grossValue !== undefined) {
    units.push(
      delimitedOf(fields.transaction.units, grossUnitBytesOf(grossValue)),
    );
  }
  if (feesPence > 0) {
    units.push(
      delimitedOf(
        fields.transaction.units,
        feeUnitBytesOf(currency, feesPence),
      ),
    );
  }
  if (taxesPence > 0) {
    units.push(
      delimitedOf(
        fields.transaction.units,
        taxUnitBytesOf(currency, taxesPence),
      ),
    );
  }
  return units;
}

// What a cash transfer credits to its receiving account: the foreign
// gross-value amount for a cross-currency transfer, or the transaction
// amount itself when both accounts share a currency.
function transferCreditOf(transaction: Message, fallback: number): number {
  for (const unit of messagesAt(transaction, fields.transaction.units)) {
    if (int32At(unit, fields.unit.type) === grossValueUnit) {
      const foreign = int64At(unit, fields.unit.fxAmount);
      if (foreign > 0) {
        return foreign / hundredths;
      }
    }
  }
  return fallback;
}

// A taxonomy's classes as the tree from its root. A class with no id
// is refused, and so is one listed twice, since either would leave the
// taxonomy no single tree to read, as are a taxonomy with no root and
// one with no class beneath it. A class beneath none the taxonomy lists
// is part of no tree from its root, so is not read.
function treeOf(classes: readonly Class[]): Tree {
  if (classes.some(({ id }) => id === "")) {
    throw new Refusal(`The ${taxonomy} taxonomy has a class with no id`);
  }
  if (new Set(classes.map(({ id }) => id)).size !== classes.length) {
    throw new Refusal(`The ${taxonomy} taxonomy lists a class twice`);
  }
  const root = classes.find(({ parent }) => parent === undefined);
  if (root === undefined) {
    throw new Refusal(`The ${taxonomy} taxonomy has no root`);
  }
  const beneath = (above: Class): readonly Class[] =>
    classes
      .filter(({ parent }) => parent === above.id)
      .sort((one, other) => one.rank - other.rank);
  if (beneath(root).length === 0) {
    throw new Refusal(`The ${taxonomy} taxonomy holds no classes`);
  }
  return { beneath, root };
}

function trimmedOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function trimmedRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Refusal(`${label} cannot be blank`);
  }
  return trimmed;
}

// Preserves undated and untouched dated historical prices byte for
// byte, deduplicates any pre-existing entry for quoteEpochDay, and
// sorts dated entries strictly ascending by epoch day.
function upsertHistoricalPrice(
  existing: readonly Uint8Array[],
  quoteEpochDay: number,
  newPrice: Uint8Array,
): readonly Uint8Array[] {
  const undated: Uint8Array[] = [];
  const dated: { readonly bytes: Uint8Array; readonly epochDay: number }[] = [];
  for (const entryBytes of existing) {
    const parsed = messageOf(entryBytes);
    if (!parsed.has(fields.price.date)) {
      undated.push(entryBytes);
    } else {
      const epochDay = int64At(parsed, fields.price.date);
      if (epochDay !== quoteEpochDay) {
        dated.push({ bytes: entryBytes, epochDay });
      }
    }
  }
  dated.push({ bytes: newPrice, epochDay: quoteEpochDay });
  return [
    ...undated,
    ...dated
      .toSorted((one, other) => one.epochDay - other.epochDay)
      .map((item) => item.bytes),
  ];
}

// Validates that every target category share lies in [0, 1] and all
// shares sum to 1 within tolerance using NaN-safe comparisons.
function validateTargetShares(categories: readonly Target[]): void {
  let sum = 0;
  for (const { share } of categories) {
    if (!(share >= 0 && share <= 1)) {
      throw new Refusal(
        "Each target category share must be between 0% and 100%",
      );
    }
    sum += share;
  }
  const isTotalOne = Math.abs(sum - 1) <= tolerance;
  if (!isTotalOne) {
    throw new Refusal("Target category shares must add up to 100%");
  }
}

// Resolves and validates every account, portfolio and security id
// required by a transaction rule against raw protobuf field-1 ids.
function validateTransactionRefs(
  client: Message,
  input: NewPortfolioTransaction,
  {
    currency,
    rule,
  }: { readonly currency: string; readonly rule: TransactionWriteRule },
): ResolvedTransactionRefs {
  const baseCurrency =
    optionalText(client, fields.client.baseCurrency) ?? "GBP";
  const cashCurrencies =
    rule.hasAccount || rule.hasOtherAccount
      ? cashCurrenciesOf(client, baseCurrency)
      : new Map<string, string>();
  const portfolioIds =
    rule.hasPortfolio || rule.hasOtherPortfolio
      ? rawIdsOf(client, fields.client.portfolios, fields.portfolio.id)
      : new Set<string>();
  const securityCurrencies = rule.hasSecurity
    ? securityCurrenciesOf(client)
    : new Map<string, string>();
  const securityIds = new Set(securityCurrencies.keys());

  const accountId = rule.hasAccount
    ? resolveCashRef(cashCurrencies, input.accountId, currency)
    : undefined;
  const otherCash = rule.hasOtherAccount
    ? resolveOtherCashRef(cashCurrencies, input.otherAccountId, accountId)
    : undefined;
  const otherAccountId = otherCash?.id;
  const portfolioId = rule.hasPortfolio
    ? resolveIdRef(
        portfolioIds,
        input.portfolioId,
        "The selected securities account was not found",
      )
    : undefined;
  const otherPortfolioId = rule.hasOtherPortfolio
    ? resolveIdRef(
        portfolioIds,
        input.otherPortfolioId,
        "The destination securities account was not found",
      )
    : undefined;
  if (otherPortfolioId !== undefined && otherPortfolioId === portfolioId) {
    throw new Refusal("Source and destination accounts must differ");
  }
  const securityId = rule.hasSecurity
    ? resolveIdRef(
        securityIds,
        input.securityId,
        "The selected security was not found",
      )
    : undefined;
  const fxCurrency = fxCurrencyOf({
    currency,
    otherCashCurrency: otherCash?.currency,
    rule,
    securityCurrency:
      securityId === undefined ? undefined : securityCurrencies.get(securityId),
  });

  return {
    accountId,
    fxCurrency,
    otherAccountId,
    otherPortfolioId,
    portfolioId,
    securityId,
  };
}

// ISO calendar date of a known-type transaction carrying an explicit
// in-range timestamp, or null otherwise.
function validTransactionDateOf(entry: Message): null | string {
  if (
    !transactionTypes.has(int32At(entry, fields.transaction.type)) ||
    !entry.has(fields.transaction.date)
  ) {
    return null;
  }
  const timestamp = dateOf(entry);
  return timestamp < minTimestamp || timestamp > maxTimestamp
    ? null
    : isoDateOf(timestamp);
}

// The weight of every class beneath the root, by its id, for the
// categories to hold the shares of the whole given: each class's share
// is its category's, or those of the classes beneath it added up, and
// its weight is its share over its parent's in hundredths of a per
// cent, the classes beneath one parent rounded to add up to the whole
// of it, and all nothing beneath a parent holding nothing.
function weightsOf(
  classes: readonly Class[],
  shares: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const { beneath, root } = treeOf(classes);
  const shareOf = (of: Class): number => {
    const below = beneath(of);
    return below.length === 0
      ? (shares.get(of.id) ?? 0)
      : sumOf(below, shareOf);
  };
  const weights = new Map<string, number>();
  const weigh = (above: Class): void => {
    const below = beneath(above);
    const held = shareOf(above);
    const rounded = hundredthsOf(
      new Map(
        below.map((each) => [each.id, held === 0 ? 0 : shareOf(each) / held]),
      ),
    );
    for (const [id, weight] of rounded) {
      weights.set(id, weight);
    }
    below.forEach(weigh);
  };
  weigh(root);
  return weights;
}

// Appends one full-weight (100%) vehicle assignment to the target leaf
// classification by index in the first Asset Allocation taxonomy
// (matching taxonomyLeafIndexOf), keeping every other taxonomy and
// classification byte for byte.
function withAssignedCategory(
  clientBytes: Uint8Array,
  targetClassIndex: number,
  vehicleId: string,
): Uint8Array {
  let hasUpdated = false;
  return withMessagesAt(clientBytes, fields.client.taxonomies, (written) => {
    if (
      hasUpdated ||
      textAt(messageOf(written), fields.taxonomy.name) !== taxonomy
    ) {
      return written;
    }
    hasUpdated = true;
    let classIndex = 0;
    return withMessagesAt(written, fields.taxonomy.classes, (each) => {
      const currentIndex = classIndex;
      classIndex += 1;
      if (currentIndex !== targetClassIndex) {
        return each;
      }
      const parsed = messageOf(each);
      const ranks = messagesAt(parsed, fields.class.assignments).map((item) =>
        int32At(item, fields.assignment.rank),
      );
      const nextRank = Math.max(-1, ...ranks) + 1;
      const assignment = joined([
        textField(fields.assignment.vehicle, vehicleId),
        wholeField(fields.assignment.weight, whole),
        wholeField(fields.assignment.rank, nextRank),
      ]);
      return joined([each, delimitedOf(fields.class.assignments, assignment)]);
    });
  });
}

// What holdings assigned to a class come to, in whole pounds, read off
// the client's securities, securities accounts and transactions: each
// security held, at its last price in pounds, by the weight of it the
// class takes; and the same of what each securities account the client
// lists holds of it, by the account's name, those of one name together,
// an account holding nothing of the class left out. A vehicle the
// securities do not list, a cash account, and a security of which
// nothing is held, count for nothing; one held but priced in a currency
// the reader has no pound for is refused by name.
function worthOf(
  client: Message,
  securities: ReadonlyMap<string, Security>,
  held: ReadonlyMap<string, ReadonlyMap<string, number>>,
): (assignments: readonly Assignment[]) => Pick<Target, "accounts" | "value"> {
  const pounds = poundsPer(client);
  const names = new Map(
    messagesAt(client, fields.client.portfolios).map((portfolio) => [
      textOf(portfolio, fields.portfolio.id),
      textOf(portfolio, fields.portfolio.name),
    ]),
  );
  return (assignments) => {
    const accounts = new Map<string, number>();
    const value = assignments.reduce((sum, { vehicle, weight }) => {
      // ponytail: a cash account assigned to a category is worth
      // nothing here; sum its transactions when a cash target is to be
      // bought toward.
      const security = securities.get(vehicle);
      const inAccounts = held.get(vehicle) ?? new Map<string, number>();
      const shares = sumOf([...inAccounts.values()], (each) => each) / scaled;
      if (security === undefined || shares <= 0) {
        return sum;
      }
      const factor = pounds.get(security.currency);
      if (factor === undefined) {
        throw new Refusal(
          `The file holds ${security.name}, priced in ${security.currency}, and no transaction in pounds gives a rate for it`,
        );
      }
      for (const [id, written] of inAccounts) {
        const name = names.get(id);
        if (name !== undefined && written > 0) {
          accounts.set(
            name,
            (accounts.get(name) ?? 0) +
              ((written / scaled) * security.price * factor * weight) / whole,
          );
        }
      }
      return sum + (shares * security.price * factor * weight) / whole;
    }, 0);
    return {
      accounts: [...accounts]
        .map(([name, worth]) => ({ name, value: Math.round(worth) }))
        .filter((each) => each.value > 0),
      value: Math.round(value),
    };
  };
}

function writeContextOf(options: undefined | WriteOptions): {
  readonly makeId: () => string;
  readonly now: Date;
  readonly today: string;
} {
  const now = options?.now ?? new Date();
  return {
    makeId: options?.uuid ?? ((): string => crypto.randomUUID()),
    now,
    today: options?.today ?? now.toISOString().slice(0, 10),
  };
}
