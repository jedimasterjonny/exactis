import type { JSX } from "react";

import { cn } from "cn";

import type { PortfolioTransaction, TransactionType } from "@/data/portfolio";

import { FoldedCell } from "@/components/app/organisms/folded-cell";
import { Badge } from "@/components/kit/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import {
  transactionDirectionOf,
  transactionTypeLabels,
} from "@/data/portfolio";
import {
  formatCurrency,
  formatShares,
  formatSignedCurrency,
} from "@/lib/money";
import { formatDay } from "@/lib/months";

interface TransactionsTableProps {
  readonly transactions: readonly PortfolioTransaction[];
}

// Directional prefix before fee/tax breakdown for every PP transaction type.
const costPrefixes: Record<TransactionType, "" | "after " | "incl. "> = {
  "cash-transfer": "",
  deposit: "",
  dividend: "after ",
  fee: "",
  "fee-refund": "",
  "inbound-delivery": "incl. ",
  interest: "",
  "interest-charge": "",
  "outbound-delivery": "after ",
  purchase: "incl. ",
  removal: "",
  sale: "after ",
  "security-transfer": "",
  tax: "",
  "tax-refund": "",
};

// The Portfolio screen's transactions table: newest-first rows folding
// below 56rem into FoldedCell so mobile screens read type, security,
// signed amount, date, accounts, share count, fee/tax breakdown and
// notes without sideways scroll. Badges appear strictly for browser
// Preview drafts; cash inflows carry the calm positive tone.
export function TransactionsTable({
  transactions,
}: TransactionsTableProps): JSX.Element {
  return (
    <Table>
      <TableHeader className="folded:hidden">
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Security</TableHead>
          <TableHead className="text-right">Shares</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => {
          const dateText = formatDay(transaction.date);
          const typeLabel = transactionTypeLabels[transaction.type];
          const accountText = accountLabelOf(transaction);
          const direction = transactionDirectionOf(transaction.type);
          const amountText = formatSignedCurrency(
            transaction.amount,
            transaction.currency,
            direction,
          );
          const isPositive = direction === "in" && transaction.amount > 0;
          const isMutedAmount = transaction.amount === 0;
          const costsText = costsLabelOf(transaction);
          const foldedName =
            transaction.securityName === undefined
              ? typeLabel
              : `${typeLabel} · ${transaction.securityName}`;
          const shareCount =
            transaction.shares === 1
              ? "1 share"
              : `${formatShares(transaction.shares)} shares`;

          return (
            <TableRow key={transaction.id}>
              <FoldedCell
                figure={amountText}
                isFigureMuted={isMutedAmount}
                name={foldedName}
              >
                <span>{`${dateText} · ${accountText}`}</span>
                {transaction.shares > 0 && <span>{shareCount}</span>}
                {costsText !== "" && <span>{costsText}</span>}
                {transaction.note !== undefined && (
                  <span>{transaction.note}</span>
                )}
                {transaction.isDraft === true && (
                  <span className="text-caution">Preview</span>
                )}
              </FoldedCell>
              <TableCell className="figure whitespace-nowrap folded:hidden">
                {dateText}
              </TableCell>
              <TableCell className="whitespace-nowrap folded:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{typeLabel}</span>
                  {transaction.isDraft === true && (
                    <Badge variant="caution">Preview</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell
                className={cn(
                  "whitespace-normal folded:hidden",
                  accountText === "—" && "text-muted-foreground",
                )}
              >
                {accountText}
              </TableCell>
              <TableCell className="whitespace-normal folded:hidden">
                <div
                  className={cn(
                    transaction.securityName === undefined &&
                      "text-muted-foreground",
                  )}
                >
                  {transaction.securityName ?? "—"}
                </div>
                {transaction.note !== undefined && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {transaction.note}
                  </p>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right figure folded:hidden",
                  transaction.shares === 0 && "text-muted-foreground",
                )}
              >
                {transaction.shares > 0
                  ? formatShares(transaction.shares)
                  : "—"}
              </TableCell>
              <TableCell className="text-right folded:hidden">
                <div
                  className={cn(
                    "figure font-medium",
                    isPositive && "text-positive",
                    isMutedAmount && "text-muted-foreground",
                  )}
                >
                  {amountText}
                </div>
                {costsText !== "" && (
                  <div className="mt-0.5 figure text-xs text-muted-foreground">
                    {costsText}
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// How a transaction names its account(s): trades join securities and cash
// with a middle dot, transfers draw an arrow from source to destination,
// and unlinked entries render an em-dash.
function accountLabelOf(transaction: PortfolioTransaction): string {
  if (transaction.type === "cash-transfer") {
    return transferLabel(transaction.accountName, transaction.otherAccountName);
  }
  if (transaction.type === "security-transfer") {
    return transferLabel(
      transaction.portfolioName,
      transaction.otherPortfolioName,
    );
  }
  const parts = [transaction.portfolioName, transaction.accountName].filter(
    (name) => name !== undefined,
  );
  return parts.length === 0 ? "—" : parts.join(" · ");
}

// Optional muted cost summary beneath an amount when fees or taxes apply,
// stating directionally whether the figure includes costs, is net after
// costs, or carries neutral cost detail.
function costsLabelOf(transaction: PortfolioTransaction): string {
  const parts = [
    ...(transaction.fees > 0
      ? [`${formatCurrency(transaction.fees, transaction.currency)} fee`]
      : []),
    ...(transaction.taxes > 0
      ? [`${formatCurrency(transaction.taxes, transaction.currency)} tax`]
      : []),
  ];
  return parts.length === 0
    ? ""
    : `${costPrefixes[transaction.type]}${parts.join(" · ")}`;
}

function transferLabel(
  from: string | undefined,
  to: string | undefined,
): string {
  const parts = [from, to].filter((name) => name !== undefined);
  return parts.length === 0 ? "—" : parts.join(" → ");
}
