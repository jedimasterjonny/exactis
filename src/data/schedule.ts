import type { Cadence } from "@/data/accounts";

export type LineGrowth = (typeof lineGrowths)[number];

// What the lines of both schedules share. A line is money over a run of
// years: whole pounds in today's money, paid at a cadence from a first
// year to a last, or to the end of the plan when it has no last year,
// rising as its growth says. The last year may end in a month of its
// own, January being nought as the date gives it, for a line whose end
// is worked out to the month, as a loan's payments are; a line entered
// by year runs the whole of its last year and has none. An income line
// and an expense line each add what is theirs, the kind of money it is
// and, for an employment line, the parts it is paid in.
export interface LineValues {
  readonly amount: number;
  readonly cadence: Cadence;
  readonly firstYear: number;
  readonly growth: LineGrowth;
  readonly lastMonth: null | number;
  readonly lastYear: null | number;
  readonly name: string;
}

// A month of a year, as the engine reads a plan a month at a time: the
// year, and the month of it, January being nought as the date gives it.
export interface Month {
  readonly month: number;
  readonly year: number;
}

// The two schedules a line belongs to: money coming in, or going out.
export type Side = "expense" | "income";

// The growth choices as a list, so each store's column takes the same
// words the type does and cannot drift from them. Growth is stated
// against inflation: with it, a point or two over it, the state pension's
// triple lock, or fixed in nominal terms and so falling behind it.
export const lineGrowths = [
  "inflation",
  "inflation-plus-1",
  "inflation-plus-2",
  "nominal",
  "triple-lock",
] as const;
