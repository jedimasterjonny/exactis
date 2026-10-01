import type { Month } from "@/data/schedule";

import { monthName } from "@/lib/months";

// An asset class as BlackRock's capital market assumptions price it in
// sterling: its name, the class of the plan its return blends into,
// and the return expected of it a year over the horizon, a fraction,
// nominal and geometric as BlackRock quotes it. One hedged to sterling,
// which BlackRock prices hedged only in dollars, names the class it is
// the hedged form of, and one BlackRock prices only in another
// currency, carried into sterling, names that currency.
export interface Asset {
  readonly carriedFrom?: string;
  readonly hedges?: string;
  readonly name: string;
  readonly rate: number;
  readonly sleeve: Sleeve;
}

// A vintage of BlackRock's capital market assumptions: the month it was
// published in, the day its data are as of, as an ISO date, and the
// asset classes it prices in sterling that a fund can hold, in the
// order its workbook lists them.
export interface Cma {
  readonly asOf: string;
  readonly assets: readonly Asset[];
  readonly vintage: Month;
}

// A category of the target allocation mapped onto an asset class a
// vintage prices: the category by the id Portfolio Performance gives
// it, which a file saved again keeps, and the class by its name.
export interface Mapping {
  readonly asset: string;
  readonly category: string;
}

// The plan's two classes, which an asset class's return blends into.
export type Sleeve = (typeof sleeves)[number];

// The vintages of the capital market assumptions the household keeps:
// the latest pulled, and the one it replaced, or none before a second
// vintage is pulled, kept so what a new vintage moves can be read.
export interface Vintages {
  readonly latest: Cma;
  readonly previous: Cma | null;
}

export const sleeves = ["bonds", "stocks"] as const;

// A vintage by its month and year, as BlackRock names it, "August 2026".
export function vintageName({ vintage }: Cma): string {
  return `${monthName(vintage.month, "long")} ${String(vintage.year)}`;
}
