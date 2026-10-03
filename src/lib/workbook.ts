import type { Unzipped } from "fflate";

import { strFromU8, unzipSync } from "fflate";

import { Refusal } from "@/lib/answer";

// What a cell holds: a number, or its text, which is a string the
// workbook keeps once for every cell holding it, a formula's text, or
// the error written where a value could not be worked out, #VALUE!,
// which is no number whatever it reads as. A cell holding nothing is
// left out of its row.
export type Cell = number | string;

// A row of a sheet: its cells by column, A being nought.
export type Row = ReadonlyMap<number, Cell>;

// An element read as the attributes of its opening tag and what it
// holds, which is nothing when the tag closes itself.
const sheetTag = /<sheet\b([^>]*)>/g;
const relationshipTag = /<Relationship\b([^>]*)>/g;
const rowTag = /<row\b[^>]*?(?:\/>|>(.*?)<\/row>)/gs;
const cellTag = /<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs;
const itemTag = /<si\b[^>]*?(?:\/>|>(.*?)<\/si>)/gs;
const textTag = /<t\b[^>]*?(?:\/>|>(.*?)<\/t>)/gs;
const valueTag = /<v>(.*?)<\/v>/s;
const attribute = /\s([\w:]+)="([^"]*)"/g;
const place = /^([A-Z]+)\d+$/;

// The five characters XML writes as entities, in a map rather than an
// object, so a name an object inherits, constructor, is no entity.
const entities: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["quot", '"'],
]);

// The rows of the named sheet of an Excel workbook, from the top down,
// as the sheet lists them. What is read is the part of the format the
// Bank of England's and BlackRock's workbooks are written in and no
// more: the sheets the workbook lists and where it keeps them, the
// strings it keeps once, and each cell's number or text. A sheet is
// found by its name with any spaces around it let go, since BlackRock
// writes one sheet's name with a space after it that no one reading the
// tab could see. What the reader cannot find is refused in words naming
// it, since the screen says why a file was not pulled.
export function readSheet(workbook: Uint8Array, name: string): readonly Row[] {
  const parts = unzipped(workbook, "The workbook is not a zip");
  const strings = stringsOf(parts);
  return [...partOf(parts, sheetPath(parts, name)).matchAll(rowTag)].map(
    ([, cells]) => rowOf(cells ?? "", strings),
  );
}

// The files a zip holds by their paths, or a refusal in the words given
// when it is no zip. The Bank's file is a zip of workbooks, and each
// workbook a zip of its parts, so both are opened this way.
export function unzipped(file: Uint8Array, refusal: string): Unzipped {
  try {
    return unzipSync(file);
  } catch {
    throw new Refusal(refusal);
  }
}

function attributesOf(tag: string): ReadonlyMap<string, string> {
  return new Map(
    tag
      .matchAll(attribute)
      .map(([, key = "", value = ""]) => [key, unescaped(value)]),
  );
}

// A cell's column and what it holds, or nothing for a cell holding
// nothing. A cell of no type is a number, and holds nothing when its
// value is blank rather than the nought Number reads a blank as; one of
// the string type names a string the workbook keeps once, by its place
// in the list.
function cellOf(
  attributes: ReadonlyMap<string, string>,
  content: string,
  strings: readonly string[],
): [[number, Cell]] | [] {
  const value = valueTag.exec(content)?.[1];
  if (value === undefined) {
    return [];
  }
  const column = columnOf(attributes.get("r"));
  switch (attributes.get("t")) {
    case "n":
    case undefined:
      return value.trim() === "" ? [] : [[column, Number(value)]];
    case "s":
      return [[column, stringAt(strings, Number(value))]];
    default:
      return [[column, unescaped(value)]];
  }
}

// The column a cell's place names, A being nought, AK 36.
function columnOf(reference: string | undefined): number {
  const letters = place.exec(reference ?? "")?.[1];
  if (letters === undefined) {
    throw new Refusal("The workbook has a cell in no column it names");
  }
  let column = 0;
  for (const letter of letters) {
    column = column * 26 + letter.charCodeAt(0) - 64;
  }
  return column - 1;
}

function partOf(parts: Unzipped, path: string): string {
  const part = parts[path];
  if (part === undefined) {
    throw new Refusal(`The workbook has no ${path}`);
  }
  return strFromU8(part);
}

function rowOf(cells: string, strings: readonly string[]): Row {
  return new Map(
    cells
      .matchAll(cellTag)
      .flatMap(([, tag = "", content]) =>
        cellOf(attributesOf(tag), content ?? "", strings),
      ),
  );
}

// Where the workbook keeps the sheet of that name: the sheet names the
// relationship that points at its part, relative to the workbook's.
function sheetPath(parts: Unzipped, name: string): string {
  const sheet = tagsOf(partOf(parts, "xl/workbook.xml"), sheetTag).find(
    (attributes) => attributes.get("name")?.trim() === name,
  );
  if (sheet === undefined) {
    throw new Refusal(`The workbook has no sheet ${name}`);
  }
  const target = tagsOf(
    partOf(parts, "xl/_rels/workbook.xml.rels"),
    relationshipTag,
  )
    .find((attributes) => attributes.get("Id") === sheet.get("r:id"))
    ?.get("Target");
  if (target === undefined) {
    throw new Refusal(`The workbook does not say where its sheet ${name} is`);
  }
  return `xl/${target}`;
}

function stringAt(strings: readonly string[], index: number): string {
  const text = strings[index];
  if (text === undefined) {
    throw new Refusal(`The workbook keeps no string ${String(index)}`);
  }
  return text;
}

// The strings the workbook keeps once, each whole across the runs it
// is written in, where a workbook holding none has no part to keep them
// in.
function stringsOf(parts: Unzipped): readonly string[] {
  const kept =
    parts["xl/sharedStrings.xml"] === undefined
      ? ""
      : partOf(parts, "xl/sharedStrings.xml");
  return [...kept.matchAll(itemTag)].map(([, item]) =>
    [...(item ?? "").matchAll(textTag)]
      .map(([, text]) => unescaped(text ?? ""))
      .join(""),
  );
}

function tagsOf(
  xml: string,
  tag: RegExp,
): IteratorObject<ReadonlyMap<string, string>> {
  return xml
    .matchAll(tag)
    .map(([, attributes = ""]) => attributesOf(attributes));
}

// Text with the five entities XML writes read back as their
// characters, and anything else left as it was written.
function unescaped(text: string): string {
  return text.replaceAll(
    /&(\w+);/g,
    (entity, name: string) => entities.get(name) ?? entity,
  );
}
