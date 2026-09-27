// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Refusal } from "@/lib/answer";
import { workbookFrom, workbookOf } from "@/lib/workbook.fixture";

import { readSheet } from "./workbook";

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
