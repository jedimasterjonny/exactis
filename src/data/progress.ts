import type { Account } from "@/data/accounts";
import type { Month } from "@/data/schedule";

import { isAsset, isPension } from "@/data/accounts";
import { monthsBetween } from "@/lib/months";

// A progress point is the household's balances as they were read at the
// end of a month, each summed over the accounts it holds: the pensions,
// the ISAs, the GIAs, the cash, what the property and vehicles were
// worth, the loans secured on them and the debt secured on nothing, each
// whole pounds, the two debts nothing or less as an account's is. A point
// read off the owner's sheet carries no cash or GIA figure, since the
// sheet summed neither, so the two are absent on a point not read with
// them rather than nothing. A point carries no account of its own, since
// the accounts a balance was summed over have come and gone over the
// years the points span where the sums have not. Beside the balances it
// carries the house's share of what the property and vehicles were
// worth, nothing before one was owned, so what the house has been worth
// can be written again without the vehicles that were summed beside it.
export interface ProgressPoint {
  readonly assets: number;
  readonly cash?: number;
  readonly deferred: number;
  readonly free: number;
  readonly house: number;
  readonly loans: number;
  readonly month: Month;
  readonly taxable?: number;
  readonly unsecured: number;
}

// Which accounts each of a point's balances sums, as the accounts screen
// groups them: the pensions, the ISAs, the GIAs, the cash, every house,
// car and other real asset, the loans secured on one of them, and the
// debts secured on nothing.
export const holds: Readonly<
  Record<
    Exclude<keyof ProgressPoint, "house" | "month">,
    (account: Account) => boolean
  >
> = {
  assets: isAsset,
  cash: ({ kind }) => kind === "cash",
  deferred: isPension,
  free: ({ kind }) => kind === "tax-free",
  loans: ({ kind, secures }) => kind === "debt" && secures !== undefined,
  taxable: ({ kind }) => kind === "taxable",
  unsecured: ({ kind, secures }) => kind === "debt" && secures === undefined,
};

// The balances the screens read off a point, what is held before what
// is owed, in the order the accounts screen lists the kinds.
export const balances = [
  "deferred",
  "free",
  "taxable",
  "cash",
  "assets",
  "loans",
  "unsecured",
] as const satisfies readonly (keyof ProgressPoint)[];

export type Balance = (typeof balances)[number];

// A calendar year of the points: the year; the point its move is read
// from, the last of the year before, or its own first where the points
// begin in it; the points kept in it, oldest first; and the last of
// them, which it is read to.
export interface KeptYear {
  readonly from: ProgressPoint;
  readonly points: readonly ProgressPoint[];
  readonly to: ProgressPoint;
  readonly year: number;
}

// The latest year the points span: the point it is read from, a year
// before the latest or the earliest within the year where the points
// start later or that month was not kept; the latest point, which it is
// read to; and, where it runs twelve months whole, what net worth moved
// by over each year before it to the same month, the nearest first,
// which is what the latest is held against: each read over the balances
// both the latest's ends carry, and a year either end of which was not
// read with every one of them passed over, so a year is held only
// against years read alike. None while there is no point before the
// latest to read a move from.
export interface LatestYear {
  readonly before: readonly number[];
  readonly from: ProgressPoint;
  readonly to: ProgressPoint;
}

// What a balance moved net worth by from one point to another.
export interface Move {
  readonly key: Balance;
  readonly move: number;
}

export function latestYearOf(
  points: readonly ProgressPoint[],
): LatestYear | undefined {
  const to = points.at(-1);
  if (to === undefined) {
    return undefined;
  }
  const from = points.find(
    (point) => monthsBetween(point.month, to.month) <= 12,
  );
  if (from === undefined || from === to) {
    return undefined;
  }
  return {
    before:
      monthsBetween(from.month, to.month) === 12
        ? yearsBefore(points, to, sharedBy(from, to))
        : [],
    from,
    to,
  };
}

