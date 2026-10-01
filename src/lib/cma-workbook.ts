import type { Asset, Cma, Sleeve } from "@/data/cma";
import type { Month } from "@/data/schedule";
import type { Cell, Row } from "@/lib/workbook";

import { horizon } from "@/data/inflation";
import { Refusal } from "@/lib/answer";
import { monthName } from "@/lib/months";
import { readSheet } from "@/lib/workbook";

// The columns a row's asset class, the asset's name and its return over
// the horizon are in, its currency being in the first.
interface Columns {
  readonly asset: number;
  readonly kind: number;
  readonly rate: number;
}

// A row of the sheet as read: its currency, BlackRock's class for it,
// its name, and what its return cell holds.
interface Listed {
  readonly currency: string;
  readonly kind: string;
  readonly name: string;
  readonly rate: Cell | undefined;
}

// The sheet the returns are read from, BlackRock's central case, the
// rest of the workbook being its scenarios, its post-tax returns and its
// model portfolios.
const sheet = "Starting point";

// The plan's class each of BlackRock's blends into: its equities into
// stocks and its fixed income into bonds. Its private markets blend into
// neither, since nothing the plan holds is bought outside a fund.
const sleeves: ReadonlyMap<string, Sleeve> = new Map([
  ["Equities", "stocks"],
  ["Fixed income", "bonds"],
]);

// What BlackRock writes after the name of a return it hedges, and the
// cash each currency's hedge is carried at, by the names BlackRock gives
// them.
const hedged = " (hedged)";
const sterlingCash = "UK cash";
const dollarCash = "US cash";

// The classes carried into sterling from the one currency BlackRock
// prices them in, over the class every block prices: Japan's large caps,
// which sterling stopped pricing in August 2026, from the yen, and US
// small caps from the dollar. Each is priced in its own market's
// currency there, as the anchor is in the dollar's and unhedged in
// every other, so the currency moves out of the gap between the two and
// the gap is the same in sterling. BlackRock's own figures bear it out
// for the classes every block prices unhedged: Europe's gap over US
// large caps is 0.160 of a point in each of the fourteen blocks, to
// within 0.004. Global small caps' gap is not, moving two points from
// block to block as their hedging does, so a class is carried only
// where it is priced at home, and these two are the ones the plan has
// needed.
const anchor = "US large cap equities";
const carried: readonly (readonly [currency: string, name: string])[] = [
  ["JPY", "Japan large cap equities"],
  ["USD", "US small cap equities"],
];

// The line BlackRock dates a vintage with, "August 2026, data as of 30
// June 2026".
const dated =
  /^(?<month>\p{L}+) (?<year>\d{4}), data as of (?<day>\d{1,2}) (?<asOfMonth>\p{L}+) (?<asOfYear>\d{4})$/u;

// Each month by its name in full, as BlackRock writes it.
const months: ReadonlyMap<string, number> = new Map(
  Array.from({ length: 12 }, (_, month) => [monthName(month, "long"), month]),
);

// BlackRock's capital market assumptions, as its workbook gives them:
// the vintage, the day its data are as of, and the return each asset
// class it prices in sterling is expected to make a year over the
// horizon, read off its starting point. The sheet lists a block of rows
// for each currency the assumptions are priced in, each block listing
// its own asset classes, and only sterling's are taken, since the plan
// is in pounds and a return priced in another currency carries that
// currency's rates. Of those, equities and fixed income are taken, each
// blending into the plan's class for it, and private markets left out.
// The header is found by its first cell rather than assumed, and the
// return read from the column for the horizon within the block headed
// expected returns, since the ranges beside it head their columns the
// same way. A row with no currency, class or name, as the reference
// code closing the sheet is, lists nothing.
//
// A few classes BlackRock prices only in another currency are carried
// into sterling after them, over US large caps, as below.
//
// BlackRock prices a return hedged only in dollars, and its sterling
// return on the same index is unhedged, so for each class priced hedged
// in dollars and unhedged in sterling a sterling-hedged form is added
// after it: the dollar-hedged return carried from dollar cash to
// sterling cash, as a hedge is rolled. Where either cash is missing no
// hedged form is added, rather than the pull refused over it.
//
// What the reader cannot read, or cannot find, is refused in words
// naming it, since the screen says why a workbook was not pulled.
export function readCma(file: Uint8Array): Cma {
  const rows = readSheet(file, sheet);
  const at = rows.findIndex((row) => textAt(row, 0) === "Currency");
  const header = rows[at];
  if (header === undefined) {
    throw new Refusal(`The ${sheet} sheet has no header headed Currency`);
  }
  const columns = columnsOf(header, rows[at - 1] ?? new Map());
  const listed = rows.slice(at + 1).flatMap((row) => listingOf(row, columns));
  const sterling = listed.flatMap((row) =>
    row.currency === "GBP" ? assetOf(row) : [],
  );
  if (sterling.length === 0) {
    throw new Refusal(`The ${sheet} sheet prices nothing a fund holds in GBP`);
  }
  const names = sterling.map(({ name }) => name);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice !== undefined) {
    throw new Refusal(`The ${sheet} sheet lists ${twice} in GBP twice`);
  }
  return {
    ...datesOf(rows.slice(0, at)),
    assets: [...withHedged(sterling, listed), ...carriedOf(sterling, listed)],
  };
}

