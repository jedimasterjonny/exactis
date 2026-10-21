// @vitest-environment node
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { Refusal } from "@/lib/answer";
import { workbookFrom, workbookOf } from "@/lib/workbook.fixture";

import { readSheet, unzipped } from "./workbook";

// A workbook holding one sheet, Sheet1, of the XML given, and the
// strings given kept once for it.
function oneSheet(sheetData: string, strings = ""): Uint8Array {
  return workbookFrom({
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": `<sst>${strings}</sst>`,
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${sheetData}</sheetData></worksheet>`,
  });
}

// A zip of one file stored as it is rather than compressed, its
// directory listing the file the number of times given, each entry
// pointing at the one copy and saying it unzips to nothing. The
// directory's end is the last 22 bytes of a zip with no comment, and
// gives the number of entries 8 and 10 bytes in, the directory's size
// 12 and where it starts 16; an entry gives its file's unzipped size 24
// bytes in.
function storedListed(content: Uint8Array, times: number): Uint8Array {
  const zip = zipSync({ part: content }, { level: 0 });
  const view = new DataView(zip.buffer);
  const end = zip.length - 22;
  const start = view.getUint32(end + 16, true);
  view.setUint32(start + 24, 0, true);
  const entry = zip.subarray(start, end);
  const listed = new Uint8Array(start + entry.length * times + 22);
  listed.set(zip.subarray(0, start));
  for (let at = 0; at < times; at++) {
    listed.set(entry, start + at * entry.length);
  }
  listed.set(zip.subarray(end), listed.length - 22);
  const tail = new DataView(listed.buffer, listed.length - 22);
  tail.setUint16(8, times, true);
  tail.setUint16(10, times, true);
  tail.setUint32(12, entry.length * times, true);
  return listed;
}

// A zip of the files given, its directory saying each unzips to the
// size given, whatever it does. The directory's end is the last 22
// bytes of a zip with no comment, and says where the directory starts
// and how many files it lists; each file's entry gives its unzipped
// size 24 bytes in, and runs 46 bytes and its name long.
function zipSaying(
  files: Readonly<Record<string, Uint8Array>>,
  size: number,
): Uint8Array {
  const zip = zipSync(files);
  const view = new DataView(zip.buffer);
  const end = zip.length - 22;
  let entry = view.getUint32(end + 16, true);
  for (let left = view.getUint16(end + 10, true); left > 0; left--) {
    view.setUint32(entry + 24, size, true);
    entry += 46 + view.getUint16(entry + 28, true);
  }
  return zip;
}

describe("readSheet", () => {
  it("reads the named sheet's rows from the top, each cell by its column", () => {
    const workbook = workbookOf({
      "1. fwds, short end": [["UK implied inflation forward curve"]],
      "4. spot curve": [
        [undefined, "UK implied inflation spot curve"],
        [],
        ["years:", 2.5, 3],
        [46289, 3.1, 3.2],
      ],
    });

    expect(readSheet(workbook, "4. spot curve")).toStrictEqual([
      new Map([[1, "UK implied inflation spot curve"]]),
      new Map(),
      new Map<number, number | string>([
        [0, "years:"],
        [1, 2.5],
        [2, 3],
      ]),
      new Map([
        [0, 46289],
        [1, 3.1],
        [2, 3.2],
      ]),
    ]);
  });

  // AK is the 37th column, and the Bank's 20-year point sits in it.
  it("counts a column of two letters on from Z", () => {
    const columns = Array.from({ length: 37 }, (_, column) => column);
    const [row] = readSheet(
      workbookOf({ "4. spot curve": [columns] }),
      "4. spot curve",
    );

    expect(row).toStrictEqual(
      new Map(columns.map((column) => [column, column])),
    );
    expect(row?.get(26)).toBe(26);
    expect(row?.get(36)).toBe(36);
  });

  // A blank value is nothing, not the nought Number reads it as, so a
  // blank rate cannot pass for a published one.
  it("reads a number, a formula's text and an error, and leaves out a cell holding nothing", () => {
    const [row] = readSheet(
      oneSheet(
        '<row r="5"><c r="A5" t="e"><v>#VALUE!</v></c><c r="B5" t="n"><v>3.9</v></c><c r="C5" t="str"><f>A1</f><v>years:</v></c><c r="D5" s="7"/><c r="E5"><f>1/0</f></c><c r="F5"><v></v></c><c r="G5" t="n"><v> </v></c></row>',
      ),
      "Sheet1",
    );

    expect(row).toStrictEqual(
      new Map<number, number | string>([
        [0, "#VALUE!"],
        [1, 3.9],
        [2, "years:"],
      ]),
    );
  });

  it("reads a row that closes itself as holding nothing", () => {
    expect(
      readSheet(
        oneSheet('<row r="1"/><row r="2"><c r="A2"><v>1</v></c></row>'),
        "Sheet1",
      ),
    ).toStrictEqual([new Map(), new Map([[0, 1]])]);
  });

  it("reads a kept string whole across its runs, and one of nothing as nothing", () => {
    const [row] = readSheet(
      oneSheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>',
        '<si><r><t>UK implied </t></r><r><t xml:space="preserve">spot curve</t></r></si><si><t/></si><si/>',
      ),
      "Sheet1",
    );

    expect(row).toStrictEqual(
      new Map([
        [0, "UK implied spot curve"],
        [1, ""],
        [2, ""],
      ]),
    );
  });

  it("reads the entities XML writes back as their characters, and leaves any other as written", () => {
    const [row] = readSheet(
      oneSheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="str"><v>&lt;&gt;&quot;&apos;</v></c></row>',
        "<si><t>Gilts &amp; linkers&nbsp;&constructor;</t></si>",
      ),
      "Sheet1",
    );

    expect(row).toStrictEqual(
      new Map([
        [0, "Gilts & linkers&nbsp;&constructor;"],
        [1, `<>"'`],
      ]),
    );
  });

  it("finds the sheet by a name written with an entity", () => {
    const workbook = workbookFrom({
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/workbook.xml":
        '<workbook><sheets><sheet name="Spot &amp; forward" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1"><v>2</v></c></row></sheetData></worksheet>',
    });

    expect(readSheet(workbook, "Spot & forward")).toStrictEqual([
      new Map([[0, 2]]),
    ]);
  });

  // BlackRock names its first sheet "Starting point " with a space
  // after it, which the tab gives no sign of.
  it("finds the sheet by its name with the spaces around it let go", () => {
    const workbook = workbookFrom({
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/workbook.xml":
        '<workbook><sheets><sheet name=" Starting point " sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1"><v>2</v></c></row></sheetData></worksheet>',
    });

    expect(readSheet(workbook, "Starting point")).toStrictEqual([
      new Map([[0, 2]]),
    ]);
  });

  it("reads a workbook keeping no strings", () => {
    const workbook = workbookFrom({
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/workbook.xml":
        '<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1"><v>2</v></c></row></sheetData></worksheet>',
    });

    expect(readSheet(workbook, "Sheet1")).toStrictEqual([new Map([[0, 2]])]);
  });

  // A refusal rather than a failure, since the screen says why.
  it("refuses a file that is no zip", () => {
    const read = (): unknown => readSheet(new Uint8Array([1, 2, 3]), "Sheet1");

    expect(read).toThrow(Refusal);
    expect(read).toThrow(new Refusal("The workbook is not a zip"));
  });

  it("refuses a workbook listing no sheet of the name", () => {
    expect(() => readSheet(oneSheet(""), "4. spot curve")).toThrow(
      new Refusal("The workbook has no sheet 4. spot curve"),
    );
  });

  it("refuses a workbook missing a part it names", () => {
    expect(() =>
      readSheet(
        workbookFrom({
          "xl/_rels/workbook.xml.rels": "<Relationships/>",
          "xl/workbook.xml":
            '<workbook><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>',
        }),
        "Sheet1",
      ),
    ).toThrow(
      new Refusal("The workbook does not say where its sheet Sheet1 is"),
    );
    expect(() =>
      readSheet(
        workbookFrom({
          "xl/_rels/workbook.xml.rels":
            '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
          "xl/workbook.xml":
            '<workbook><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>',
        }),
        "Sheet1",
      ),
    ).toThrow(new Refusal("The workbook has no xl/worksheets/sheet1.xml"));
    expect(() => readSheet(workbookFrom({}), "Sheet1")).toThrow(
      new Refusal("The workbook has no xl/workbook.xml"),
    );
  });

  it("refuses a cell naming a string the workbook does not keep", () => {
    expect(() =>
      readSheet(
        oneSheet(
          '<row r="1"><c r="A1" t="s"><v>1</v></c></row>',
          "<si><t>years:</t></si>",
        ),
        "Sheet1",
      ),
    ).toThrow(new Refusal("The workbook keeps no string 1"));
  });

  it("refuses a cell in no column", () => {
    expect(() =>
      readSheet(oneSheet('<row r="1"><c><v>1</v></c></row>'), "Sheet1"),
    ).toThrow(new Refusal("The workbook has a cell in no column it names"));
    expect(() =>
      readSheet(oneSheet('<row r="1"><c r="4"><v>1</v></c></row>'), "Sheet1"),
    ).toThrow(new Refusal("The workbook has a cell in no column it names"));
  });
});

