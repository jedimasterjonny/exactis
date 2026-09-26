import type { Account, Growth } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Secured } from "@/data/secured";

import { capOf } from "@/data/accounts";
import { cadenceAbbreviations, fixedMonthly, monthly } from "@/lib/cadence";
import { fedOf } from "@/lib/feeders";
import { formatGbp, formatPercent } from "@/lib/money";

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

// An account with nothing paid in shows a flat dash, as a flat delta does.
// A fixed sum is written a month whatever cadence it was stated at, so a
// column of them reads down and adds up. One paid the spare money says
// the most it takes a year, which is its cap held beneath its allowance,
// or the allowance when it was given no cap, since an allowance is a
// year's.
export function formatContribution(account: Account): string {
  const { contribution } = account;
  if (contribution === undefined) {
    return "—";
  }
  switch (contribution.kind) {
    case "fixed":
      return formatMonthly(fixedMonthly(account));
    case "spare": {
      const cap = capOf(account.kind, contribution.cap);
      return cap === null
        ? "Spare, uncapped"
        : `Spare, to ${formatGbp(cap)} / yr`;
    }
  }
}

// A growth is the account's own rate, or the plan's, set once on the
// assumptions screen.
export function formatGrowth(growth: Growth): string {
  switch (growth.kind) {
    case "fixed":
      return formatPercent(growth.rate);
    case "plan":
      return "Plan rate";
  }
}

// A month's worth of money as the ledger writes it, "£1,390 / mo".
export function formatMonthly(amount: number): string {
  return `${formatGbp(amount)} / ${cadenceAbbreviations.month}`;
}

// What lands in an account a month that the month decides in advance:
// its own fixed sum, and what the salaries running then sacrifice into
// it with the employer's NI saved. The spare money's take is left out,
// since it is decided month by month from what is left.
export function paidMonthly(
  account: Account,
  lines: readonly IncomeLine[],
): number {
  return fixedMonthly(account) + monthly(fedOf(account.id, lines), "year");
}

// What the accounts are paid a month between them that the month
// decides in advance, as the account table totals it beneath its rows
// and the screen's tile states it over them.
export function paidMonthlyOf(
  accounts: readonly Account[],
  lines: readonly IncomeLine[],
): number {
  return sumOf(accounts, (account) => paidMonthly(account, lines));
}

// A figure summed down a list, for a total beneath the rows or a tile
// over them.
export function sumOf<TItem>(
  items: readonly TItem[],
  figure: (item: TItem) => number,
): number {
  return items.reduce((sum, item) => sum + figure(item), 0);
}
