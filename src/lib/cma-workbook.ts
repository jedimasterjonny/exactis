import type { Asset, Cma, Risk, Sleeve } from "@/data/cma";
import type { Month } from "@/data/schedule";
import type { Cell, Row } from "@/lib/workbook";

import { horizon } from "@/data/inflation";
import { Refusal } from "@/lib/answer";
import { monthName } from "@/lib/months";
import { readSheet } from "@/lib/workbook";

// The columns a row's asset class, the asset's name and its return over
// the horizon are in, its currency being in the first; and those its
// volatility and its correlations with government bonds and equities
// are in, where the sheet has them.
interface Columns {
  readonly asset: number;
  readonly bonds: number | undefined;
  readonly kind: number;
  readonly rate: number;
  readonly stocks: number | undefined;
  readonly volatility: number | undefined;
}

// A row of the sheet as read: its currency, BlackRock's class for it,
// its name, what its return cell holds, and how far it strays, or none
// for a row with no volatility.
interface Listed {
  readonly currency: string;
  readonly kind: string;
  readonly name: string;
  readonly rate: Cell | undefined;
  readonly risk: Risk | undefined;
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
// Each class carries how far BlackRock expects it to stray, read from
// the blocks beside the returns: its volatility and its correlations
// with government bonds and with equities. A hedged form strays as the
// dollar-hedged row does, its currency hedged away, and a class carried
// in as sterling's US large caps do, its return being carried over
// theirs. How government bonds and equities move together is read off
// the class correlated wholly with equities, which is the equities the
// rest are correlated with. A class with no volatility carries none,
// and a sheet without the blocks, or without either correlation's
// column, is read with none at all, rather than the pull refused over
// them, since the returns stand without them.
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
  const correlation = sterling.find(({ risk }) => risk?.stocks === 1)?.risk
    ?.bonds;
  return {
    ...datesOf(rows.slice(0, at)),
    assets: [...withHedged(sterling, listed), ...carriedOf(sterling, listed)],
    ...(correlation !== undefined && { correlation }),
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
  return [{ name: row.name, rate: row.rate, ...riskOf(row.risk), sleeve }];
}

// The header's cells in the block the label given starts in the row of
// labels above it, from there to where the next label starts the next
// block, or a refusal saying the sheet has no such block.
function blockOf(header: Row, labels: Row, label: string): Row {
  const start = columnOf(labels, label);
  const next =
    labels
      .entries()
      .find(
        ([column, cell]) => column > start && typeof cell === "string",
      )?.[0] ?? Infinity;
  return new Map(
    header.entries().filter(([column]) => column >= start && column < next),
  );
}

// The classes carried into sterling over US large caps, each its own
// currency's gap over them added to sterling's return on them, and each
// only where sterling does not price it itself and all three returns
// are numbers.
function carriedOf(
  sterling: readonly Asset[],
  listed: readonly Listed[],
): readonly Asset[] {
  const found = sterling.find(({ name }) => name === anchor);
  const base = found?.rate;
  return carried.flatMap(([currency, name]) => {
    const rate = rateIn(listed, currency, name);
    const over = rateIn(listed, currency, anchor);
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
            ...riskOf(found?.risk),
            sleeve: "stocks" as const,
          },
        ];
  });
}

// The first column holding the text given, or a refusal saying the
// sheet has none.
function columnOf(row: Row, text: string): number {
  const found = foundIn(row, text);
  if (found === undefined) {
    throw new Refusal(`The ${sheet} sheet has no column headed ${text}`);
  }
  return found;
}

