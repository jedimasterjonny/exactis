import type { Account } from "@/data/accounts";
import type { Secured } from "@/data/secured";

import { isGia, isPension } from "@/data/accounts";
import { worthsIn } from "@/engine/projection";
import { cadenceAbbreviations } from "@/lib/cadence";
import { formatGbp } from "@/lib/money";
import { cgtAllowance, lumpSumAllowance } from "@/lib/tax";

// What the accounts hold between them, a debt's balance taking away, as
// every total of balances on the accounts screen adds them.
export function balanceOf(accounts: readonly Account[]): number {
  return sumOf(accounts, ({ balance }) => balance);
}

// The tax on the pensions as the plan opens, counted as drawn at the
// basic rate: what they hold less what worthsIn says they are worth on
// a point of today's balances, each owner's lump sum allowance whole,
// which is the point the plan opens on, today's money being nominal
// pounds there. What the starting net worth takes off what the accounts
// hold, so it is the net worth the plan's first year opens on to the
// pound, by the engine's own count and rounding, and the rows it is
// ruled off from add to it.
export function drawingTaxOf(accounts: readonly Account[]): number {
  const pensions = accounts.filter(isPension);
  const worths = worthsIn(
    {
      allowances: Object.fromEntries(
        pensions.flatMap(({ owner }) =>
          owner === undefined ? [] : [[owner, lumpSumAllowance] as const],
        ),
      ),
      balances: Object.fromEntries(
        pensions.map(({ balance, id }) => [id, balance]),
      ),
      bases: {},
      exempt: cgtAllowance,
    },
    pensions,
  );
  return balanceOf(pensions) - sumOf(Object.values(worths), (worth) => worth);
}

// What an asset is worth to the plan once the loans secured on it are
// paid: its value less what is owed, all of it for one owned outright.
// Loans above the value leave the equity below nothing.
export function equityOf({ asset, loans }: Secured): number {
  return asset.balance + balanceOf(loans);
}

// A month's worth of money as the ledger writes it, "£1,275 / mo".
export function formatMonthly(amount: number): string {
  return `${formatGbp(amount)} / ${cadenceAbbreviations.month}`;
}

// The capital gains tax on the GIAs as the plan opens, counted as sold
// at the basic rate (18%) above each owner's £3,000 annual exempt
// amount: what they hold less what worthsIn says they are worth on the
// opening point, so the starting net worth agrees with the plan's first
// point to the pound.
export function giaTaxOf(accounts: readonly Account[]): number {
  const gias = accounts.filter(isGia);
  const worths = worthsIn(
    {
      allowances: {},
      balances: Object.fromEntries(
        gias.map(({ balance, id }) => [id, balance]),
      ),
      bases: Object.fromEntries(
        gias.map(({ costBasis, id }) => [id, costBasis ?? 0]),
      ),
      exempt: cgtAllowance,
    },
    gias,
  );
  return balanceOf(gias) - sumOf(Object.values(worths), (worth) => worth);
}

// A figure summed down a list, for a total beneath the rows or a tile
// over them.
export function sumOf<TItem>(
  items: readonly TItem[],
  figure: (item: TItem) => number,
): number {
  return items.reduce((sum, item) => sum + figure(item), 0);
}
