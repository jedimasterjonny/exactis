"use client";

import type { JSX } from "react";

import { ArrowLeftRight, Eye, Plus } from "lucide-react";
import { useState } from "react";

import type {
  CashAccount,
  Holding,
  PortfolioTransaction,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";
import type { Option, OptionGroup } from "@/lib/options";

import { EmptyState } from "@/components/app/molecules/empty-state";
import { LabelledSwitch } from "@/components/app/molecules/labelled-switch";
import { SelectField } from "@/components/app/molecules/select-field";
import { SectionCard } from "@/components/app/organisms/section-card";
import { TransactionsTable } from "@/components/app/organisms/transactions-table";
import { Button } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import {
  neighboursOf,
  transactionsViewOf,
  transactionTypeGroups,
} from "@/data/portfolio";
import { counted } from "@/lib/count";

interface PortfolioTransactionsProps {
  readonly accountId: string;
  readonly cashAccounts: readonly CashAccount[];
  readonly holdings: readonly Holding[];
  readonly isReadOnly?: boolean;
  readonly isShowingInactive: boolean;
  readonly label: string;
  readonly onAccountChange: (accountId: string) => void;
  readonly onAddTransaction: () => void;
  readonly onDeleteTransaction?: (
    transaction: PortfolioTransaction,
    fallbackFocusIds: readonly string[],
  ) => void;
  readonly onEditTransaction?: (
    transaction: PortfolioTransaction,
    fallbackFocusIds: readonly string[],
  ) => void;
  readonly onSecurityChange: (securityId: string) => void;
  readonly onShowingInactiveChange: (isShowing: boolean) => void;
  readonly onTypeChange: (type: "" | TransactionType) => void;
  readonly readOnlyId?: string | undefined;
  readonly securitiesAccounts: readonly SecuritiesAccount[];
  readonly securityId: string;
  readonly transactions: readonly PortfolioTransaction[];
  readonly type: "" | TransactionType;
}

const pageSize = 50;

// The Portfolio screen's Transactions tab: three controlled filters
// (grouped Account select by UUID, grouped Type select, Security
// select), a controlled toggle hiding retired accounts and zero-share
// securities from the filter dropdowns by default (and clearing hidden
// selections when switched off), TransactionsTable paginated 50 rows
// at a time without effect-derived state, a primary Add transaction
// action, and a footer reporting how many rows are shown with a
// "Show 50 more" trigger.
export function PortfolioTransactions({
  accountId,
  cashAccounts,
  holdings,
  isReadOnly = false,
  isShowingInactive,
  label,
  onAccountChange,
  onAddTransaction,
  onDeleteTransaction,
  onEditTransaction,
  onSecurityChange,
  onShowingInactiveChange,
  onTypeChange,
  readOnlyId,
  securitiesAccounts,
  securityId,
  transactions,
  type,
}: PortfolioTransactionsProps): JSX.Element {
  const retiredAccountIds = new Set([
    ...securitiesAccounts
      .filter((account) => account.isRetired)
      .map((account) => account.id),
    ...cashAccounts
      .filter((account) => account.isRetired)
      .map((account) => account.id),
  ]);
  const zeroShareSecurityIds = new Set(
    holdings.filter(isZeroShareOption).map((holding) => holding.id),
  );
  const hasRetiredAccounts = retiredAccountIds.size > 0;
  const hasZeroShareSecurities = zeroShareSecurityIds.size > 0;
  const hasInactiveOptions = hasRetiredAccounts || hasZeroShareSecurities;

  const visibleSecurities = isShowingInactive
    ? securitiesAccounts
    : securitiesAccounts.filter((account) => !account.isRetired);
  const visibleCash = isShowingInactive
    ? cashAccounts
    : cashAccounts.filter((account) => !account.isRetired);

  const accountGroups = accountGroupsOf(visibleSecurities, visibleCash);
  const validAccountIds = new Set([
    ...visibleSecurities.map((account) => account.id),
    ...visibleCash.map((account) => account.id),
  ]);
  const effectiveAccountId = validAccountIds.has(accountId) ? accountId : "";

  const visibleHoldings = (
    isShowingInactive
      ? holdings
      : holdings.filter((holding) => !isZeroShareOption(holding))
  ).toSorted((one, other) => one.name.localeCompare(other.name));
  const effectiveSecurityId = visibleHoldings.some(
    (holding) => holding.id === securityId,
  )
    ? securityId
    : "";
  const securityOptions: readonly Option<string>[] = [
    { label: "All securities", value: "" },
    ...visibleHoldings.map((holding) => ({
      label: securityOptionLabel(holding),
      value: holding.id,
    })),
  ];

  const filtered = transactionsViewOf(transactions, {
    accountId: effectiveAccountId,
    securityId: effectiveSecurityId,
    type,
  });
  const hasActiveFilters =
    transactions.length > 0 &&
    (effectiveAccountId !== "" || effectiveSecurityId !== "" || type !== "");
  const isShowingClearButton = hasActiveFilters && filtered.length > 0;

  const filterKey = `${effectiveAccountId}\0${type}\0${effectiveSecurityId}`;
  const fullFilteredIds = filtered.map((entry) => `transaction:${entry.id}`);
  const handleEdit = transactionActionOf(
    onEditTransaction,
    isReadOnly,
    fullFilteredIds,
  );
  const handleDelete = transactionActionOf(
    onDeleteTransaction,
    isReadOnly,
    fullFilteredIds,
  );

  function clearFilters(): void {
    onAccountChange("");
    onTypeChange("");
    onSecurityChange("");
  }

  function handleShowingInactiveChange(isChecked: boolean): void {
    onShowingInactiveChange(isChecked);
    if (retiredAccountIds.has(accountId)) {
      onAccountChange("");
    }
    if (zeroShareSecurityIds.has(securityId)) {
      onSecurityChange("");
    }
  }

  return (
    <SectionCard
      actions={
        <Button
          aria-describedby={isReadOnly ? readOnlyId : undefined}
          disabled={isReadOnly}
          onClick={onAddTransaction}
          size="sm"
          variant="default"
        >
          <Plus aria-hidden />
          Add transaction
        </Button>
      }
      {...(transactions.length > 0 && {
        controls: (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0">
                <SelectField
                  groups={accountGroups}
                  label="Account"
                  onValueChange={onAccountChange}
                  options={[{ label: "All accounts", value: "" }]}
                  value={effectiveAccountId}
                />
              </div>
              <div className="min-w-0">
                <SelectField<"" | TransactionType>
                  groups={transactionTypeGroups}
                  label="Type"
                  onValueChange={onTypeChange}
                  options={[{ label: "All types", value: "" }]}
                  value={type}
                />
              </div>
              <div className="min-w-0">
                <SelectField
                  label="Security"
                  onValueChange={onSecurityChange}
                  options={securityOptions}
                  value={effectiveSecurityId}
                />
              </div>
            </div>
            {(hasInactiveOptions || isShowingClearButton) && (
              <div className="flex flex-wrap items-center gap-4">
                {hasInactiveOptions && (
                  <LabelledSwitch
                    icon={Eye}
                    isChecked={isShowingInactive}
                    onCheckedChange={handleShowingInactiveChange}
                  >
                    {inactiveToggleLabel(
                      hasRetiredAccounts,
                      hasZeroShareSecurities,
                    )}
                  </LabelledSwitch>
                )}
                {isShowingClearButton && (
                  <Button onClick={clearFilters} size="sm" variant="outline">
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>
        ),
      })}
      label={label}
      title="Transactions"
    >
      <TransactionsPages
        filtered={filtered}
        hasActiveFilters={hasActiveFilters}
        key={filterKey}
        onClearFilters={clearFilters}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />
    </SectionCard>
  );
}

function accountGroupsOf(
  securitiesAccounts: readonly SecuritiesAccount[],
  cashAccounts: readonly CashAccount[],
): readonly OptionGroup[] {
  return [
    ...(securitiesAccounts.length > 0
      ? [
          {
            label: "Securities accounts",
            options: securitiesAccounts.map((account) => ({
              label: accountOptionLabel(account),
              value: account.id,
            })),
          },
        ]
      : []),
    ...(cashAccounts.length > 0
      ? [
          {
            label: "Cash accounts",
            options: cashAccounts.map((account) => ({
              label: accountOptionLabel(account),
              value: account.id,
            })),
          },
        ]
      : []),
  ];
}

function accountOptionLabel(account: {
  readonly isRetired: boolean;
  readonly name: string;
}): string {
  return account.isRetired ? `${account.name} (retired)`.trim() : account.name;
}

function inactiveToggleLabel(
  hasRetiredAccounts: boolean,
  hasZeroShareSecurities: boolean,
): string {
  if (hasRetiredAccounts && hasZeroShareSecurities) {
    return "Show retired & zero-share in filters";
  }
  return hasRetiredAccounts
    ? "Show retired accounts in filters"
    : "Show zero-share securities in filters";
}

function isZeroShareOption(holding: { readonly shares: number }): boolean {
  return holding.shares <= 0;
}

function securityOptionLabel(holding: {
  readonly name: string;
  readonly shares: number;
}): string {
  return isZeroShareOption(holding)
    ? `${holding.name} (0 shares)`.trim()
    : holding.name;
}

function transactionActionOf(
  handler:
    | ((
        transaction: PortfolioTransaction,
        fallbackFocusIds: readonly string[],
      ) => void)
    | undefined,
  isReadOnly: boolean,
  fullFilteredIds: readonly string[],
): ((transaction: PortfolioTransaction) => void) | undefined {
  if (isReadOnly || handler === undefined) {
    return undefined;
  }
  return (transaction: PortfolioTransaction): void => {
    handler(
      transaction,
      neighboursOf(fullFilteredIds, `transaction:${transaction.id}`),
    );
  };
}

// Keyed on the active filter combination so pagination resets to 50
// rows whenever any filter changes or is cleared, without an effect.
function TransactionsPages({
  filtered,
  hasActiveFilters,
  onClearFilters,
  onDelete,
  onEdit,
}: {
  readonly filtered: readonly PortfolioTransaction[];
  readonly hasActiveFilters: boolean;
  readonly onClearFilters: () => void;
  readonly onDelete: ((transaction: PortfolioTransaction) => void) | undefined;
  readonly onEdit: ((transaction: PortfolioTransaction) => void) | undefined;
}): JSX.Element {
  const [limit, setLimit] = useState(pageSize);
  const shown = filtered.slice(0, limit);
  const hasMore = shown.length < filtered.length;

  return (
    <>
      {shown.length > 0 ? (
        <TransactionsTable
          onDelete={onDelete}
          onEdit={onEdit}
          transactions={shown}
        />
      ) : (
        <CardContent>
          <EmptyState
            description={
              hasActiveFilters
                ? "Try clearing one or more filters to view other entries."
                : "Add a transaction to record activity in this file."
            }
            icon={ArrowLeftRight}
            title={
              hasActiveFilters
                ? "No transactions match these filters"
                : "No transactions in this file"
            }
          >
            {hasActiveFilters && (
              <Button onClick={onClearFilters} size="sm" variant="outline">
                Clear filters
              </Button>
            )}
          </EmptyState>
        </CardContent>
      )}
      {filtered.length > 0 && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="figure">
            {hasMore
              ? `Showing 1–${String(shown.length)} of ${String(filtered.length)}`
              : counted(filtered.length, "transaction")}
          </span>
          {hasMore && (
            <Button
              onClick={() => {
                setLimit((current) => current + pageSize);
              }}
              size="sm"
              variant="outline"
            >
              Show 50 more
            </Button>
          )}
        </CardFooter>
      )}
    </>
  );
}
