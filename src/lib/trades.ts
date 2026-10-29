import type { Target } from "@/data/targets";

// The ladder of what to trade: a rung for each count of trades, from
// none up to the most that could each move something, and the rung
// recommended, the rung of no trade where none is. A count at which no
// trades can each move something, as one alone where no pounds come
// in, has no rung.
export interface Ladder {
  readonly recommended: Rung;
  readonly rungs: readonly Rung[];
}

// What the ladder is held to beside the pounds: the least a trade is
// worth placing for, the most sales a rung may make, and how much of
// each category can be sold, in whole pounds. Unless given, the
// minimum is the platform's, no sale is made, and the whole of what a
// category holds can be sold.
export interface Limits {
  readonly minimum?: number;
  readonly sales?: number;
  readonly sellable?: (category: Target) => number;
}

// A rung of the ladder: how many trades it makes, the trades, the
// purchases first and then the sales, each the largest first, and how
// far off target the allocation stands with them made, as the root of
// the mean square of each category's gap from its target, a fraction
// of the whole, the whole being what is held with the pounds in. The
// rung of no trade says how far off it stands with the pounds left
// uninvested, so every rung is measured on one whole and a trade never
// reads as taking the allocation further off.
export interface Rung {
  readonly count: number;
  readonly drift: number;
  readonly trades: readonly Trade[];
}

// A trade a rung makes: the category, and the whole pounds put into it,
// or taken out of it where they are below nothing, a sale.
export interface Trade {
  readonly category: Target;
  readonly pounds: number;
}

// A category a rung trades, how far short of its target it stands once
// the pounds are in, in pounds, below nothing where it holds more than
// its target, and the least and most it can be traded by: a purchase
// from nothing up, a sale from as much as can be sold of it up to
// nothing.
interface Bound {
  readonly category: Target;
  readonly least: number;
  readonly most: number;
  readonly short: number;
}

// The least a trade is worth placing for, in pounds: a rung is
// recommended only while its smallest trade is at least this.
// ponytail: one figure for every platform; a field when a platform's
// minimum or a dealing fee asks for another.
export const minimumTrade = 100;

// The trades that bring the allocation nearest its targets for the
// pounds given, buying, and selling up to the count of sales given,
// laid as a ladder by how many are made. Each category's shortfall is
// what its target of the whole, the pounds once in, comes to over
// what it holds, the whole being the same whatever is sold, since
// what a sale raises is put back in. The trades a rung makes bring
// every category they trade to one level short of its target, the
// level at which the purchases less the sales come to the pounds,
// each sale held to what can be sold of its category and to what that
// stands over its target; which is the nearest the squared gaps can
// be brought with those categories traded. A category is sold only
// while it stands over its target, and never past it, so no fund is
// sold under its target, though selling one less short to buy one
// more short would bring the gaps nearer. The purchases are in the
// categories most short, whatever is sold, since pounds moved from a
// category less short to one more short always bring the gaps nearer,
// and a category sold stands more over that level than any bought;
// which to sell is found by trying every choice of so many, since a
// category far over target that little of can be sold may do less
// than one nearer it. A choice makes at least one purchase, since
// what a sale raises is put back in, and no more sales than the count
// given; one in which some trade would move less than a pound, the
// category already at the level, is no choice of that count, since it
// makes one trade fewer. Each count's rung is its choice of least
// squared gap of those whose smallest trade is at least the minimum,
// or of all its choices where none is, and a count with no choice has
// no rung. The rung recommended is the one nearest target of those
// whose smallest trade is at least the minimum, or the rung of no
// trade where none is. Each trade is whole pounds, a sale rounded
// toward nothing so it never takes more than can be sold or takes its
// category under its target, a purchase rounded down, and the pounds
// left over put on the largest purchase, so they add up to the pounds
// given, which are themselves taken to the pound. A category is
// bought toward only while a fund is assigned to it and it asks for a
// share: one asking for nothing is to be wound down, and one with no
// fund has nothing to buy; every category counts toward how far off
// target the allocation stands all the same.
// ponytail: every choice of sales is tried, on the main thread at each
// render; at five sales a dozen categories take milliseconds and two
// dozen near a third of a second. Move it to a worker, or bound the
// sales field by the count of categories, if a taxonomy grows. Purchases
// other than in the categories most short are never tried, though
// where one of those falls under the minimum a choice worth placing
// that skips it can come nearer; try every choice of purchases too, at
// two to the power of the categories, if that is ever seen to matter.
export function ladderOf(
  targets: readonly Target[],
  pounds: number,
  {
    minimum = minimumTrade,
    sales = 0,
    sellable = ({ value }: Target): number => value,
  }: Limits = {},
): Ladder {
  const amount = Math.round(pounds);
  const held = targets.reduce((sum, { value }) => sum + value, 0);
  const total = held + amount;
  const shortOf = ({ share, value }: Target): number => share * total - value;
  const buyable = targets
    .filter(({ isImplemented, share }) => isImplemented && share > 0)
    .toSorted((one, other) => shortOf(other) - shortOf(one));
  const sellers = targets.filter(
    (category) => sellable(category) > 0 && shortOf(category) < 0,
  );
  const none: Rung = {
    count: 0,
    drift: driftOf(targets, [], total),
    trades: [],
  };
  const isWorth = ({ trades }: Rung): boolean =>
    Math.min(...trades.map((trade) => Math.abs(trade.pounds))) >= minimum;
  const byDrift = (one: Rung, other: Rung): number => one.drift - other.drift;
  const rungs = [none];
  const most = buyable.length + Math.min(sales, sellers.length);
  for (let count = 1; count <= most; count++) {
    const choices: Rung[] = [];
    for (let sold = 0; sold <= Math.min(sales, count - 1); sold++) {
      const bought = buyable.slice(0, count - sold);
      if (bought.length < count - sold) {
        continue;
      }
      const unsold = sellers.filter((category) => !bought.includes(category));
      for (const chosen of choicesOf(unsold, sold)) {
        const bounds = [
          ...bought.map((category) => ({
            category,
            least: 0,
            most: Infinity,
            short: shortOf(category),
          })),
          ...chosen.map((category) => ({
            category,
            least: Math.max(-sellable(category), shortOf(category)),
            most: 0,
            short: shortOf(category),
          })),
        ];
        const trades = tradesOf(bounds, amount);
        if (trades !== undefined) {
          choices.push({
            count,
            drift: driftOf(targets, trades, total),
            trades,
          });
        }
      }
    }
    const [nearest] = [
      ...choices.filter(isWorth).toSorted(byDrift),
      ...choices.toSorted(byDrift),
    ];
    if (nearest !== undefined) {
      rungs.push(nearest);
    }
  }
  const [recommended = none] = rungs.slice(1).filter(isWorth).toSorted(byDrift);
  return { recommended, rungs };
}

