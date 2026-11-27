import type { Account } from "@/data/accounts";
import type { PortfolioFeed } from "@/data/portfolio";
import type { Month } from "@/data/schedule";

import { takesSpare } from "@/data/accounts";
import { roundPence } from "@/data/portfolio";
import { counted } from "@/lib/count";
import { formatCurrency, formatGbp } from "@/lib/money";
import { cutOf, formatDay, monthsBetween } from "@/lib/months";

// Precomputed Portfolio Performance balance lookup for every linked
// saving on Month end, serializable across the Server -> Client
// Component boundary.
export interface MonthEndPortfolio {
  readonly byAccountId: Readonly<Record<number, PortfolioBalanceEntry>>;
}

type EvaluatedPortfolioBalance =
  | {
      readonly balance: number;
      readonly canGroupPrefill: boolean;
      readonly info: readonly string[];
      readonly kind: "ready";
      readonly portfolioName: string;
      readonly warnings: readonly string[];
    }
  | { readonly kind: "historical"; readonly reason: string }
  | {
      readonly kind: "incomplete";
      readonly portfolioName: string;
      readonly reason: string;
    };

type PortfolioBalanceEntry =
  | {
      readonly balance: number;
      readonly breakdown?: string;
      readonly fxNote?: string;
      readonly hasHoldings: boolean;
      readonly kind: "ready";
      readonly lastTransactionDate: null | string;
      readonly oldestQuoteDate: null | string;
      readonly portfolioName: string;
      readonly warnings: readonly string[];
    }
  | {
      readonly kind: "incomplete";
      readonly portfolioName: string;
      readonly reason: string;
    };

type PortfolioFeedCash = PortfolioFeed["accounts"]["cash"][number];
type PortfolioFeedSecurities = PortfolioFeed["accounts"]["securities"][number];

const listFormat = new Intl.ListFormat("en-GB");

// Evaluates a linked saving's precomputed Portfolio entry against the
// worksheet's selected month (asOf) and the month cut last (due).
export function evaluatePrefillForMonth(
  entry: PortfolioBalanceEntry,
  { asOf, due }: { readonly asOf: Month; readonly due: Month },
): EvaluatedPortfolioBalance {
  if (monthsBetween(asOf, due) !== 0) {
    return {
      kind: "historical",
      reason: `Portfolio holds current balances, not ${formatDay(cutOf(asOf))}'s`,
    };
  }
  if (entry.kind === "incomplete") {
    return {
      kind: "incomplete",
      portfolioName: entry.portfolioName,
      reason: entry.reason,
    };
  }
  const cut = cutOf(asOf);
  const postCutDate =
    entry.lastTransactionDate !== null && entry.lastTransactionDate > cut
      ? entry.lastTransactionDate
      : null;
  const dynamicWarnings: string[] = [];
  if (postCutDate !== null) {
    dynamicWarnings.push(
      `Includes transactions after ${formatDay(cut)} (last ${formatDay(postCutDate)})`,
    );
  }
  if (entry.hasHoldings) {
    if (entry.oldestQuoteDate === null) {
      dynamicWarnings.push("Quote undated");
    } else if (entry.oldestQuoteDate < cut) {
      dynamicWarnings.push(`Oldest quote ${formatDay(entry.oldestQuoteDate)}`);
    }
  }
  const info: string[] = [];
  if (entry.breakdown !== undefined) {
    info.push(entry.breakdown);
  }
  if (entry.fxNote !== undefined) {
    info.push(entry.fxNote);
  }
  if (!entry.hasHoldings && postCutDate === null) {
    info.push(
      entry.lastTransactionDate === null
        ? "No transactions"
        : `Last transaction ${formatDay(entry.lastTransactionDate)}`,
    );
  }
  const warnings = [...entry.warnings, ...dynamicWarnings];
  return {
    balance: entry.balance,
    canGroupPrefill: warnings.length === 0,
    info,
    kind: "ready",
    portfolioName: entry.portfolioName,
    warnings,
  };
}

