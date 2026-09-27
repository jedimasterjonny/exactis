import { strToU8, zipSync } from "fflate";

import type { Cell } from "@/lib/workbook";

// A sheet as a test writes it: its rows from the top, each its cells
// from column A, a cell holding nothing left undefined.
export type Written = readonly (readonly (Cell | undefined)[])[];

// A workbook of the parts given, each path to its XML as written, for
// a test of what the reader makes of a part. For tests.
export function workbookFrom(
  parts: Readonly<Record<string, string>>,
): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)]),
    ),
  );
}

// A workbook of the sheets given, in order, written as Excel writes
// one: each sheet listed by name and pointed at its part, a number in
// its cell, and plain text kept once for the workbook and named by its
// place in the list. For tests.
export function workbookOf(
  sheets: Readonly<Record<string, Written>>,
): Uint8Array {
  const strings: string[] = [];
  const names = Object.keys(sheets);
  const parts = Object.values(sheets).map(
    (rows, index) => [partOf(index), sheetOf(rows, strings)] as const,
  );
  const listed = names.map((name, index) => sheetEntryOf(name, index));
  const pointed = names.map((_, index) => relationshipOf(index));
  const kept = strings.map((text) => "<si><t>" + text + "</t></si>");
  return workbookFrom({
    "xl/_rels/workbook.xml.rels": `<Relationships>${pointed.join("")}</Relationships>`,
    "xl/sharedStrings.xml": `<sst>${kept.join("")}</sst>`,
    "xl/workbook.xml": `<workbook><sheets>${listed.join("")}</sheets></workbook>`,
    ...Object.fromEntries(parts),
  });
}

function cellOf(
  cell: Cell | undefined,
  place: string,
  strings: string[],
): string {
  if (cell === undefined) {
    return "";
  }
  return typeof cell === "number"
    ? `<c r="${place}"><v>${String(cell)}</v></c>`
    : `<c r="${place}" t="s"><v>${String(strings.push(cell) - 1)}</v></c>`;
}

// The letters naming a column, A for nought and AA for 26.
function lettersOf(column: number): string {
  const letter = String.fromCharCode(65 + (column % 26));
  return column < 26 ? letter : lettersOf(Math.floor(column / 26) - 1) + letter;
}

// Where the sheet at a place in the list is kept, the first sheet1.xml.
function partOf(index: number): string {
  return `xl/worksheets/sheet${String(index + 1)}.xml`;
}

// The relationship pointing the sheet at a place in the list at its
// part, the first rId1.
function relationshipOf(index: number): string {
  return `<Relationship Id="rId${String(index + 1)}" Target="${partOf(index).slice(3)}"/>`;
}

function rowOf(cells: Written[number], row: number, strings: string[]): string {
  const place = String(row + 1);
  const written = cells.map((cell, column) =>
    cellOf(cell, lettersOf(column) + place, strings),
  );
  return `<row r="${place}">${written.join("")}</row>`;
}

function sheetEntryOf(name: string, index: number): string {
  return `<sheet name="${name}" sheetId="${String(index + 1)}" r:id="rId${String(index + 1)}"/>`;
}

function sheetOf(rows: Written, strings: string[]): string {
  const written = rows.map((cells, row) => rowOf(cells, row, strings));
  return `<worksheet><sheetData>${written.join("")}</sheetData></worksheet>`;
}