// What each balance moved net worth by from one point to another, over
// the balances both carry or those given, in the order the balances are
// listed: a debt paid down adds and one run up takes away, as it moves
// net worth. A move is the sum of its moves, what added less what took
// away, and is read no other way.
export function movesOf(
  from: ProgressPoint,
  to: ProgressPoint,
  over: readonly Balance[] = sharedBy(from, to),
): Move[] {
  return over.map((key) => ({ key, move: (to[key] ?? 0) - (from[key] ?? 0) }));
}

// What a point's balances come to, the debts taking away: every balance
// it was read with, so a point read off the accounts comes to what they
// hold between them and one read off the sheet leaves cash and the GIAs
// out, as the sheet did; or the balances given, such as those a move is
// read over, when its two ends are named.
export function netWorthOf(
  point: ProgressPoint,
  over: readonly Balance[] = balances,
): number {
  return over.reduce((sum, key) => sum + (point[key] ?? 0), 0);
}

// The household's balances as a point read off the accounts at the end
// of the month given: every account summed into the balance that holds
// it, and the house the house's own accounts alone.
export function pointOf(
  accounts: readonly Account[],
  month: Month,
): ProgressPoint {
  const sum = (held: (account: Account) => boolean): number =>
    accounts.filter(held).reduce((total, { balance }) => total + balance, 0);
  return {
    assets: sum(holds.assets),
    cash: sum(holds.cash),
    deferred: sum(holds.deferred),
    free: sum(holds.free),
    house: sum(({ kind }) => kind === "house"),
    loans: sum(holds.loans),
    month,
    taxable: sum(holds.taxable),
    unsecured: sum(holds.unsecured),
  };
}

// The balances both points were read with, in the order they are
// listed: what a move between them is read over, so a balance first
// counted at the later point is never read as what moved.
export function sharedBy(from: ProgressPoint, to: ProgressPoint): Balance[] {
  return balances.filter(
    (key) => from[key] !== undefined && to[key] !== undefined,
  );
}

// What the moves on one side came to: the sign picks the side, one for
// what added and minus one for what took away.
export function sumOf(moves: readonly Move[], sign: -1 | 1): number {
  return moves.reduce((sum, { move }) => sum + Math.max(0, sign * move), 0);
}

// The points by the calendar year they fall in, oldest first, each read
// from the last point of the year before so the years' moves add up to
// the whole span's over the balances carried throughout, a year with no
// December read from whatever month ended it. A year after one that
// kept no point at all is read from its
// own first point, as the first year is, so no row carries the move of
// a year it does not name.
export function yearsOf(points: readonly ProgressPoint[]): KeptYear[] {
  const years: KeptYear[] = [];
  for (const point of points) {
    const last = years.at(-1);
    if (last?.year === point.month.year) {
      years[years.length - 1] = {
        ...last,
        points: [...last.points, point],
        to: point,
      };
    } else {
      years.push({
        from: last?.year === point.month.year - 1 ? last.to : point,
        points: [point],
        to: point,
        year: point.month.year,
      });
    }
  }
  return years;
}

// What net worth moved by over each year to the month given before the
// year to it, the nearest first, a year back from a point to the point
// a year on, over the balances given. A year either end of which was not
// kept is passed over, so each is read over twelve months whole, and so
// is one either end of which was not read with every balance given, so
// each is read over the same balances.
function yearsBefore(
  points: readonly ProgressPoint[],
  to: ProgressPoint,
  over: readonly Balance[],
): number[] {
  const back = new Map(
    points.map((point) => [monthsBetween(point.month, to.month), point]),
  );
  return points
    .filter(({ month }) => {
      const months = monthsBetween(month, to.month);
      return months > 12 && months % 12 === 0;
    })
    .toReversed()
    .flatMap((from) => {
      const end = back.get(monthsBetween(from.month, to.month) - 12);
      if (end === undefined) {
        return [];
      }
      const both = sharedBy(from, end);
      if (!over.every((key) => both.includes(key))) {
        return [];
      }
      const moves = movesOf(from, end, over);
      return [sumOf(moves, 1) - sumOf(moves, -1)];
    });
}