// Resolves Month end balance prefill entries for every household saving
// linked to a Portfolio Performance account via Account.portfolio.
// Returns undefined when no saving carries a Portfolio link so unlinked
// households see no Portfolio prefill UI on /close.
export function portfolioBalancesFor(
  accounts: readonly Account[],
  feed: PortfolioFeed,
): MonthEndPortfolio | undefined {
  const linkedSavings = accounts.filter(
    (account): account is Account & { readonly portfolio: string } =>
      takesSpare(account) && account.portfolio !== undefined,
  );
  if (linkedSavings.length === 0) {
    return undefined;
  }

  const seenExactisLinks = new Set<string>();
  const duplicateExactisLinks = new Set<string>();
  for (const account of linkedSavings) {
    const key = account.portfolio.trim();
    if (seenExactisLinks.has(key)) {
      duplicateExactisLinks.add(key);
    } else {
      seenExactisLinks.add(key);
    }
  }

  const activeSecuritiesByName = groupByTrimmedName(
    feed.accounts.securities.filter((account) => !account.isRetired),
  );
  const activeCash = feed.accounts.cash.filter((account) => !account.isRetired);
  const activeStandaloneCashByName = groupByTrimmedName(
    activeCash.filter((account) => account.referencedBy.length === 0),
  );
  const pairedCashByName = new Map<string, Set<string>>();
  for (const account of activeCash) {
    const key = account.name.trim();
    if (key !== "" && account.referencedBy.length > 0) {
      const names = pairedCashByName.get(key) ?? new Set<string>();
      for (const refName of account.referencedBy) {
        names.add(refName);
      }
      pairedCashByName.set(key, names);
    }
  }
  const retiredHeldSecuritiesNames = new Set(
    feed.accounts.securities
      .filter((account) => account.isRetired && account.holdingsCount > 0)
      .map((account) => account.name.trim())
      .filter((name) => name !== ""),
  );
  const retiredNames = new Set(
    [
      ...feed.accounts.securities.filter((account) => account.isRetired),
      ...feed.accounts.cash.filter((account) => account.isRetired),
    ]
      .map((account) => account.name.trim())
      .filter((name) => name !== ""),
  );

  const byAccountId: Record<number, PortfolioBalanceEntry> = {};
  for (const account of linkedSavings) {
    const key = account.portfolio.trim();
    const isDuplicateExactisLink = duplicateExactisLinks.has(key);
    byAccountId[account.id] = resolveLinkedEntry(key, {
      activeSecuritiesByName,
      activeStandaloneCashByName,
      isDuplicateExactisLink,
      pairedCashByName,
      retiredHeldSecuritiesNames,
      retiredNames,
    });
  }

  return { byAccountId };
}

function breakdownOf(
  investedGbp: number,
  cashGbp: number,
  totalRounded: number,
): string | undefined {
  if (cashGbp === 0) {
    return undefined;
  }
  const investedWhole = Math.round(investedGbp);
  const cashWhole = Math.round(cashGbp);
  const isReconciled =
    investedWhole + cashWhole === totalRounded && cashWhole !== 0;
  const operator = cashGbp < 0 ? "−" : "+";
  if (isReconciled) {
    return `${formatGbp(investedWhole)} ${operator} ${formatGbp(Math.abs(cashWhole))} cash`;
  }
  return `${formatCurrency(investedGbp, "GBP")} ${operator} ${formatCurrency(Math.abs(cashGbp), "GBP")} cash`;
}

function groupByTrimmedName<TItem extends { readonly name: string }>(
  items: readonly TItem[],
): ReadonlyMap<string, readonly TItem[]> {
  const grouped = new Map<string, TItem[]>();
  for (const item of items) {
    const key = item.name.trim();
    if (key !== "") {
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    }
  }
  return grouped;
}

function isForeignCurrency(code: string): boolean {
  return code !== "" && code !== "GBP" && code !== "GBX";
}

function latestDateOf(one: null | string, other: null | string): null | string {
  if (one !== null && other !== null) {
    return one >= other ? one : other;
  }
  return one ?? other;
}

function resolveCashAccount(
  cash: PortfolioFeedCash,
  portfolioName: string,
  isDuplicateExactisLink: boolean,
): PortfolioBalanceEntry {
  if (cash.balanceGbp === null) {
    return {
      kind: "incomplete",
      portfolioName,
      reason: `No GBP rate for ${cash.currency}`,
    };
  }
  if (cash.balanceGbp < 0) {
    return {
      kind: "incomplete",
      portfolioName,
      reason: `Balance is negative (${formatCurrency(cash.balanceGbp, "GBP")})`,
    };
  }
  const fxNote =
    cash.balance !== 0 && isForeignCurrency(cash.currency)
      ? "Latest transaction FX rate"
      : undefined;
  return {
    balance: Math.round(cash.balanceGbp),
    ...(fxNote !== undefined && { fxNote }),
    hasHoldings: false,
    kind: "ready",
    lastTransactionDate: cash.lastTransactionDate,
    oldestQuoteDate: null,
    portfolioName,
    warnings: isDuplicateExactisLink ? ["Also linked to another account"] : [],
  };
}

