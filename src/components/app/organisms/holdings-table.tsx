import type { JSX } from "react";

import { cn } from "cn";

import type { HoldingRow } from "@/data/portfolio";

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
  formatCurrency,
  formatPercent,
  formatPrice,
  formatShares,
} from "@/lib/money";
import { formatDay } from "@/lib/months";

interface HoldingsTableProps {
  readonly rows: readonly HoldingRow[];
}

// The Portfolio screen's holdings table: one row per security, folding
// below 56rem into FoldedCell so mobile screens read name, sterling
// value, share count, quote price, weight and metadata without sideways
// scroll. Caution badges stay strictly on exceptions (Unpriced, No FX
// rate), retired securities carry an outline Retired badge, and ISIN,
// ticker, Asset Allocation category, multi-account count and notes sit
// calmly in the muted subline.
export function HoldingsTable({ rows }: HoldingsTableProps): JSX.Element {
  return (
    <Table>
      <TableHeader className="folded:hidden">
        <TableRow>
          <TableHead>Security</TableHead>
          <TableHead className="text-right">Shares</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Share</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { accountCount, holding, marketValueGbp, share, shares } = row;
          const priceText =
            holding.latestPrice === null
              ? "—"
              : formatPrice(holding.latestPrice, holding.currency);
          const valueText =
            marketValueGbp === null
              ? "—"
              : formatCurrency(marketValueGbp, "GBP");
          const shareText = formatPercent(share);
          const isMutedValue = marketValueGbp === null || shares === 0;
          const metaLine = metaOf(row, accountCount);
          const flags = flagsOf(row);
          const shareCount =
            shares === 1 ? "1 share" : `${formatShares(shares)} shares`;
          const summaryLine =
            holding.latestPrice === null
              ? shareCount
              : `${shareCount} @ ${priceText} · ${shareText}`;

          return (
            <TableRow key={holding.id}>
              <FoldedCell
                figure={valueText}
                isFigureMuted={isMutedValue}
                name={holding.name}
              >
                <span>{summaryLine}</span>
                {metaLine !== "" && <span>{metaLine}</span>}
                {flags.length > 0 && (
                  <span className="text-caution">{flags.join(" · ")}</span>
                )}
                {holding.isRetired && <span>Retired</span>}
              </FoldedCell>
              <TableCell className="whitespace-normal folded:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{holding.name}</span>
                  {flags.map((flag) => (
                    <Badge key={flag} variant="caution">
                      {flag}
                    </Badge>
                  ))}
                  {holding.isRetired && (
                    <Badge variant="outline">Retired</Badge>
                  )}
                </div>
                {metaLine !== "" && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {metaLine}
                  </p>
                )}
              </TableCell>
              <TableCell className="text-right figure folded:hidden">
                {formatShares(shares)}
              </TableCell>
              <TableCell className="text-right folded:hidden">
                <div
                  className={cn(
                    "figure",
                    holding.latestPrice === null && "text-muted-foreground",
                  )}
                >
                  {priceText}
                </div>
                {holding.latestPrice !== null &&
                  holding.latestPriceDate !== null && (
                    <div className="mt-0.5 figure text-xs text-muted-foreground">
                      {formatDay(holding.latestPriceDate)}
                    </div>
                  )}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right figure font-medium folded:hidden",
                  isMutedValue && "text-muted-foreground",
                )}
              >
                {valueText}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right figure folded:hidden",
                  share === 0 && "text-muted-foreground",
                )}
              >
                {shareText}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// Exception-only flags for a holding row.
function flagsOf({ status }: HoldingRow): readonly string[] {
  return [
    ...(status === "unpriced" ? ["Unpriced"] : []),
    ...(status === "no-fx" ? ["No FX rate"] : []),
  ];
}

// The muted subline beneath a security name joining available metadata.
function metaOf({ holding }: HoldingRow, accountCount: number): string {
  return [
    holding.isin,
    holding.ticker,
    holding.category,
    accountCount > 1 ? `Across ${String(accountCount)} accounts` : undefined,
    holding.note,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