// Every choice of so many of the categories given, each in the order
// given.
function choicesOf(
  categories: readonly Target[],
  count: number,
): readonly (readonly Target[])[] {
  if (count === 0) {
    return [[]];
  }
  if (count > categories.length) {
    return [];
  }
  return categories.flatMap((category, at) =>
    choicesOf(categories.slice(at + 1), count - 1).map((rest) => [
      category,
      ...rest,
    ]),
  );
}

// How far off target an allocation stands with the trades given made,
// the whole being what it then comes to: the root of the mean square
// of each category's gap from its target. A whole of nothing holds
// every category at nothing.
function driftOf(
  targets: readonly Target[],
  trades: readonly Trade[],
  whole: number,
): number {
  const gaps = targets.map(({ id, share, value }) => {
    const traded =
      trades.find(({ category }) => category.id === id)?.pounds ?? 0;
    return (whole > 0 ? (value + traded) / whole : 0) - share;
  });
  return Math.sqrt(gaps.reduce((sum, gap) => sum + gap * gap, 0) / gaps.length);
}

// The level short of target the categories given are traded to for the
// pounds given: each traded by its shortfall less the level, held
// between the least and most it can be. What the trades come to falls
// as the level rises, in a straight line between the levels at which
// some trade reaches its least or most, so the level is found between
// the last of those at which the trades come to more than the pounds
// and the first at which they come to no more; or below them all,
// where only the purchases are moving, by however many there are. The
// trades come to no more than the pounds at the highest, where every
// purchase is nothing and every sale all it can be.
function levelOf(bounds: readonly Bound[], amount: number): number {
  const tradedAt = (level: number): number =>
    bounds.reduce(
      (sum, { least, most, short }) =>
        sum + Math.min(most, Math.max(least, short - level)),
      0,
    );
  const buying = bounds.filter(({ most }) => most === Infinity).length;
  const levels = [
    ...new Set(
      bounds.flatMap(({ least, most, short }) =>
        [short - most, short - least].filter(Number.isFinite),
      ),
    ),
  ].toSorted((one, other) => one - other);
  const [above = 0] = levels.filter((level) => tradedAt(level) <= amount);
  const below = levels.filter((level) => level < above).at(-1);
  return below === undefined
    ? above - (amount - tradedAt(above)) / buying
    : below +
        ((tradedAt(below) - amount) * (above - below)) /
          (tradedAt(below) - tradedAt(above));
}

// The trades that bring the categories given to one level short of
// target for the pounds given, to the pound: each rounded toward
// nothing, the pounds left over put on the first, the largest
// purchase, since the purchases are given the most short first, then
// the purchases first and the sales after, each the largest first; or
// none where some trade would come to nothing once whole, as one
// already at the level does, or the pounds left over would take the
// largest purchase to nothing or below, as they can where every trade
// is a pound or two and the sales' odd pence outweigh the purchases'.
function tradesOf(
  bounds: readonly Bound[],
  amount: number,
): readonly Trade[] | undefined {
  const level = levelOf(bounds, amount);
  const traded = bounds.map(({ category, least, most, short }) => ({
    category,
    pounds: Math.trunc(Math.min(most, Math.max(least, short - level))),
  }));
  const left = amount - traded.reduce((sum, { pounds }) => sum + pounds, 0);
  const whole = traded
    .map((trade, at) =>
      at === 0 ? { ...trade, pounds: trade.pounds + left } : trade,
    )
    .toSorted((one, other) => Math.abs(other.pounds) - Math.abs(one.pounds));
  const buying = bounds.filter(({ most }) => most > 0).length;
  if (
    whole.some(({ pounds }) => pounds === 0) ||
    whole.filter(({ pounds }) => pounds > 0).length !== buying
  ) {
    return undefined;
  }
  return [
    ...whole.filter(({ pounds }) => pounds > 0),
    ...whole.filter(({ pounds }) => pounds < 0),
  ];
}
