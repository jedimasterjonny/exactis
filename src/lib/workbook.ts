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

// The most the files wanted from a zip may unzip to, together, in
// bytes: over six times the 4.7 MB of parts BlackRock's workbook is
// read for, the most of any file read here, and short of what a zip
// built to fill the memory unzips to.
const ceiling = 32_000_000;

// The most files a zip may list: over twice the 463 BlackRock's
// workbook lists, the most of any file read. Every file listed counts
// against it, wanted or not, since what it bounds is the walk of the
// zip's directory rather than what is unzipped.
const mostFiles = 1000;

// The parts a workbook is read for, named one by one; its sheets are
// wanted by the prefix they are kept under instead, in isPartRead.
const workbookParts: ReadonlySet<string> = new Set([
  "xl/_rels/workbook.xml.rels",
  "xl/sharedStrings.xml",
  "xl/workbook.xml",
]);

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
// strings it keeps once, and each cell's number or text. Those parts
// are all that is taken from the zip, since a workbook can carry far
// more beside them than the ceiling allows. A sheet is found by its
// name with any spaces around it let go, since BlackRock writes one
// sheet's name with a space after it that no one reading the tab could
// see. What the reader cannot find is refused in words naming it, since
// the screen says why a file was not pulled.
export function readSheet(workbook: Uint8Array, name: string): readonly Row[] {
  const parts = unzipped(workbook, "The workbook is not a zip", isPartRead);
  const strings = stringsOf(parts);
  return [...partOf(parts, sheetPath(parts, name)).matchAll(rowTag)].map(
    ([, cells]) => rowOf(cells ?? "", strings),
  );
}

// The files a zip holds by their paths, or a refusal in the words given
// when it is no zip. The Bank's file is a zip of workbooks, and each
// workbook a zip of its parts, so both are opened this way. A caller
// that knows which files it reads says so, and the rest are left where
// they are: neither unzipped nor counted against the ceiling, so a
// workbook is read for its sheets however much it carries beside them.
// A caller that reads a zip whole says nothing and every file counts.
// A zip is refused before another of its files is read once it lists
// more files than the most, or once the files wanted from it come to
// more than the ceiling, each counted at the larger of its size in the
// zip and the size it says it unzips to: a stored file is copied at the
// first, however many of the zip's entries point at it, and a
// compressed one is unzipped into room the size of the second, and cut
// off there whatever it unzips to.
// ponytail: a file wanted is still inflated to its end past that room,
// written nowhere, so the time is bounded only by deflate's thousand to
// one over the 32 MB of compressed sizes the ceiling lets through, some
// 33 GB inflated to nowhere, minutes for each zip. Naming the files
// read spends that on those alone rather than on everything a zip
// lists, which is what made BlackRock's workbook readable, but a bomb
// written into one of them is inflated still; feed fflate's streaming
// Inflate each file in slices and stop at what it said, should a source
// ever send one.
export function unzipped(
  file: Uint8Array,
  refusal: string,
  isWanted?: (path: string) => boolean,
): Unzipped {
  let files = 0;
  let size = 0;
  try {
    return unzipSync(file, {
      filter: (entry) => {
        files += 1;
        if (files > mostFiles) {
          throw new Refusal(
            "The zip lists more than 1,000 files, far more than any read here",
          );
        }
        if (isWanted?.(entry.name) === false) {
          return false;
        }
        size += Math.max(entry.size, entry.originalSize);
        if (size > ceiling) {
          throw new Refusal(
            "The zip unzips to more than 32 MB, far past any file read from one",
          );
        }
        return true;
      },
    });
  } catch (error) {
    throw error instanceof Refusal ? error : new Refusal(refusal);
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

// Whether a workbook is read for the part at that path: the parts it
// is read for by name, and every part kept under the sheets' prefix,
// since which one holds the sheet is not known until the first two have
// been read and both sources point at theirs under it. The rest is what
// a workbook carries that the reader never opens, and BlackRock's
// carries 27 MB of it, the values cached from each of the 213 workbooks
// it links to, which came to more than the ceiling on their own.
function isPartRead(path: string): boolean {
  return workbookParts.has(path) || path.startsWith("xl/worksheets/");
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
