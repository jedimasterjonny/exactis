import type { JSX } from "react";

import { House } from "lucide-react";

import type { Account } from "@/data/accounts";
import type { Secured } from "@/data/secured";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { RowActions } from "@/components/app/molecules/row-actions";
import { Badge } from "@/components/kit/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { kindLabels } from "@/data/accounts";
import {
  equityOf,
  fixedMonthly,
  formatGrowth,
  formatMonthly,
} from "@/lib/ledger";
import { formatGbp } from "@/lib/money";

interface AssetTableProps {
  readonly assets: readonly Secured[];
  readonly onDelete: (asset: Account) => void;
  readonly onEdit: (asset: Account) => void;
}

// The assets, each on one row with the loan secured on it, since the two
// are one thing: the store links them, the house and car dialogs edit
// them together, and what the pair is worth is neither figure alone but
// the equity between them. The row reads across from what the asset is
// worth, through what is owed against it and paid off it, to the equity,
// which carries the weight as the balance does in the account table,
// over a bar of the value it is. Each rate is written beneath the figure
// it moves, the asset's growth under its value and the loan's under what
// it owes, rather than in a column of its own, and the loan's may wrap,
// so the row fits a laptop's width with the equity in view. An asset owned outright owes nothing and is all
// equity. The pencil and the bin report the asset, and the caller opens
// or deletes the pair from it. Beneath two rows or more it totals each
// figure, a row alone being its own total. A table of no assets draws
// its empty state instead.
export function AssetTable({
  assets,
  onDelete,
  onEdit,
}: AssetTableProps): JSX.Element {
  if (assets.length === 0) {
    return (
      <EmptyState
        description="A house, a car, anything owned outright. Add one to see it listed here."
        icon={House}
        title="No assets yet"
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Secured loan</TableHead>
          <TableHead className="text-right">Payment</TableHead>
          <TableHead className="text-right">Equity</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((pair) => {
          const { asset, loan } = pair;
          const equity = equityOf(pair);
          return (
            <TableRow key={asset.id}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{asset.name}</span>
                  <Badge variant="secondary">{kindLabels[asset.kind]}</Badge>
                </span>
              </TableCell>
              <TableCell className="text-right figure">
                {formatGbp(asset.balance)}
                <span className="block text-xs text-muted-foreground">
                  {`grows at ${formatGrowth(asset.growth)}`}
                </span>
              </TableCell>
              <TableCell className="text-right figure">
                {loan === null ? (
                  "—"
                ) : (
                  <>
                    {formatGbp(loan.balance)}
                    <span className="block text-xs whitespace-normal text-muted-foreground">
                      {`${loan.name} at ${formatGrowth(loan.growth)}`}
                    </span>
                  </>
                )}
              </TableCell>
              <TableCell className="text-right figure">
                {paymentOf(pair)}
              </TableCell>
              <TableCell className="text-right figure font-medium">
                {formatGbp(equity)}
                <EquityBar share={equity / asset.balance} />
              </TableCell>
              <TableCell className="py-1">
                <RowActions
                  name={asset.name}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  row={asset}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      {assets.length > 1 && (
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell className="text-right figure">
              {formatGbp(totalOf(assets, ({ asset }) => asset.balance))}
            </TableCell>
            <TableCell className="text-right figure">
              {formatGbp(totalOf(assets, ({ loan }) => loan?.balance ?? 0))}
            </TableCell>
            <TableCell className="text-right figure">
              {formatMonthly(totalOf(assets, paidTowards))}
            </TableCell>
            <TableCell className="text-right figure">
              {formatGbp(totalOf(assets, equityOf))}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

// The share of the value the equity is, as a bar beneath its figure:
// drawn, since the figure beside it says the amount, and hidden from the
// accessibility tree for the same reason. A loan above the value leaves
// no equity to draw, and a value of nothing no share of it.
function EquityBar({ share }: { readonly share: number }): JSX.Element {
  const held = Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0;
  return (
    <span
      aria-hidden
      className="mt-1.5 ml-auto block h-1 w-16 overflow-hidden rounded-full bg-muted"
      data-slot="equity-bar"
    >
      <span
        className="block h-full rounded-full bg-positive"
        data-slot="equity-bar-fill"
        style={{ width: `${String(held * 100)}%` }}
      />
    </span>
  );
}

// What is paid towards the asset a month: the loan's payments, and the
// asset's own fixed sum with them when it takes one, which only an asset
// the account dialog writes may. Neither is paid the spare money, so
// each is a fixed sum or nothing, and both a month's, so they add up.
function paidTowards({ asset, loan }: Secured): number {
  return fixedMonthly(asset) + (loan === null ? 0 : fixedMonthly(loan));
}

// The payment as its cell writes it, a flat dash when nothing is paid.
function paymentOf(pair: Secured): string {
  const isPaid = [pair.asset, pair.loan].some(
    (account) => account?.contribution !== undefined,
  );
  return isPaid ? formatMonthly(paidTowards(pair)) : "—";
}

// A figure summed down the rows, for the totals beneath them.
function totalOf(
  assets: readonly Secured[],
  figure: (pair: Secured) => number,
): number {
  return assets.reduce((sum, pair) => sum + figure(pair), 0);
}
