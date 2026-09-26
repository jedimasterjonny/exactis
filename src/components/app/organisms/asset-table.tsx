import type { JSX } from "react";

import { cn } from "cn";
import { House } from "lucide-react";

import type { Account } from "@/data/accounts";
import type { Secured } from "@/data/secured";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { FoldedCell } from "@/components/app/molecules/folded-cell";
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
import { fixedMonthly } from "@/lib/cadence";
import { equityOf, formatGrowth, formatMonthly } from "@/lib/ledger";
import { formatGbp } from "@/lib/money";

interface AssetTableProps {
  readonly assets: readonly Secured[];
  readonly onDelete: (asset: Account) => void;
  readonly onEdit: (asset: Account) => void;
}

// What a row says of an asset and the loan on it, in both the columns
// and the folded lines: see describe.
interface Row {
  readonly equity: string;
  readonly growth: string;
  readonly kind: string;
  readonly loan?: {
    readonly balance: string;
    readonly owed: string;
    readonly said: string;
  };
  readonly paid?: string;
  readonly share: number;
  readonly value: string;
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
// its empty state instead. While the table is too narrow to read
// across, as on a phone, each row folds into one cell: the name and the
// equity on its first line, the bar beneath it drawn the whole width of
// the row, where on a laptop it is a stub under the figure, then what
// the asset is worth, what is owed on it and what is paid, a line
// apiece. The row opens from anywhere on it, and the header and the
// actions go with the other columns, the dialog it opens being where a
// folded row is deleted from. The totals fold the same way. Each row is
// described once and both its copies draw the description, and the
// totals are worked out once, so the columns and the folded lines say
// the same thing from the same figures.
export function AssetTable({
  assets,
  onDelete,
  onEdit,
}: AssetTableProps): JSX.Element {
  const totals = totalsOf(assets);

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
      <TableHeader className="folded:hidden">
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Secured loan</TableHead>
          <TableHead className="text-right">Payment</TableHead>
          <TableHead className="text-right">Equity</TableHead>
          <TableHead className="w-px">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((pair) => {
          const { asset } = pair;
          const row = describe(pair);
          return (
            <TableRow key={asset.id}>
              <FoldedCell
                figure={row.equity}
                name={asset.name}
                onOpen={() => {
                  onEdit(asset);
                }}
              >
                <EquityBar className="my-1 h-1.5 w-full" share={row.share} />
                <span>
                  {`${row.kind} · ${row.value} value · grows at ${row.growth}`}
                </span>
                {row.loan !== undefined && (
                  <span>{`${row.loan.owed} owed on ${row.loan.said}`}</span>
                )}
                {row.paid !== undefined && <span>{`${row.paid} paid`}</span>}
              </FoldedCell>
              <TableCell className="folded:hidden">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{asset.name}</span>
                  <Badge variant="secondary">{row.kind}</Badge>
                </span>
              </TableCell>
              <TableCell className="text-right figure folded:hidden">
                {row.value}
                <span className="block text-xs text-muted-foreground">
                  {`grows at ${row.growth}`}
                </span>
              </TableCell>
              <TableCell className="text-right figure folded:hidden">
                {row.loan === undefined ? (
                  "—"
                ) : (
                  <>
                    {row.loan.balance}
                    <span className="block text-xs whitespace-normal text-muted-foreground">
                      {row.loan.said}
                    </span>
                  </>
                )}
              </TableCell>
              <TableCell className="text-right figure folded:hidden">
                {row.paid ?? "—"}
              </TableCell>
              <TableCell className="text-right figure font-medium folded:hidden">
                {row.equity}
                <EquityBar share={row.share} />
              </TableCell>
              <TableCell className="py-1 folded:hidden">
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
            <FoldedCell figure={totals.equity} name="Total">
              <span>{`${totals.value} value · ${totals.owed} owed`}</span>
              <span>{`${totals.paid} paid`}</span>
            </FoldedCell>
            <TableCell className="folded:hidden">Total</TableCell>
            <TableCell className="text-right figure folded:hidden">
              {totals.value}
            </TableCell>
            <TableCell className="text-right figure folded:hidden">
              {totals.loans}
            </TableCell>
            <TableCell className="text-right figure folded:hidden">
              {totals.paid}
            </TableCell>
            <TableCell className="text-right figure folded:hidden">
              {totals.equity}
            </TableCell>
            <TableCell className="folded:hidden" />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

// What a row says of an asset and the loan on it, worked out once and
// drawn twice: in the columns while the table reads across, and on the
// folded lines while it does not. The loan's balance is what its column
// writes, below nothing, and what is owed is what the folded lines
// write, the same figure above it; what is paid is left out for an asset
// nothing is paid towards, which its column marks with a dash.
function describe(pair: Secured): Row {
  const { asset, loan } = pair;
  const equity = equityOf(pair);
  return {
    equity: formatGbp(equity),
    growth: formatGrowth(asset.growth),
    kind: kindLabels[asset.kind],
    ...(loan !== null && {
      loan: {
        balance: formatGbp(loan.balance),
        owed: owedOf(loan.balance),
        said: `${loan.name} at ${formatGrowth(loan.growth)}`,
      },
    }),
    ...(isPaid(pair) && { paid: formatMonthly(paidTowards(pair)) }),
    share: equity / asset.balance,
    value: formatGbp(asset.balance),
  };
}

// The share of the value the equity is, as a bar beneath its figure:
// drawn, since the figure beside it says the amount, and hidden from the
// accessibility tree for the same reason. A loan above the value leaves
// no equity to draw, and a value of nothing no share of it. The class is
// the folded row's, which draws the bar the width of the row.
function EquityBar({
  className,
  share,
}: {
  readonly className?: string;
  readonly share: number;
}): JSX.Element {
  const held = Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0;
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 ml-auto block h-1 w-16 overflow-hidden rounded-full bg-muted",
        className,
      )}
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

// Whether anything is paid towards the asset, by the loan or of its own.
function isPaid(pair: Secured): boolean {
  return [pair.asset, pair.loan].some(
    (account) => account?.contribution !== undefined,
  );
}

// What is owed on a loan whose balance is the one given, above nothing,
// taken from nothing rather than negated: a balance of nothing negated
// is minus nothing, which Intl writes with its minus, "−£0 owed".
function owedOf(balance: number): string {
  return formatGbp(0 - balance);
}

// What is owed on the asset, as the loan's balance, which is nothing
// for an asset with no loan.
function owedOn({ loan }: Secured): number {
  return loan?.balance ?? 0;
}

// What is paid towards the asset a month: the loan's payments, and the
// asset's own fixed sum with them when it takes one, which only an asset
// the account dialog writes may. Neither is paid the spare money, so
// each is a fixed sum or nothing, and both a month's, so they add up.
function paidTowards({ asset, loan }: Secured): number {
  return fixedMonthly(asset) + (loan === null ? 0 : fixedMonthly(loan));
}

// A figure summed down the rows, for the totals beneath them.
function totalOf(
  assets: readonly Secured[],
  figure: (pair: Secured) => number,
): number {
  return assets.reduce((sum, pair) => sum + figure(pair), 0);
}

// The totals beneath the rows, each summed once: what the assets are
// worth, what is owed on them as the loans' column writes it and as the
// folded total does, what is paid towards them and the equity.
function totalsOf(assets: readonly Secured[]): {
  readonly equity: string;
  readonly loans: string;
  readonly owed: string;
  readonly paid: string;
  readonly value: string;
} {
  const loans = totalOf(assets, owedOn);
  return {
    equity: formatGbp(totalOf(assets, equityOf)),
    loans: formatGbp(loans),
    owed: owedOf(loans),
    paid: formatMonthly(totalOf(assets, paidTowards)),
    value: formatGbp(totalOf(assets, ({ asset }) => asset.balance)),
  };
}
