import { sumOf } from "@/lib/ledger";

// A reference cash account paired beside a securities account: the cash
// account itself, and whether an earlier securities account already
// displayed its balance so column subtotals stay reconciled.
export interface AccountReference {
  readonly account: CashAccount;
  readonly isShared: boolean;
}

// A cash account as a Portfolio Performance file holds it, or a preview
// added in this browser tab: its UUID, name, currency code, balance in
// that currency, sterling equivalent when a GBP rate is known (or null
// for a non-zero balance in an unconvertible currency), optional note,
// retired flag, transaction count, and draft marker.
export interface CashAccount {
  readonly balance: number;
  readonly balanceGbp: null | number;
  readonly currency: string;
  readonly id: string;
  readonly isDraft?: true;
  readonly isRetired: boolean;
  readonly name: string;
  readonly note?: string;
  readonly transactionCount: number;
}

// A security in the file's catalogue (or a browser-only preview): its
// UUID, name, quote currency, latest known GBP conversion rate, latest
// positive quote price and date, optional ISIN, ticker, Asset Allocation
// category and note, retired flag, active total share count, per-account
// active share breakdown, and draft marker.
export interface Holding {
  readonly category?: string;
  readonly currency: string;
  readonly gbpRate: null | number;
  readonly id: string;
  readonly isDraft?: true;
  readonly isin?: string;
  readonly isRetired: boolean;
  readonly latestPrice: null | number;
  readonly latestPriceDate: null | string;
  readonly name: string;
  readonly note?: string;
  readonly shares: number;
  readonly sharesByAccount: readonly AccountShares[];
  readonly ticker?: string;
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

// What reading a binary Portfolio Performance file hands the Portfolio
// screen: the file name and base currency, the latest quote date across
// priced securities (or null when none have quotes), the securities and
// cash accounts, the security catalogue with per-account shares, the
// Asset Allocation categories when present, and active sterling totals.
export interface PortfolioSnapshot {
  readonly baseCurrency: string;
  readonly cashAccounts: readonly CashAccount[];
  readonly categories: readonly string[];
  readonly fileName: string;
  readonly holdings: readonly Holding[];
  readonly latestQuoteDate: null | string;
  readonly securitiesAccounts: readonly SecuritiesAccount[];
  readonly totalCash: number;
  readonly totalInvested: number;
}

// A securities account as a Portfolio Performance file holds it, or a
// preview added in this browser tab: its UUID, name, count of held
// securities, sterling market value to two decimal places, optional
// note, retired flag, optional reference cash account UUID, and draft
// marker.
export interface SecuritiesAccount {
  readonly holdingsCount: number;
  readonly id: string;
  readonly isDraft?: true;
  readonly isRetired: boolean;
  readonly marketValue: number;
  readonly name: string;
  readonly note?: string;
  readonly referenceAccountId?: string;
}

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

// A bookkeeping sum rounded to the penny, with minus nothing normalised
// to zero.
export function roundPence(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
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
