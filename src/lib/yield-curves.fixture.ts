import { zipSync } from "fflate";

import type { Written } from "@/lib/workbook.fixture";

import { workbookOf } from "@/lib/workbook.fixture";

// A day of the Bank's curves as a test writes it: the day, and the
// implied and real rates in per cent at each of the maturities below,
// an implied rate left undefined where the Bank gives none. The nominal
// is the two summed, as the Bank's is.
export interface Quoted {
  readonly day: string;
  readonly implied: readonly (number | undefined)[];
  readonly real: readonly number[];
}

// The maturities the implied and real sheets run across, in years. The
// Bank's run from 2.5 to 40 by halves, and the nominal sheet's from
// 0.5, so its 20-year point sits four columns along from theirs.
export const maturities = [2.5, 5, 10, 20, 30, 40];
const shorter = [0.5, 1, 1.5, 2];

// The first of September 2026 as the reference kit's curve stood on it,
// and the working day before. For tests. A tuple, so a test reading a
// day by its place gets one.
export const quoted = [
  {
    day: "2026-08-31",
    implied: [3.9, 3.53, 3.45, 3.37, 3.31, 3.2],
    real: [0.5, 1.07, 1.87, 2.52, 2.54, 2.6],
  },
  {
    day: "2026-09-01",
    implied: [3.95, 3.512, 3.441, 3.365, 3.298, 3.25],
    real: [0.42, 1.06, 1.88, 2.53, 2.55, 2.61],
  },
] as const satisfies readonly Quoted[];

// The Bank's yield-curve file of the workbooks given, each by the name
// the Bank gives it, on a buffer of its own as a response's body is.
// For tests.
export function bankFile(
  books: Readonly<Record<string, Uint8Array>>,
): Uint8Array<ArrayBuffer> {
  return new Uint8Array(zipSync(books));
}

// The Bank's three gilt workbooks for the days given, their spot curves
// laid out as the Bank lays them. For tests.
export function booksOf(
  days: readonly Quoted[],
): Readonly<Record<string, Uint8Array>> {
  return {
    "GLC Inflation daily data current month.xlsx": workbookOf({
      "4. spot curve": spotSheetOf(
        maturities,
        days.map(({ day, implied }) => [day, implied]),
      ),
    }),
    "GLC Nominal daily data current month.xlsx": workbookOf({
      "4. spot curve": spotSheetOf(
        [...shorter, ...maturities],
        days.map(({ day, implied, real }) => [
          day,
          [
            ...shorter.map(() => 4),
            ...real.map((rate, index) => {
              const inflation = implied[index];
              return inflation === undefined ? undefined : inflation + rate;
            }),
          ],
        ]),
      ),
    }),
    "GLC Real daily data current month.xlsx": workbookOf({
      "4. spot curve": spotSheetOf(
        maturities,
        days.map(({ day, real }) => [day, real]),
      ),
    }),
  };
}

// A spot curve sheet as the Bank lays one out: its title, a row naming
// the maturities, the maturities headed "years:", the row the Bank's
// formulas leave as #VALUE!, and a row a day, the day in Excel's count
// of days in the first column. For tests.
export function spotSheetOf(
  years: readonly number[],
  days: readonly (readonly [string, readonly (number | undefined)[]])[],
): Written {
  return [
    [undefined, "UK spot curve"],
    [],
    ["Maturity"],
    ["years:", ...years],
    ["#VALUE!", ...years.map(() => 9)],
    ...days.map(([day, rates]) => [
      Date.parse(day) / 86_400_000 + 25_569,
      ...rates,
    ]),
  ];
}
