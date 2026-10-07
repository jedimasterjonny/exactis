import type { Balance, Move } from "@/data/progress";

// What each of a progress point's balances is called, wherever it is
// named, as the accounts screen heads the groups they are summed from.
export const balanceNames: Readonly<Record<Balance, string>> = {
  assets: "Property & vehicles",
  deferred: "Pensions",
  free: "ISAs",
  loans: "Secured loans",
  unsecured: "Other debts",
};

// The tone each balance is drawn in, as the whole class, since Tailwind
// reads class names whole: the dashboard's colour for the family of
// accounts it sums, and for the debts loss red and then oxide, as the
// dashboard takes them in turn.
export const balanceTones: Readonly<Record<Balance, string>> = {
  assets: "bg-chart-3",
  deferred: "bg-chart-2",
  free: "bg-chart-1",
  loans: "bg-chart-5",
  unsecured: "bg-brand",
};

// The same colours as a chart draws in them, by the palette's own
// variables rather than through a class.
export const balanceColors: Readonly<Record<Balance, string>> = {
  assets: "var(--chart-3)",
  deferred: "var(--chart-2)",
  free: "var(--chart-1)",
  loans: "var(--chart-5)",
  unsecured: "var(--brand)",
};

// The moves on one side as the parts of a bar, each in its balance's
// tone, the sign picking the side as it does for their sum.
export function partsOf(
  moves: readonly Move[],
  sign: -1 | 1,
): { key: Balance; tone: string; value: number }[] {
  return moves.map(({ key, move }) => ({
    key,
    tone: balanceTones[key],
    value: Math.max(0, sign * move),
  }));
}