describe("unzipped", () => {
  it("refuses a zip whose files say they unzip to more than 32 MB together", () => {
    const zip = zipSaying(
      { one: new Uint8Array(8), two: new Uint8Array(8) },
      16_000_001,
    );

    expect(() => unzipped(zip, "The file is not a zip")).toThrow(
      new Refusal(
        "The zip unzips to more than 32 MB, far past any file read from one",
      ),
    );
  });

  // A stored file is copied at its size in the zip, whatever it says
  // it unzips to, so forty entries pointing at one megabyte would copy
  // forty.
  it("counts a stored file at its size in the zip, for each entry pointing at it", () => {
    expect(() =>
      unzipped(
        storedListed(new Uint8Array(1_000_000), 40),
        "The file is not a zip",
      ),
    ).toThrow(
      new Refusal(
        "The zip unzips to more than 32 MB, far past any file read from one",
      ),
    );
  });

  it("refuses a zip listing more than 1,000 files", () => {
    const one = new Uint8Array([7]);

    expect(
      unzipped(storedListed(one, 1000), "The file is not a zip"),
    ).toStrictEqual({ part: one });
    expect(() =>
      unzipped(storedListed(one, 1001), "The file is not a zip"),
    ).toThrow(
      new Refusal(
        "The zip lists more than 1,000 files, far more than any read here",
      ),
    );
  });

  // The zip says its file unzips to a kilobyte, and it unzips to a
  // megabyte, as one built to fill the memory under a size it does not
  // say would.
  it("cuts a file unzipping to more than its zip says off at what it says", () => {
    const zip = zipSaying({ part: new Uint8Array(1_000_000) }, 1000);

    expect(unzipped(zip, "The file is not a zip")).toStrictEqual({
      part: new Uint8Array(1000),
    });
  });
});
