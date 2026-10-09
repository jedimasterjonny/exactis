import type { Target } from "@/data/targets";

// The ladder of what to buy: a rung for each count of trades, from none
// up to the count past which another would buy nothing, and the rung
// recommended, the rung of no trade where none is.
export interface Ladder {
  readonly recommended: Rung;
  readonly rungs: readonly Rung[];
}

// A rung of the ladder: how many trades it makes, the trades, the
// largest first, and how far off target the allocation stands with them
// made, as the root of the mean square of each category's gap from its
// target, a fraction of the whole, the whole being what is held with
// the pounds in. The rung of no trade says how far off it stands with
// the pounds left uninvested, so every rung is measured on one whole
// and a trade never reads as taking the allocation further off.
export interface Rung {
  readonly count: number;
  readonly drift: number;
  readonly trades: readonly Trade[];
}

// A purchase a rung makes: the category, and the whole pounds to put
// into it.
export interface Trade {
  readonly category: Target;
  readonly pounds: number;
}

// A category that can be bought toward, and how far short of its
// target it stands once the pounds are in, in pounds, below nothing
// where it holds more than its target.
interface Short {
  readonly category: Target;
  readonly short: number;
}

// The least a trade is worth placing for, in pounds: a rung is
// recommended only while its smallest trade is at least this.
// ponytail: one figure for every platform; a field when a platform's
// minimum or a dealing fee asks for another.
export const minimumTrade = 100;

// The trades that bring the allocation nearest its targets for the
// pounds given, buying only, laid as a ladder by how many are made.
// Each category's shortfall is what its target of the whole, the
// pounds once in, comes to over what it holds. The pounds go into the
// categories most short, as many as the rung counts, each brought to
// one level short of its target, which is the nearest the squared gaps
// can be brought with that many; and the categories most short are the
// ones to buy whatever the count, since pounds moved from a category
// less short to one more short always bring the gaps nearer, so each
// rung's trades are the rung below's and one more, resized. A rung
// whose newest trade would buy nothing, the pounds running out among
// the categories more short, closes the ladder, as every rung past it
// would make the same trades. The rung recommended is the last whose
// smallest trade is at least the minimum, or the rung of no trade
// where none is. Each trade is whole pounds, the odd pounds of rounding
// down put on the largest, so they add up to the pounds given, which
// are themselves taken to the pound. A category is bought toward only
// while a fund is assigned to it and it asks for a share: one asking
// for nothing is to be wound down, and one with no fund has nothing to
// buy; every category counts toward how far off target the allocation
// stands all the same.
export function ladderOf(
  targets: readonly Target[],
  pounds: number,
  minimum = minimumTrade,
): Ladder {
  const amount = Math.round(pounds);
  const held = targets.reduce((sum, { value }) => sum + value, 0);
  const total = held + amount;
  const shorts = targets
    .filter(({ isImplemented, share }) => isImplemented && share > 0)
    .map((category) => ({
      category,
      short: category.share * total - category.value,
    }))
    .toSorted((one, other) => other.short - one.short);
  const none: Rung = {
    count: 0,
    drift: driftOf(targets, [], total),
    trades: [],
  };
  const rungs = [none];
  let recommended = none;
  for (let count = 1; count <= shorts.length; count++) {
    const filled = filledOf(shorts.slice(0, count), amount);
    const smallest = Math.min(...filled.map((trade) => trade.pounds));
    if (smallest <= 0) {
      break;
    }
    const trades = wholeOf(filled, amount);
    const rung = { count, drift: driftOf(targets, trades, total), trades };
    rungs.push(rung);
    if (smallest >= minimum) {
      recommended = rung;
    }
  }
  return { recommended, rungs };
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
    const bought =
      trades.find(({ category }) => category.id === id)?.pounds ?? 0;
    return (whole > 0 ? (value + bought) / whole : 0) - share;
  });
  return Math.sqrt(gaps.reduce((sum, gap) => sum + gap * gap, 0) / gaps.length);
}

// The pounds put into the categories given, the most short first, as
// trades: each brought to one level short of its target, those not that
// short bought nothing, and the level where the pounds run out. Taking
// the categories in turn, with the first so many bought the level is
// what their shortfalls less the pounds come to over their number, and
// it stands while the last of them is short of more than it; the last
// number it stands for gives the level and how many are bought.
function filledOf(shorts: readonly Short[], amount: number): readonly Trade[] {
  let bought = 0;
  let level = 0;
  let sum = 0;
  shorts.forEach(({ short }, at) => {
    sum += short;
    const candidate = (sum - amount) / (at + 1);
    if (short > candidate) {
      bought = at + 1;
      level = candidate;
    }
  });
  return shorts.map(({ category, short }, at) => ({
    category,
    pounds: at < bought ? short - level : 0,
  }));
}

// The trades to the pound: each rounded down, and the odd pounds left
// put on the first, the largest, so they add up to the pounds given.
function wholeOf(trades: readonly Trade[], amount: number): readonly Trade[] {
  const floored = trades.map((trade) => ({
    ...trade,
    pounds: Math.floor(trade.pounds),
  }));
  const left = amount - floored.reduce((sum, { pounds }) => sum + pounds, 0);
  return floored.map((trade, at) =>
    at === 0 ? { ...trade, pounds: trade.pounds + left } : trade,
  );
}
