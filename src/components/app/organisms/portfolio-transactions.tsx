"use client";

import type { JSX } from "react";

import { ArrowLeftRight, Plus } from "lucide-react";
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
import { SelectField } from "@/components/app/molecules/select-field";
import { SectionCard } from "@/components/app/organisms/section-card";
import { TransactionsTable } from "@/components/app/organisms/transactions-table";
import { Button } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { transactionsViewOf, transactionTypeGroups } from "@/data/portfolio";
import { counted } from "@/lib/count";

interface PortfolioTransactionsProps {
  readonly accountId: string;
  readonly cashAccounts: readonly CashAccount[];
  readonly holdings: readonly Holding[];
  readonly isReadOnly?: boolean;
  readonly label: string;
  readonly onAccountChange: (accountId: string) => void;
  readonly onAddTransaction: () => void;
  readonly onSecurityChange: (securityId: string) => void;
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
// select), TransactionsTable paginated 50 rows at a time without
// effect-derived state, an outline Add transaction action, and a footer
// reporting how many rows are shown with a "Show 50 more" trigger.
export function PortfolioTransactions({
  accountId,
  cashAccounts,
  holdings,
  isReadOnly = false,
  label,
  onAccountChange,
  onAddTransaction,
  onSecurityChange,
  onTypeChange,
  readOnlyId,
  securitiesAccounts,
  securityId,
  transactions,
  type,
}: PortfolioTransactionsProps): JSX.Element {
  const accountGroups: readonly OptionGroup[] = [
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
  const validAccountIds = new Set([
    ...securitiesAccounts.map((account) => account.id),
    ...cashAccounts.map((account) => account.id),
  ]);
  const effectiveAccountId = validAccountIds.has(accountId) ? accountId : "";

  const sortedHoldings = holdings.toSorted((one, other) =>
    one.name.localeCompare(other.name),
  );
  const effectiveSecurityId = sortedHoldings.some(
    (holding) => holding.id === securityId,
  )
    ? securityId
    : "";
  const securityOptions: readonly Option<string>[] = [
    { label: "All securities", value: "" },
    ...sortedHoldings.map((holding) => ({
      label: holding.name,
      value: holding.id,
    })),
  ];

  const filtered = transactionsViewOf(transactions, {
    accountId: effectiveAccountId,
    securityId: effectiveSecurityId,
    type,
  });
  const hasActiveFilters =
    effectiveAccountId !== "" || effectiveSecurityId !== "" || type !== "";

  const filterKey = `${effectiveAccountId}\0${type}\0${effectiveSecurityId}`;

  function clearFilters(): void {
    onAccountChange("");
    onTypeChange("");
    onSecurityChange("");
  }

  return (
    <SectionCard
      actions={
        <Button
          aria-describedby={isReadOnly ? readOnlyId : undefined}
          disabled={isReadOnly}
          onClick={onAddTransaction}
          size="sm"
          variant="outline"
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
            {hasActiveFilters && filtered.length > 0 && (
              <div>
                <Button onClick={clearFilters} size="sm" variant="outline">
                  Clear filters
                </Button>
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
      />
    </SectionCard>
  );
}

function accountOptionLabel(account: {
  readonly isRetired: boolean;
  readonly name: string;
}): string {
  return account.isRetired ? `${account.name} (retired)` : account.name;
}

// Keyed on the active filter combination so pagination resets to 50
// rows whenever any filter changes or is cleared, without an effect.
function TransactionsPages({
  filtered,
  hasActiveFilters,
  onClearFilters,
}: {
  readonly filtered: readonly PortfolioTransaction[];
  readonly hasActiveFilters: boolean;
  readonly onClearFilters: () => void;
}): JSX.Element {
  const [limit, setLimit] = useState(pageSize);
  const shown = filtered.slice(0, limit);
  const hasMore = shown.length < filtered.length;

  return (
    <>
      {shown.length > 0 ? (
        <TransactionsTable transactions={shown} />
      ) : (
        <CardContent>
          <EmptyState
            description={
              hasActiveFilters
                ? "Try clearing one or more filters to view other entries."
                : "Add a transaction to preview how it appears here."
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
