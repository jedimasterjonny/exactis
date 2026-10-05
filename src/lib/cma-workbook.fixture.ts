import type { Written } from "@/lib/workbook.fixture";

import { workbookOf } from "@/lib/workbook.fixture";

// A row of the starting point as a test writes it: its currency,
// BlackRock's class for it, its name, and its 20-year return, a
// fraction, or what the cell holds in place of one.
export type Priced = readonly [
  currency: string,
  kind: string,
  name: string,
  rate: number | string | undefined,
];

// The line BlackRock dates the August 2026 vintage with. For tests.
export const dated = "August 2026, data as of 30 June 2026";

// A row the fixture prices as BlackRock does, with a number for its
// return.
type Numbered = readonly [
  currency: string,
  kind: string,
  name: string,
  rate: number,
];

// Rows of the August 2026 vintage at their 20-year returns, in the
// order BlackRock lists them: dollars before sterling, with US large and
// small caps, the dollar cash and two returns hedged to dollars, one of
// a class sterling prices unhedged and one of a class it does not;
// sterling's equities, fixed income and a class of private markets, its
// cash named with the space after it BlackRock leaves after some names;
// a row of euros; and the yen's US and Japanese large caps. For tests.
export const priced: readonly Numbered[] = [
  ["USD", "Equities", "US large cap equities", 0.08593],
  ["USD", "Equities", "US small cap equities", 0.07421],
  ["USD", "Fixed income", "US cash", 0.03585],
  ["USD", "Fixed income", "Global ex-US treasuries (hedged)", 0.04459],
  ["USD", "Fixed income", "Global aggregate bonds (hedged)", 0.04553],
  ["GBP", "Equities", "US large cap equities", 0.08015],
  ["GBP", "Equities", "UK large cap equities", 0.08156],
  ["GBP", "Equities", "Emerging large cap equities", 0.09256],
  ["GBP", "Equities", "Global small cap equities", 0.07991],
  ["GBP", "Equities", "Global ex-UK large cap equities", 0.07722],
  ["GBP", "Fixed income", "UK index-linked gilts (5+ year)", 0.0457],
  ["GBP", "Fixed income", "UK cash ", 0.03574],
  ["GBP", "Fixed income", "Global aggregate bonds", 0.04563],
  ["GBP", "Private markets", "Hedge funds (global)", 0.0864],
  ["EUR", "Equities", "Europe large cap equities", 0.0791],
  ["JPY", "Equities", "US large cap equities", 0.06243],
  ["JPY", "Equities", "Japan large cap equities", 0.0681],
];

// BlackRock's workbook of the starting point given, under its name with
// the space after it BlackRock gives it, listed after a scenario whose
// every return is a point higher, which nothing should read. For tests.
export function cmaFile(sheet: Written = startingPointOf()): Uint8Array {
  return workbookOf({
    "AI productivity boom": startingPointOf(
      priced.map(([currency, kind, name, rate]) => [
        currency,
        kind,
        name,
        rate + 0.01,
      ]),
    ),
    "Starting point ": sheet,
  });
}

// The starting point as BlackRock lays it out: its title, the line
// dating the vintage with the label of each block of returns beside it,
// the header, a row a return, and the reference code closing the sheet.
// Each block runs across 5, 10, 20 and 30 years, the expected returns'
// first and the lower ends of their ranges after, so a 20-year column
// read from the wrong block reads four points low. After them come each
// row's volatility, under a label with a blank header cell beneath it as
// BlackRock leaves it, and its correlations with government bonds and
// equities, as strayingOf has it. For tests.
export function startingPointOf(
  rows: readonly Priced[] = priced,
  line: string = dated,
): Written {
  return [
    [
      "BlackRock asset class return, uncertainty, volatility and correlation expectations",
    ],
    [
      line,
      undefined,
      "BlackRock Capital Market Assumptions",
      undefined,
      "Expected returns",
      undefined,
      undefined,
      undefined,
      "Lower interquartile range (25th percentile)",
      undefined,
      undefined,
      undefined,
      "Volatility",
      "Correlation",
    ],
    [
      "Currency",
      "Asset class",
      "Asset",
      "Index",
      "5 year",
      "10 year",
      "20 year",
      "30 year",
      "5 year",
      "10 year",
      "20 year",
      "30 year",
      undefined,
      "Government bonds",
      "Equities",
    ],
    ...rows.map(([currency, kind, name, rate]) => [
      currency,
      kind,
      name,
      "An index",
      0.06,
      0.07,
      rate,
      0.09,
      0.02,
      0.03,
      typeof rate === "number" ? rate - 0.04 : 0.04,
      0.05,
      ...strayingOf(kind, name),
    ]),
    ["BII0826-5810213-EXP0827"],
  ];
}

// How far the fixture has a row stray, as BlackRock would: cash by
// nothing, with its correlations left blank; the equities every class is
// correlated with by 19%, wholly with itself and a little against
// government bonds; US large caps by 18.5%; a return hedged to dollars
// by 3.5%, moving with
// government bonds; and the rest by their class, equities by 16% and
// fixed income by 6%, each mostly with its own kind. For tests.
function strayingOf(
  kind: string,
  name: string,
): readonly [volatility: number, bonds?: number, stocks?: number] {
  if (name.trim().endsWith("cash")) {
    return [0];
  }
  if (name === "Global ex-UK large cap equities") {
    return [0.19, -0.05, 1];
  }
  if (name === "US large cap equities") {
    return [0.185, -0.12, 0.85];
  }
  if (name.endsWith("(hedged)")) {
    return [0.035, 0.9, 0];
  }
  return kind === "Equities" ? [0.16, -0.1, 0.8] : [0.06, 0.8, 0.1];
}
