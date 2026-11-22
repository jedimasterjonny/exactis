"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { Archive, Plus, Wallet } from "lucide-react";
import { useId, useState } from "react";

import type {
  AccountReference,
  CashAccount,
  SecuritiesAccount,
} from "@/data/portfolio";

import { Ledger } from "@/components/app/atoms/ledger";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { FoldedLines } from "@/components/app/molecules/folded-lines";
import { LabelledSwitch } from "@/components/app/molecules/labelled-switch";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { accountsLayoutOf } from "@/data/portfolio";
import { counted } from "@/lib/count";
import { formatCurrency } from "@/lib/money";

interface PortfolioAccountsProps {
  readonly cashAccounts: readonly CashAccount[];
  readonly isReadOnly?: boolean;
  readonly label: string;
  readonly onAddCash: () => void;
  readonly onAddSecurities: () => void;
  readonly onOpenSecurities?: (portfolioId: string) => void;
  readonly readOnlyId?: string | undefined;
  readonly securitiesAccounts: readonly SecuritiesAccount[];
}

// The Portfolio screen's paired accounts sheet, mirroring BalanceSheet:
// each securities account drawn level with its reference cash account
// across a 56rem container fold (or stacked beneath it on narrow
// widths), followed by standalone cash accounts and a reconciling
// sterling ledger. Shared reference cash accounts show their balance
// once on the first securities account that names them and "—" on
// subsequent rows so subtotals visibly add up.
export function PortfolioAccounts({
  cashAccounts,
  isReadOnly = false,
  label,
  onAddCash,
  onAddSecurities,
  onOpenSecurities,
  readOnlyId,
  securitiesAccounts,
}: PortfolioAccountsProps): JSX.Element {
  const [isShowingRetired, setIsShowingRetired] = useState(false);
  const securitiesHeadingId = useId();
  const standaloneHeadingId = useId();

  const {
    hasRetired,
    investedTotal,
    pairs,
    refCashExcluded,
    refCashTotal,
    standaloneCash,
    standaloneCashExcluded,
    standaloneCashTotal,
    total,
  } = accountsLayoutOf(securitiesAccounts, cashAccounts, isShowingRetired);

  const isEmptyFile =
    securitiesAccounts.length === 0 && cashAccounts.length === 0;
  const isAllHidden = pairs.length === 0 && standaloneCash.length === 0;

  return (
    <SectionCard
      actions={
        <>
          <Button
            aria-describedby={isReadOnly ? readOnlyId : undefined}
            disabled={isReadOnly}
            onClick={onAddSecurities}
            size="sm"
            variant="outline"
          >
            <Plus aria-hidden />
            Add securities account
          </Button>
          <Button
            aria-describedby={isReadOnly ? readOnlyId : undefined}
            disabled={isReadOnly}
            onClick={onAddCash}
            size="sm"
            variant="outline"
          >
            <Plus aria-hidden />
            Add cash account
          </Button>
        </>
      }
      caption="Each securities account paired with its reference cash account"
      {...(hasRetired && {
        controls: (
          <LabelledSwitch
            className="justify-self-start"
            icon={Archive}
            isChecked={isShowingRetired}
            onCheckedChange={setIsShowingRetired}
          >
            Show retired accounts
          </LabelledSwitch>
        ),
      })}
      label={label}
      title="Accounts"
    >
      <CardContent>
        {isEmptyFile && (
          <EmptyState
            description="Add a securities or cash account to preview how it appears here."
            icon={Wallet}
            title="No accounts in this file"
          />
        )}
        {!isEmptyFile && isAllHidden && (
          <EmptyState
            description="Turn on Show retired accounts to inspect them."
            icon={Wallet}
            title="All accounts in this file are retired"
          />
        )}
        {!isEmptyFile && !isAllHidden && (
          <div className="@container">
            <div className="grid gap-y-8">
              <div
                aria-labelledby={securitiesHeadingId}
                className="grid content-start"
                role="group"
              >
                <div className="grid unfolded:grid-cols-2 unfolded:gap-x-12">
                  <Heading
                    figure={formatCurrency(investedTotal, "GBP")}
                    id={securitiesHeadingId}
                  >
                    Securities accounts
                  </Heading>
                  <Heading
                    className="folded:hidden"
                    figure={formatCurrency(refCashTotal, "GBP")}
                  >
                    Reference cash account
                  </Heading>
                </div>
                <ul className="divide-y">
                  {pairs.length === 0 && <None>No securities accounts</None>}
                  {pairs.map(({ reference, securities }) => (
                    <li
                      className="grid unfolded:grid-cols-2 unfolded:gap-x-12"
                      key={securities.id}
                    >
                      <div className="relative py-3">
                        <FoldedLines
                          figure={formatCurrency(securities.marketValue, "GBP")}
                          name={securities.name}
                          onOpen={
                            !securities.isRetired &&
                            onOpenSecurities !== undefined
                              ? (): void => {
                                  onOpenSecurities(securities.id);
                                }
                              : undefined
                          }
                        >
                          <span>{securitiesDetail(securities)}</span>
                          <AccountFlags
                            isDraft={securities.isDraft === true}
                            isRetired={securities.isRetired}
                          />
                        </FoldedLines>
                      </div>
                      <div className="relative py-3 folded:pt-0 folded:pl-4">
                        <ReferenceLines reference={reference} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div aria-labelledby={standaloneHeadingId} role="group">
                <Heading
                  figure={formatCurrency(standaloneCashTotal, "GBP")}
                  id={standaloneHeadingId}
                >
                  Standalone cash accounts
                </Heading>
                <ul className="divide-y">
                  {standaloneCash.length === 0 && <None>None</None>}
                  {standaloneCash.map((account) => (
                    <li className="relative py-3" key={account.id}>
                      <FoldedLines
                        figure={formatCurrency(
                          account.balance,
                          account.currency,
                        )}
                        name={account.name}
                      >
                        <span>{cashDetail(account)}</span>
                        <AccountFlags
                          isDraft={account.isDraft === true}
                          isRetired={account.isRetired}
                        />
                      </FoldedLines>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t pt-4">
                <Ledger
                  steps={[
                    {
                      figure: formatCurrency(investedTotal, "GBP"),
                      label: "Invested in securities",
                    },
                    {
                      detail: excludedDetail(refCashExcluded),
                      figure: formatCurrency(refCashTotal, "GBP"),
                      label: "Cash in reference accounts",
                    },
                    ...(standaloneCash.length > 0
                      ? [
                          {
                            detail: excludedDetail(standaloneCashExcluded),
                            figure: formatCurrency(standaloneCashTotal, "GBP"),
                            label: "Standalone cash accounts",
                          },
                        ]
                      : []),
                  ]}
                  total={formatCurrency(total, "GBP")}
                  totalName="Total portfolio"
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </SectionCard>
  );
}

// Exception-only badges rendered beneath an account's subline when it
// is a browser-only preview or retired in Portfolio Performance.
function AccountFlags({
  isDraft,
  isRetired,
}: {
  readonly isDraft: boolean;
  readonly isRetired: boolean;
}): JSX.Element | null {
  if (!isDraft && !isRetired) {
    return null;
  }
  return (
    <span className="mt-0.5 flex flex-wrap gap-1.5">
      {isDraft && <Badge variant="caution">Preview</Badge>}
      {isRetired && <Badge variant="outline">Retired</Badge>}
    </span>
  );
}

// The muted detail line beneath a cash account: currency, transaction
// count, and optional note.
function cashDetail(account: CashAccount): string {
  return [
    account.currency,
    counted(account.transactionCount, "transaction"),
    account.note,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

// What the closing ledger says beneath a cash subtotal when one or more
// non-GBP accounts could not be converted into sterling.
function excludedDetail(currencies: readonly string[]): string | undefined {
  return currencies.length === 0
    ? undefined
    : `Excludes ${currencies.join(", ")} cash with no GBP exchange rate`;
}

// A group heading and its sterling subtotal, matching BalanceSheet.
function Heading({
  children,
  className,
  figure,
  id,
}: {
  readonly children: string;
  readonly className?: string;
  readonly figure: string;
  readonly id?: string;
}): JSX.Element {
  return (
    <h3
      className={cn(
        "flex items-baseline justify-between gap-4 border-b pb-2 label text-muted-foreground",
        className,
      )}
    >
      <span id={id}>{children}</span>
      <span className="figure">{figure}</span>
    </h3>
  );
}

// A muted placeholder row when a group holds no accounts.
function None({ children }: { readonly children: string }): JSX.Element {
  return <li className="py-3 text-sm text-muted-foreground">{children}</li>;
}

// The right-hand half of a paired securities row: its reference cash
// account on first appearance, a muted "—" reference when shared with
// an earlier row, or a plain note when unlinked.
function ReferenceLines({
  reference,
}: {
  readonly reference: AccountReference | null;
}): JSX.Element {
  if (reference === null) {
    return (
      <p className="text-sm text-muted-foreground">No reference cash account</p>
    );
  }
  if (reference.isShared) {
    return (
      <FoldedLines figure="—" isFigureMuted name={reference.account.name}>
        <span>Shared reference cash account</span>
      </FoldedLines>
    );
  }
  return (
    <FoldedLines
      figure={formatCurrency(
        reference.account.balance,
        reference.account.currency,
      )}
      name={reference.account.name}
    >
      <span>{cashDetail(reference.account)}</span>
      <AccountFlags
        isDraft={reference.account.isDraft === true}
        isRetired={reference.account.isRetired}
      />
    </FoldedLines>
  );
}

// The muted detail line beneath a securities account: holding count and
// optional note.
function securitiesDetail(account: SecuritiesAccount): string {
  return [counted(account.holdingsCount, "holding"), account.note]
    .filter((part) => part !== undefined)
    .join(" · ");
}
