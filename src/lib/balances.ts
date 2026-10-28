import type { Balance, Move } from "@/data/progress";

import { formatGbp } from "@/lib/money";

// What each of a progress point's balances is called, wherever it is
// named, as the accounts screen heads the groups they are summed from.
export const balanceNames: Readonly<Record<Balance, string>> = {
  assets: "Property & vehicles",
  cash: "Cash",
  deferred: "Pensions",
  free: "ISAs",
  loans: "Secured loans",
  taxable: "GIAs",
  unsecured: "Other debts",
};

// The fill each balance is drawn in, as the whole class, since Tailwind
// reads class names whole: the dashboard's colour for the family of
// accounts it sums, and for the debts loss red and then oxide, as the
// dashboard takes them in turn.
export const balanceFills: Readonly<Record<Balance, string>> = {
  assets: "bg-chart-3",
  cash: "bg-chart-4",
  deferred: "bg-chart-2",
  free: "bg-chart-1",
  loans: "bg-chart-5",
  taxable: "bg-chart-6",
  unsecured: "bg-brand",
};

// The same colours as a chart draws in them, by the palette's own
// variables rather than through a class.
export const balanceColors: Readonly<Record<Balance, string>> = {
  assets: "var(--chart-3)",
  cash: "var(--chart-4)",
  deferred: "var(--chart-2)",
  free: "var(--chart-1)",
  loans: "var(--chart-5)",
  taxable: "var(--chart-6)",
  unsecured: "var(--brand)",
};

// A balance as a point carries it, or a dash where the point was not
// read with it, since the figure was never read rather than nothing.
export function formatBalance(value: number | undefined): string {
  return value === undefined ? "—" : formatGbp(value);
}

// The moves on one side as the parts of a bar, each in its balance's
// fill, the sign picking the side as it does for their sum.
export function partsOf(
  moves: readonly Move[],
  sign: -1 | 1,
): { fill: string; key: Balance; value: number }[] {
  return moves.map(({ key, move }) => ({
    fill: balanceFills[key],
    key,
    value: Math.max(0, sign * move),
  }));
}