// Where a row's class, name and return are, by what the header names
// them, the return's column the one named for the horizon within the
// block of expected returns. A header naming none of them is refused,
// naming what it lacks, rather than the horizon read out of a range's
// block. Where its volatility and its correlations are, if anywhere:
// the volatility's column the one the row of labels names, its header
// cell being blank, and each correlation's the one named for government
// bonds or equities within the block of correlations; a sheet without
// them is read all the same, its classes straying by nothing it says.
function columnsOf(header: Row, labels: Row): Columns {
  const correlations =
    foundIn(labels, "Correlation") === undefined
      ? new Map<number, Cell>()
      : blockOf(header, labels, "Correlation");
  return {
    asset: columnOf(header, "Asset"),
    bonds: foundIn(correlations, "Government bonds"),
    kind: columnOf(header, "Asset class"),
    rate: columnOf(
      blockOf(header, labels, "Expected returns"),
      `${String(horizon)} year`,
    ),
    stocks: foundIn(correlations, "Equities"),
    volatility: foundIn(labels, "Volatility"),
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

// The first column holding the text given, or none.
function foundIn(row: Row, text: string): number | undefined {
  return row
    .entries()
    .find(([, cell]) => typeof cell === "string" && cell.trim() === text)?.[0];
}

// The row a currency's block gives the class named, or none for a class
// it does not list. One it lists twice is refused, as a sterling class
// is, rather than either taken: only a row read here can be refused, so
// a class listed twice that nothing reads stops no pull.
function listingIn(
  listed: readonly Listed[],
  currency: string,
  name: string,
): Listed | undefined {
  const rows = listed.filter(
    (row) => row.currency === currency && row.name === name,
  );
  if (rows.length > 1) {
    throw new Refusal(`The ${sheet} sheet lists ${name} in ${currency} twice`);
  }
  return rows[0];
}

// A row's currency, class, name, return and how far it strays, or
// nothing for a row missing any of the first three.
function listingOf(row: Row, columns: Columns): readonly Listed[] {
  const currency = textAt(row, 0);
  const kind = textAt(row, columns.kind);
  const name = textAt(row, columns.asset);
  return currency === "" || kind === "" || name === ""
    ? []
    : [
        {
          currency,
          kind,
          name,
          rate: row.get(columns.rate),
          risk: riskAt(row, columns),
        },
      ];
}

function monthOf(name: string, year: string): Month {
  const month = months.get(name);
  if (month === undefined) {
    throw new Refusal(`The ${sheet} sheet dates its vintage to no month`);
  }
  return { month, year: Number(year) };
}

// What a cell holds where it holds a number, or none, as for a column
// the sheet does not have.
function numberAt(row: Row, column: number | undefined): number | undefined {
  const cell = column === undefined ? undefined : row.get(column);
  return typeof cell === "number" ? cell : undefined;
}

// The return a currency's block gives the class named, or nothing for a
// class it lists without a number or not at all.
function rateIn(
  listed: readonly Listed[],
  currency: string,
  name: string,
): number | undefined {
  const rate = listingIn(listed, currency, name)?.rate;
  return typeof rate === "number" ? rate : undefined;
}

// How far a row strays, as its volatility and its correlations say, or
// none for a row whose volatility is not a number, or on a sheet missing
// either correlation's column, since a correlation nobody gave is not
// one of nothing. A correlation left blank in its column, as BlackRock
// leaves cash's beside a volatility of nothing, is read as none.
function riskAt(row: Row, columns: Columns): Risk | undefined {
  const volatility = numberAt(row, columns.volatility);
  if (
    volatility === undefined ||
    columns.bonds === undefined ||
    columns.stocks === undefined
  ) {
    return undefined;
  }
  return {
    bonds: numberAt(row, columns.bonds) ?? 0,
    stocks: numberAt(row, columns.stocks) ?? 0,
    volatility,
  };
}

// A class's risk as an asset carries it: none at all rather than an
// empty one, for a class with none.
function riskOf(risk: Risk | undefined): { readonly risk?: Risk } {
  return risk === undefined ? {} : { risk };
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
  const fromCash = sterling.find(({ name }) => name === sterlingCash)?.rate;
  const toCash = rateIn(listed, "USD", dollarCash);
  return sterling.flatMap((asset) => {
    const row = listingIn(listed, "USD", asset.name + hedged);
    const rate = row?.rate;
    return typeof rate !== "number" ||
      fromCash === undefined ||
      toCash === undefined
      ? [asset]
      : [
          asset,
          {
            hedges: asset.name,
            name: `${asset.name} (GBP hedged)`,
            rate: rate + fromCash - toCash,
            ...riskOf(row?.risk),
            sleeve: asset.sleeve,
          },
        ];
  });
}
