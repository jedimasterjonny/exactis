import { strToU8 } from "fflate";

import type { Holdings } from "@/data/lifestrategy";

// A line of Vanguard's answer as a test writes it: a fund by its name,
// SEDOL and weight in per cent, or cash, with no SEDOL.
export type Line = readonly [
  name: string,
  sedol: null | string,
  weight: number,
];

// What LifeStrategy holds in the funds the reference taxonomy has
// categories for, as at the end of August 2026, four fifths in
// equities and a fifth in bonds, with a sliver of cash beside them:
// the developed world less the UK, the US, the UK and emerging markets,
// then global bonds hedged and index-linked gilts. For tests.
export const lines: readonly Line[] = [
  ["Vanguard FTSE Developed World ex UK Equity Index Fund", "B59G4Q7", 50],
  ["Vanguard US Equity Index Fund", "B5B71Q7", 20],
  ["Vanguard FTSE UK All Share Index Unit Trust", "B3X7QG6", 5],
  ["Vanguard Emerging Markets Stock Index Fund/Ireland", "B50MZ72", 5],
  ["Vanguard Investment Series PLC - Global Bond Index Fund", "B50W2R1", 15],
  [
    "Vanguard Investments Funds ICVC - Vanguard UK Inflation-Linked Gilt Index Fund",
    "B45Q903",
    5,
  ],
  ["British Pound Sterling", null, 0.02],
];

// Vanguard's answer to what a fund holds, as its site sends it, over
// the lines given, each as at the day given. For tests.
export function vanguardAnswer(
  held: readonly Line[] = lines,
  asOf = "2026-08-31",
): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    strToU8(
      JSON.stringify({
        data: {
          borHoldings: [
            {
              holdings: {
                items: held.map(([name, sedol, weight]) => ({
                  effectiveDate: asOf,
                  marketValuePercentage: weight,
                  securityLongDescription: name,
                  sedol1: sedol,
                })),
              },
            },
          ],
        },
      }),
    ),
  );
}

// The holdings the reader reads out of the answer over the lines above:
// the six funds, the cash left out. For tests.
export const holdings: Holdings = {
  asOf: "2026-08-31",
  funds: lines.flatMap(([name, sedol, weight]) =>
    sedol === null ? [] : [{ name, sedol, weight: weight / 100 }],
  ),
};
