import type { Unzipped } from "fflate";

import type { Curve, Maturity } from "@/data/inflation";
import type { Row } from "@/lib/workbook";

import { Refusal } from "@/lib/answer";
import { readSheet, unzipped } from "@/lib/workbook";

// A spot curve as its sheet gives it: each day's rates by the years to
// maturity, in per cent as the Bank writes them, a day being Excel's
// count of days.
type Spot = ReadonlyMap<number, ReadonlyMap<number, number>>;

// The sheet each workbook gives its spot curve on.
const spotSheet = "4. spot curve";

// How far nominal less real may sit from the implied rate, in
// percentage points: nothing but the rounding of the last place, since
// the Bank works the implied curve out as that difference.
const tolerance = 1e-9;

// Excel's count of days for 1 January 1970.
const epoch = 25_569;

// The Bank of England's implied inflation curve on the latest day its
// yield-curve file holds, at the maturities the plan reads. The file is
// the zip the Bank publishes, of a workbook each for the implied
// inflation, nominal and real gilt curves and one for the OIS curve.
// Each gives its spot curve on the same sheet, the maturities across a
// row headed "years:" and a day's rates on each row beneath, but the
// header has moved before, and the nominal curve starts at a shorter
// maturity than the other two, so the header is found rather than
// assumed and a rate is paired with its maturity rather than its
// column. A row beneath the header without a day, as the Bank's #VALUE!
// row is, or with one that is no number, holds no day's rates. The day
// read is the implied curve's latest, and a nominal or real curve with
// no row for it is refused as missing the day. The implied curve is the
// nominal less the real, so before anything is taken from the day read,
// the two are held to it at every maturity it gives: a sheet read
// wrongly breaks the difference, and is refused rather than planned on.
export function readCurve(file: Uint8Array): Curve {
  const books = unzipped(file, "The Bank's file is not a zip");
  const implied = spotCurve(books, "GLC Inflation");
  const nominal = spotCurve(books, "GLC Nominal");
  const real = spotCurve(books, "GLC Real");
  const day = Math.max(...implied.keys());
  const rates = implied.get(day);
  if (rates === undefined) {
    throw new Refusal("The implied inflation curve holds no day");
  }
  const asOf = new Date((day - epoch) * 86_400_000).toISOString().slice(0, 10);
  const onDay = (spot: Spot, name: string): ReadonlyMap<number, number> => {
    const held = spot.get(day);
    if (held === undefined) {
      throw new Refusal(`The ${name} spot curve holds no row for ${asOf}`);
    }
    return held;
  };
  const nominalRates = onDay(nominal, "GLC Nominal");
  const realRates = onDay(real, "GLC Real");
  for (const [years, rate] of rates) {
    const nominalRate = nominalRates.get(years);
    const realRate = realRates.get(years);
    if (
      nominalRate === undefined ||
      realRate === undefined ||
      Math.abs(nominalRate - realRate - rate) > tolerance
    ) {
      throw new Refusal(
        `Nominal less real is not the implied curve at ${String(years)} years on ${asOf}`,
      );
    }
  }
  const point = (years: Maturity): number => {
    const rate = rates.get(years);
    if (rate === undefined) {
      throw new Refusal(
        `The implied inflation curve has no ${String(years)}-year point on ${asOf}`,
      );
    }
    return rate / 100;
  };
  return {
    asOf,
    implied: { 5: point(5), 10: point(10), 20: point(20), 30: point(30) },
  };
}

// A day's rates by maturity: each rate under a maturity in the header.
function ratesOf(row: Row, header: Row): ReadonlyMap<number, number> {
  return new Map(
    [...header].flatMap(([column, years]) => {
      const rate = row.get(column);
      return typeof years === "number" && typeof rate === "number"
        ? [[years, rate] as const]
        : [];
    }),
  );
}

// The spot curve of the workbook whose name starts as given.
function spotCurve(books: Unzipped, name: string): Spot {
  const book = Object.entries(books).find(([path]) =>
    path.startsWith(name),
  )?.[1];
  if (book === undefined) {
    throw new Refusal(`The Bank's file holds no ${name} workbook`);
  }
  const rows = readSheet(book, spotSheet);
  const at = rows.findIndex(
    (row) => String(row.get(0)).trim().toLowerCase() === "years:",
  );
  const header = rows[at];
  if (header === undefined) {
    throw new Refusal(`The ${name} spot curve has no years: row`);
  }
  return new Map(
    rows.slice(at + 1).flatMap((row) => {
      const day = row.get(0);
      return typeof day === "number" && Number.isFinite(day)
        ? [[day, ratesOf(row, header)] as const]
        : [];
    }),
  );
}
