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

// What reading a binary Portfolio Performance file hands the Portfolio
// screen: the file name and base currency, the latest quote date across
// priced securities (or null when none have quotes), the securities and
// cash accounts, and active sterling totals.
export interface PortfolioSnapshot {
  readonly baseCurrency: string;
  readonly cashAccounts: readonly CashAccount[];
  readonly fileName: string;
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

// A bookkeeping sum rounded to the penny, with minus nothing normalised
// to zero.
export function roundPence(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}
