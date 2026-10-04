import type { Account } from "@/data/accounts";
import type { Secured } from "@/data/secured";

import { cadenceAbbreviations } from "@/lib/cadence";
import { formatGbp } from "@/lib/money";

// What the accounts hold between them, a debt's balance taking away, as
// every total of balances on the accounts screen adds them.
export function balanceOf(accounts: readonly Account[]): number {
  return sumOf(accounts, ({ balance }) => balance);
}

// What an asset is worth to the plan once the loan secured on it is
// paid: its value less what is owed, all of it for one owned outright.
// A loan above the value leaves the equity below nothing.
export function equityOf({ asset, loan }: Secured): number {
  return asset.balance + (loan?.balance ?? 0);
}

// A month's worth of money as the ledger writes it, "£1,390 / mo".
export function formatMonthly(amount: number): string {
  return `${formatGbp(amount)} / ${cadenceAbbreviations.month}`;
}

// A figure summed down a list, for a total beneath the rows or a tile
// over them.
export function sumOf<TItem>(
  items: readonly TItem[],
  figure: (item: TItem) => number,
): number {
  return items.reduce((sum, item) => sum + figure(item), 0);
}
