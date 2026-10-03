import type { Curve } from "@/data/inflation";

import { inflationOf, target } from "@/data/inflation";

// A figure for each class and for the portfolio the split makes of
// them, each a fraction a year.
export interface Across {
  readonly bonds: number;
  readonly portfolio: number;
  readonly stocks: number;
}

// How the plan's savings are split between the two classes: the share
// held in stocks, a fraction of the whole, the rest held in bonds. One
// split for the whole plan, flat for life, and applied pro rata to every
// account on the plan rate.
export interface Allocation {
  readonly stocks: number;
}

// A set of rates the plan can run on, typed by hand or derived from the
// capital market assumptions, one to a class and flat for life, each a
// fraction a year as every rate is: what stocks grow at in price, the
// dividend yield they pay on top of it, what bonds return, and the
// inflation the lines rise with. Each is nominal, as a fixed rate on an
// account is.
export interface Rates {
  readonly bonds: number;
  readonly dividends: number;
  readonly inflation: number;
  readonly stocks: number;
}

// Where the rates the plan runs on come from: derived from the capital
// market assumptions, or typed by hand.
export type RateSet = (typeof rateSets)[number];

export const rateSets = ["cma", "custom"] as const;

// The split a household opens with before one is set, and is read with
// when it was kept before there was one: everything in stocks.
export const allInStocks: Allocation = { stocks: 1 };

// The rates a household opens with before any is typed, and is read with
// when it was kept before there were any: the plan it ran on until then,
// carried onto each class so that it projects as it did whatever split
// is set. That is the 5% the plan rate was held at, for stocks and bonds
// alike, with none of it split out as a yield, and the inflation the
// curve kept makes, or the Bank's target when none has been pulled.
export function openingRates(curve: Curve | null): Rates {
  return {
    bonds: 0.05,
    dividends: 0,
    inflation: curve === null ? target : inflationOf(curve).rate,
    stocks: 0.05,
  };
}

// The rate every account on the plan rate grows at: what stocks return
// in all and what bonds return, each in the share the split holds of it.
export function planRate(rates: Rates, allocation: Allocation): number {
  return weighted(allocation, stocksTotal(rates), rates.bonds);
}

// What a rate comes to once prices have risen by the inflation given: a
// pound grown at it, read at the prices it started at. Today's money
// divides every sum by how far prices have risen, so the two compound
// rather than subtract, and this is what a balance grows at there.
export function realRate(rate: number, inflation: number): number {
  return (1 + rate) / (1 + inflation) - 1;
}

// What a set of rates comes to under a split, for each class and the
// portfolio: the return in all, the growth and the yield it is made of,
// and the return over inflation. Bonds pay no yield, so their growth is
// their return. The portfolio's figure is each class's in the share the
// split holds of it, so its return is the plan rate, and its growth and
// yield add up to its return as each class's do.
export function resultsOf(
  rates: Rates,
  allocation: Allocation,
): {
  readonly growth: Across;
  readonly nominal: Across;
  readonly real: Across;
  readonly yield: Across;
} {
  const across = (stocks: number, bonds: number): Across => ({
    bonds,
    portfolio: weighted(allocation, stocks, bonds),
    stocks,
  });
  const nominal = across(stocksTotal(rates), rates.bonds);
  const real = (rate: number): number => realRate(rate, rates.inflation);
  return {
    growth: across(rates.stocks, rates.bonds),
    nominal,
    real: {
      bonds: real(nominal.bonds),
      portfolio: real(nominal.portfolio),
      stocks: real(nominal.stocks),
    },
    yield: across(rates.dividends, 0),
  };
}

// What stocks return in all: their growth and the yield on top of it,
// added, since every account the plan holds them in reinvests it.
export function stocksTotal(rates: Rates): number {
  return rates.stocks + rates.dividends;
}

// The portfolio's figure from a figure for each class, each in the share
// the split holds of it, as the plan rate is made and every figure the
// worksheets give the portfolio.
function weighted(
  allocation: Allocation,
  stocks: number,
  bonds: number,
): number {
  return allocation.stocks * stocks + (1 - allocation.stocks) * bonds;
}