function resolveLinkedEntry(
  key: string,
  {
    activeSecuritiesByName,
    activeStandaloneCashByName,
    isDuplicateExactisLink,
    pairedCashByName,
    retiredHeldSecuritiesNames,
    retiredNames,
  }: {
    readonly activeSecuritiesByName: ReadonlyMap<
      string,
      readonly PortfolioFeedSecurities[]
    >;
    readonly activeStandaloneCashByName: ReadonlyMap<
      string,
      readonly PortfolioFeedCash[]
    >;
    readonly isDuplicateExactisLink: boolean;
    readonly pairedCashByName: ReadonlyMap<string, ReadonlySet<string>>;
    readonly retiredHeldSecuritiesNames: ReadonlySet<string>;
    readonly retiredNames: ReadonlySet<string>;
  },
): PortfolioBalanceEntry {
  const secMatches = activeSecuritiesByName.get(key) ?? [];
  const cashMatches = activeStandaloneCashByName.get(key) ?? [];
  if (
    secMatches.length + cashMatches.length > 1 ||
    (cashMatches.length > 0 && retiredHeldSecuritiesNames.has(key))
  ) {
    return {
      kind: "incomplete",
      portfolioName: key,
      reason: "Multiple Portfolio accounts share this name",
    };
  }
  const [sec] = secMatches;
  if (sec !== undefined) {
    return resolveSecuritiesAccount(sec, key, isDuplicateExactisLink);
  }
  const [cash] = cashMatches;
  if (cash !== undefined) {
    return resolveCashAccount(cash, key, isDuplicateExactisLink);
  }
  const paired = pairedCashByName.get(key);
  if (paired !== undefined) {
    return {
      kind: "incomplete",
      portfolioName: key,
      reason: `Paired as reference cash for ${listFormat.format([...paired])}`,
    };
  }
  if (retiredNames.has(key)) {
    return { kind: "incomplete", portfolioName: key, reason: "Retired" };
  }
  return { kind: "incomplete", portfolioName: key, reason: "Not found" };
}

function resolveReferenceCash(
  ref: PortfolioFeedSecurities["referenceCash"],
):
  | {
      readonly cashGbp: number;
      readonly foreignCurrency: string | undefined;
      readonly lastTransactionDate: null | string;
      readonly warning: string | undefined;
    }
  | { readonly kind: "incomplete"; readonly reason: string } {
  if (ref === null) {
    return {
      cashGbp: 0,
      foreignCurrency: undefined,
      lastTransactionDate: null,
      warning: undefined,
    };
  }
  if (ref.balance === 0) {
    return {
      cashGbp: 0,
      foreignCurrency: undefined,
      lastTransactionDate:
        !ref.isRetired && !ref.isShared ? ref.lastTransactionDate : null,
      warning: undefined,
    };
  }
  if (ref.isRetired) {
    return {
      kind: "incomplete",
      reason: "Reference cash account is retired with a non-zero balance",
    };
  }
  if (ref.isShared) {
    return {
      cashGbp: 0,
      foreignCurrency: undefined,
      lastTransactionDate: null,
      warning: `Excludes shared reference cash (${formatCurrency(ref.balance, ref.currency)})`,
    };
  }
  if (ref.balanceGbp === null) {
    return {
      kind: "incomplete",
      reason: `No GBP rate for ${ref.currency} reference cash`,
    };
  }
  return {
    cashGbp: ref.balanceGbp,
    foreignCurrency: isForeignCurrency(ref.currency) ? ref.currency : undefined,
    lastTransactionDate: ref.lastTransactionDate,
    warning: undefined,
  };
}

function resolveSecuritiesAccount(
  sec: PortfolioFeedSecurities,
  portfolioName: string,
  isDuplicateExactisLink: boolean,
): PortfolioBalanceEntry {
  if (sec.unpricedCount > 0) {
    return {
      kind: "incomplete",
      portfolioName,
      reason: `${counted(sec.unpricedCount, "holding")} unpriced`,
    };
  }
  if (sec.hasUncurrenciedHoldings) {
    return {
      kind: "incomplete",
      portfolioName,
      reason: "A holding has no quote currency",
    };
  }
  if (sec.noFxCurrencies.length > 0) {
    return {
      kind: "incomplete",
      portfolioName,
      reason: `No GBP rate for ${listFormat.format(sec.noFxCurrencies)}`,
    };
  }
  const ref = resolveReferenceCash(sec.referenceCash);
  if ("kind" in ref) {
    return { kind: "incomplete", portfolioName, reason: ref.reason };
  }
  const totalGbp = roundPence(sec.marketValueGbp + ref.cashGbp);
  if (totalGbp < 0) {
    return {
      kind: "incomplete",
      portfolioName,
      reason: `Balance is negative (${formatCurrency(totalGbp, "GBP")})`,
    };
  }
  const balance = Math.round(totalGbp);
  const breakdown = breakdownOf(sec.marketValueGbp, ref.cashGbp, balance);
  const hasForeignFx =
    sec.foreignCurrencies.length > 0 || ref.foreignCurrency !== undefined;
  const warnings = [
    ...(ref.warning === undefined ? [] : [ref.warning]),
    ...(isDuplicateExactisLink ? ["Also linked to another account"] : []),
  ];
  return {
    balance,
    ...(breakdown !== undefined && { breakdown }),
    ...(hasForeignFx && { fxNote: "Latest transaction FX rate" }),
    hasHoldings: sec.holdingsCount > 0,
    kind: "ready",
    lastTransactionDate: latestDateOf(
      sec.lastTransactionDate,
      ref.lastTransactionDate,
    ),
    oldestQuoteDate: sec.oldestQuoteDate,
    portfolioName,
    warnings,
  };
}