// A sterling row as the asset class it prices, or nothing for one in a
// class blending into neither of the plan's. One whose return is not a
// number is refused, since a class with no return can blend into
// nothing.
function assetOf(row: Listed): readonly Asset[] {
  const sleeve = sleeves.get(row.kind);
  if (sleeve === undefined) {
    return [];
  }
  if (typeof row.rate !== "number") {
    throw new Refusal(
      `The ${sheet} sheet gives ${row.name} no ${String(horizon)}-year return`,
    );
  }
  return [{ name: row.name, rate: row.rate, sleeve }];
}

// The classes carried into sterling over US large caps, each its own
// currency's gap over them added to sterling's return on them, and each
// only where sterling does not price it itself and all three returns
// are numbers.
function carriedOf(
  sterling: readonly Asset[],
  listed: readonly Listed[],
): readonly Asset[] {
  const rateOf = (currency: string, name: string): number | undefined => {
    const rate = listed.find(
      (row) => row.currency === currency && row.name === name,
    )?.rate;
    return typeof rate === "number" ? rate : undefined;
  };
  const base = sterling.find(({ name }) => name === anchor)?.rate;
  return carried.flatMap(([currency, name]) => {
    const rate = rateOf(currency, name);
    const over = rateOf(currency, anchor);
    return base === undefined ||
      rate === undefined ||
      over === undefined ||
      sterling.some((asset) => asset.name === name)
      ? []
      : [
          {
            carriedFrom: currency,
            name,
            rate: base + rate - over,
            sleeve: "stocks" as const,
          },
        ];
  });
}

// The first column holding the text given, or a refusal saying the
// sheet has none.
function columnOf(row: Row, text: string): number {
  const found = [...row].find(
    ([, cell]) => typeof cell === "string" && cell.trim() === text,
  );
  if (found === undefined) {
    throw new Refusal(`The ${sheet} sheet has no column headed ${text}`);
  }
  return found[0];
}

// Where a row's class, name and return are, by what the header names
// them, the return's column the one named for the horizon within the
// block of expected returns: from where the row of labels above the
// header starts it to where the next label starts the next block. A
// header naming none of them is refused, naming what it lacks, rather
// than the horizon read out of a range's block.
function columnsOf(header: Row, labels: Row): Columns {
  const returns = columnOf(labels, "Expected returns");
  const next =
    [...labels].find(
      ([column, cell]) => column > returns && typeof cell === "string",
    )?.[0] ?? Infinity;
  const block = new Map(
    [...header].filter(([column]) => column >= returns && column < next),
  );
  return {
    asset: columnOf(header, "Asset"),
    kind: columnOf(header, "Asset class"),
    rate: columnOf(block, `${String(horizon)} year`),
  };
}

// The vintage and the day its data are as of, from the line above the
// header dating them.
function datesOf(rows: readonly Row[]): Pick<Cma, "asOf" | "vintage"> {
  const line = rows
    .map((row) => dated.exec(textAt(row, 0)))
    .find((found) => found !== null);
  if (line === undefined) {
    throw new Refusal(`The ${sheet} sheet does not say which vintage it is`);
  }
  const [, month = "", year = "", day = "", asOfMonth = "", asOfYear = ""] =
    line;
  const asOf = monthOf(asOfMonth, asOfYear);
  const date = new Date(Date.UTC(asOf.year, asOf.month, Number(day)));
  if (date.getUTCMonth() !== asOf.month) {
    throw new Refusal(`The ${sheet} sheet dates its data to no day there is`);
  }
  return {
    asOf: date.toISOString().slice(0, 10),
    vintage: monthOf(month, year),
  };
}

// A row's currency, class, name and return, or nothing for a row
// missing any of the first three.
function listingOf(row: Row, columns: Columns): readonly Listed[] {
  const currency = textAt(row, 0);
  const kind = textAt(row, columns.kind);
  const name = textAt(row, columns.asset);
  return currency === "" || kind === "" || name === ""
    ? []
    : [{ currency, kind, name, rate: row.get(columns.rate) }];
}

function monthOf(name: string, year: string): Month {
  const month = months.get(name);
  if (month === undefined) {
    throw new Refusal(`The ${sheet} sheet dates its vintage to no month`);
  }
  return { month, year: Number(year) };
}

// A cell's text with the spaces around it let go, as BlackRock leaves
// one after some names, or none for a cell holding a number or nothing.
function textAt(row: Row, column: number): string {
  const cell = row.get(column);
  return typeof cell === "string" ? cell.trim() : "";
}

// The sterling classes with a sterling-hedged form after each that
// BlackRock prices hedged in dollars.
function withHedged(
  sterling: readonly Asset[],
  listed: readonly Listed[],
): readonly Asset[] {
  const dollars = new Map(
    listed.flatMap(({ currency, name, rate }) =>
      currency === "USD" && typeof rate === "number"
        ? [[name, rate] as const]
        : [],
    ),
  );
  const fromCash = sterling.find(({ name }) => name === sterlingCash)?.rate;
  const toCash = dollars.get(dollarCash);
  return sterling.flatMap((asset) => {
    const rate = dollars.get(asset.name + hedged);
    return rate === undefined || fromCash === undefined || toCash === undefined
      ? [asset]
      : [
          asset,
          {
            hedges: asset.name,
            name: `${asset.name} (GBP hedged)`,
            rate: rate + fromCash - toCash,
            sleeve: asset.sleeve,
          },
        ];
  });
}
