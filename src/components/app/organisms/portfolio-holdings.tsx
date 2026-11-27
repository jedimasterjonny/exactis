"use client";

import type { JSX } from "react";

import { Eye, Layers, Plus, RefreshCw } from "lucide-react";

import type { Holding, SecuritiesAccount } from "@/data/portfolio";
import type { Option } from "@/lib/options";

import { EmptyState } from "@/components/app/molecules/empty-state";
import { LabelledSwitch } from "@/components/app/molecules/labelled-switch";
import { SelectField } from "@/components/app/molecules/select-field";
import { HoldingsTable } from "@/components/app/organisms/holdings-table";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Button } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { holdingsViewOf, neighboursOf } from "@/data/portfolio";
import { formatCurrency } from "@/lib/money";

interface PortfolioHoldingsProps {
  readonly accountId: string;
  readonly holdings: readonly Holding[];
  readonly isReadOnly?: boolean;
  readonly isShowingZeroShares: boolean;
  readonly label: string;
  readonly onAccountChange: (accountId: string) => void;
  readonly onAddSecurity: () => void;
  readonly onDeleteSecurity?: (
    holding: Holding,
    fallbackFocusIds: readonly string[],
  ) => void;
  readonly onEditSecurity?: (
    holding: Holding,
    fallbackFocusIds: readonly string[],
  ) => void;
  readonly onShowingZeroSharesChange: (isShowing: boolean) => void;
  readonly onUpdateQuotes: () => void;
  readonly readOnlyId?: string | undefined;
  readonly securitiesAccounts: readonly SecuritiesAccount[];
}

// The Portfolio screen's Holdings tab: a controlled Account filter
// keyed by portfolio UUID, an optional zero-share switch whenever any
// zero-share security exists under the current filter, HoldingsTable
// (or a contextual EmptyState), an outline Add security action beside a
// primary Update quotes CTA whenever the file holds at least one
// security, and a footer stating the filtered account subtotal and FX
// rate note when applicable.
export function PortfolioHoldings({
  accountId,
  holdings,
  isReadOnly = false,
  isShowingZeroShares,
  label,
  onAccountChange,
  onAddSecurity,
  onDeleteSecurity,
  onEditSecurity,
  onShowingZeroSharesChange,
  onUpdateQuotes,
  readOnlyId,
  securitiesAccounts,
}: PortfolioHoldingsProps): JSX.Element {
  const activeAccounts = securitiesAccounts.filter(
    (account) => !account.isRetired,
  );
  const selectedAccount = activeAccounts.find(
    (account) => account.id === accountId,
  );
  const effectiveAccountId =
    selectedAccount === undefined ? "" : selectedAccount.id;
  const accountOptions: readonly Option<string>[] = [
    { label: "All securities accounts", value: "" },
    ...activeAccounts.map((account) => ({
      label: account.name,
      value: account.id,
    })),
  ];

  const { hasForeignPrices, hasZeroShare, rows, totalGbp } = holdingsViewOf(
    holdings,
    { accountId: effectiveAccountId, isShowingZeroShares },
  );
  const visibleRowIds = rows.map((row) => `holding:${row.holding.id}`);
  const hasControls = activeAccounts.length > 0 || hasZeroShare;
  const isShowingSubtotal = selectedAccount !== undefined && rows.length > 0;
  const hasFooter = isShowingSubtotal || hasForeignPrices;

  return (
    <SectionCard
      actions={
        <>
          <Button
            aria-describedby={isReadOnly ? readOnlyId : undefined}
            disabled={isReadOnly}
            onClick={onAddSecurity}
            size="sm"
            variant="outline"
          >
            <Plus aria-hidden />
            Add security
          </Button>
          {holdings.length > 0 && (
            <Button
              aria-describedby={isReadOnly ? readOnlyId : undefined}
              disabled={isReadOnly}
              onClick={onUpdateQuotes}
              size="sm"
              variant="default"
            >
              <RefreshCw aria-hidden />
              Update quotes
            </Button>
          )}
        </>
      }
      {...(hasControls && {
        controls: (
          <div className="flex flex-wrap items-end gap-4">
            {activeAccounts.length > 0 && (
              <div className="min-w-48 flex-1 sm:max-w-72">
                <SelectField
                  label="Account"
                  onValueChange={onAccountChange}
                  options={accountOptions}
                  value={effectiveAccountId}
                />
              </div>
            )}
            {hasZeroShare && (
              <LabelledSwitch
                icon={Eye}
                isChecked={isShowingZeroShares}
                onCheckedChange={(isChecked) => {
                  onShowingZeroSharesChange(isChecked);
                }}
              >
                Show zero-share securities
              </LabelledSwitch>
            )}
          </div>
        ),
      })}
      label={label}
      title="Holdings"
    >
      {rows.length > 0 ? (
        <HoldingsTable
          onDelete={
            isReadOnly || onDeleteSecurity === undefined
              ? undefined
              : (holding): void => {
                  onDeleteSecurity(
                    holding,
                    neighboursOf(visibleRowIds, `holding:${holding.id}`),
                  );
                }
          }
          onEdit={
            isReadOnly || onEditSecurity === undefined
              ? undefined
              : (holding): void => {
                  onEditSecurity(
                    holding,
                    neighboursOf(visibleRowIds, `holding:${holding.id}`),
                  );
                }
          }
          rows={rows}
        />
      ) : (
        <CardContent>
          <HoldingsEmpty
            hasZeroShare={hasZeroShare}
            onClearFilter={() => {
              onAccountChange("");
            }}
            selectedAccountName={selectedAccount?.name}
          />
        </CardContent>
      )}
      {hasFooter && (
        <CardFooter className="flex-col items-start gap-1 text-sm text-muted-foreground">
          {isShowingSubtotal && (
            <p className="flex w-full items-baseline justify-between gap-4">
              <span>{`${selectedAccount.name} subtotal`}</span>
              <span className="figure font-medium text-foreground">
                {formatCurrency(totalGbp, "GBP")}
              </span>
            </p>
          )}
          {hasForeignPrices && (
            <p>
              Prices in other currencies use the latest GBP transaction rate, as
              Portfolio Performance stores no live FX feed.
            </p>
          )}
        </CardFooter>
      )}
    </SectionCard>
  );
}

// Contextual empty state for the Holdings card when no rows match.
function HoldingsEmpty({
  hasZeroShare,
  onClearFilter,
  selectedAccountName,
}: {
  readonly hasZeroShare: boolean;
  readonly onClearFilter: () => void;
  readonly selectedAccountName: string | undefined;
}): JSX.Element {
  if (selectedAccountName !== undefined) {
    return (
      <EmptyState
        description={`${selectedAccountName} has no matching holdings.`}
        icon={Layers}
        title="No holdings in this account"
      >
        <Button onClick={onClearFilter} size="sm" variant="outline">
          Clear filter
        </Button>
      </EmptyState>
    );
  }
  if (hasZeroShare) {
    return (
      <EmptyState
        description="Turn on Show zero-share securities to inspect securities with zero shares."
        icon={Layers}
        title="No active holdings"
      />
    );
  }
  return (
    <EmptyState
      description="Add a security to start building the catalogue."
      icon={Layers}
      title="No securities in this file"
    />
  );
}
