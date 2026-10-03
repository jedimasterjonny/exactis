import type { Curve } from "@/data/inflation";

import { inflationOf, target } from "@/data/inflation";

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
  return (
    allocation.stocks * stocksTotal(rates) +
    (1 - allocation.stocks) * rates.bonds
  );
}

// What a rate comes to once prices have risen by the inflation given: a
// pound grown at it, read at the prices it started at. Today's money
// divides every sum by how far prices have risen, so the two compound
// rather than subtract, and this is what a balance grows at there.
export function realRate(rate: number, inflation: number): number {
  return (1 + rate) / (1 + inflation) - 1;
}

// What stocks return in all: their growth and the yield on top of it,
// added, since every account the plan holds them in reinvests it.
export function stocksTotal(rates: Rates): number {
  return rates.stocks + rates.dividends;
}
