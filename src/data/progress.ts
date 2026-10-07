import type { Month } from "@/data/schedule";

import { monthsBetween } from "@/lib/months";

// A progress point is the household's balances as they were read at the
// end of a month, summed as the sheet they are read off sums them: the
// pensions, the ISAs, what the property and vehicles were worth, the
// loans secured on them and the debt secured on nothing, each whole
// pounds, the two debts nothing or less as an account's is. Cash is
// left out, as the sheet leaves it out, and a point carries no account
// of its own, since the accounts a balance was summed over have come
// and gone over the years the points span where the sums have not.
export interface ProgressPoint {
  readonly assets: number;
  readonly deferred: number;
  readonly free: number;
  readonly loans: number;
  readonly month: Month;
  readonly unsecured: number;
}

// What a point's balances come to: the five summed, the debts taking
// away. It leaves cash out, as the point does, where the accounts
// screen's starting net worth counts it.
export function netWorthOf(point: ProgressPoint): number {
  return (
    point.assets + point.deferred + point.free + point.loans + point.unsecured
  );
}

// The balances a point carries, what is held before what is owed, in
// the order every screen lists them.
export const balances = [
  "deferred",
  "free",
  "assets",
  "loans",
  "unsecured",
] as const satisfies readonly (keyof ProgressPoint)[];

export type Balance = (typeof balances)[number];

// The latest year the points span: the point it is read from, a year
// before the latest or the earliest within the year where the points
// start later or that month was not kept; the latest point, which it is
// read to; and, where it runs twelve months whole, what net worth moved
// by over each year before it to the same month, the nearest first,
// which is what the latest is held against. None while there is no
// point before the latest to read a move from.
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
      monthsBetween(from.month, to.month) === 12 ? yearsBefore(points, to) : [],
    from,
    to,
  };
}

// What each balance moved net worth by from one point to another, in
// the order the balances are listed: a debt paid down adds and one run
// up takes away, as it moves net worth.
export function movesOf(from: ProgressPoint, to: ProgressPoint): Move[] {
  return balances.map((key) => ({ key, move: to[key] - from[key] }));
}

// What the moves on one side came to: the sign picks the side, one for
// what added and minus one for what took away.
export function sumOf(moves: readonly Move[], sign: -1 | 1): number {
  return moves.reduce((sum, { move }) => sum + Math.max(0, sign * move), 0);
}

// What net worth moved by over each year to the month given before the
// year to it, the nearest first, a year back from a point to the point
// a year on. A year either end of which was not kept is passed over, so
// each is read over twelve months whole.
function yearsBefore(
  points: readonly ProgressPoint[],
  to: ProgressPoint,
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
      return end === undefined ? [] : [netWorthOf(end) - netWorthOf(from)];
    });
}
