// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Quoted } from "@/lib/yield-curves.fixture";

import { Refusal } from "@/lib/answer";
import { workbookOf } from "@/lib/workbook.fixture";
import {
  bankFile,
  booksOf,
  maturities,
  quoted,
  spotSheetOf,
} from "@/lib/yield-curves.fixture";

import { readCurve } from "./yield-curves";

const [before, latest] = quoted;

// The Bank's file for the days quoted, with the workbooks given in
// place of the Bank's own.
function fileWith(
  books: Readonly<Record<string, Uint8Array | undefined>>,
  days: readonly Quoted[] = quoted,
): Uint8Array {
  return bankFile(
    Object.fromEntries(
      Object.entries({ ...booksOf(days), ...books }).flatMap(([name, book]) =>
        book === undefined ? [] : [[name, book]],
      ),
    ),
  );
}

// The implied curve's workbook, of the sheet given.
function impliedOf(sheet: ReturnType<typeof spotSheetOf>): {
  readonly "GLC Inflation daily data current month.xlsx": Uint8Array;
} {
  return {
    "GLC Inflation daily data current month.xlsx": workbookOf({
      "4. spot curve": sheet,
    }),
  };
}

describe("readCurve", () => {
  // The nominal sheet starts at 0.5 years and the others at 2.5, so a
  // rate paired with its column rather than its maturity would break
  // the difference and be refused.
  it("reads the latest day's implied curve at the plan's maturities, as fractions", () => {
    const curve = readCurve(fileWith({}));

    expect(curve.asOf).toBe("2026-09-01");
    expect(curve.implied[5]).toBeCloseTo(0.03512, 12);
    expect(curve.implied[10]).toBeCloseTo(0.03441, 12);
    expect(curve.implied[20]).toBeCloseTo(0.03365, 12);
    expect(curve.implied[30]).toBeCloseTo(0.03298, 12);
  });

  it("takes the latest day wherever its row falls", () => {
    expect(readCurve(fileWith({}, [latest, before])).asOf).toBe("2026-09-01");
  });

  // The Bank's header is on the fourth row; here it opens the sheet,
  // written as a hand might write it.
  it("finds the header of maturities wherever it has moved to", () => {
    const days = spotSheetOf(
      maturities,
      quoted.map(({ day, implied }) => [day, implied]),
    ).slice(4);
    const moved = [[" Years: ", ...maturities], ...days];

    expect(readCurve(fileWith(impliedOf(moved))).asOf).toBe("2026-09-01");
  });

  it("refuses a day nominal less real does not give the implied rate on", () => {
    const off = {
      ...latest,
      real: latest.real.map((rate, index) =>
        index === 4 ? rate + 0.0001 : rate,
      ),
    };

    expect(() =>
      readCurve(
        fileWith({
          "GLC Real daily data current month.xlsx": booksOf([before, off])[
            "GLC Real daily data current month.xlsx"
          ],
        }),
      ),
    ).toThrow(
      new Refusal(
        "Nominal less real is not the implied curve at 30 years on 2026-09-01",
      ),
    );
  });

  it("refuses an implied rate the nominal or real curve gives nothing for", () => {
    const shortReal = workbookOf({
      "4. spot curve": spotSheetOf(
        maturities.slice(0, -1),
        quoted.map(({ day, real }) => [day, real.slice(0, -1)]),
      ),
    });

    expect(() =>
      readCurve(
        fileWith({ "GLC Real daily data current month.xlsx": shortReal }),
      ),
    ).toThrow(
      new Refusal(
        "Nominal less real is not the implied curve at 40 years on 2026-09-01",
      ),
    );
  });

  // As a file caught part way through the day's update would be: the
  // day is missing, which is what the refusal says, rather than a
  // difference that does not hold.
  it("refuses a nominal or real curve with no row for the implied curve's latest day", () => {
    const books = booksOf([before]);

    expect(() =>
      readCurve(
        fileWith({
          "GLC Nominal daily data current month.xlsx":
            books["GLC Nominal daily data current month.xlsx"],
        }),
      ),
    ).toThrow(
      new Refusal("The GLC Nominal spot curve holds no row for 2026-09-01"),
    );
    expect(() =>
      readCurve(
        fileWith({
          "GLC Real daily data current month.xlsx":
            books["GLC Real daily data current month.xlsx"],
        }),
      ),
    ).toThrow(
      new Refusal("The GLC Real spot curve holds no row for 2026-09-01"),
    );
  });

  it("passes over a row whose day is no number", () => {
    const sheet = spotSheetOf(
      maturities,
      quoted.map(({ day, implied }) => [day, implied]),
    );
    const odd = [...sheet, [Number.NaN, ...maturities.map(() => 3)]];

    expect(readCurve(fileWith(impliedOf(odd))).asOf).toBe("2026-09-01");
  });

  it("refuses a curve missing a maturity the plan reads", () => {
    const gap = {
      ...latest,
      implied: latest.implied.map((rate, index) =>
        index === 3 ? undefined : rate,
      ),
    };

    expect(() => readCurve(fileWith({}, [before, gap]))).toThrow(
      new Refusal(
        "The implied inflation curve has no 20-year point on 2026-09-01",
      ),
    );
  });

  it("refuses an implied curve holding no day", () => {
    expect(() =>
      readCurve(fileWith(impliedOf(spotSheetOf(maturities, [])))),
    ).toThrow(new Refusal("The implied inflation curve holds no day"));
  });

  it("refuses a spot curve with no header of maturities", () => {
    expect(() =>
      readCurve(fileWith(impliedOf([["Maturity"], [46266, 3.4]]))),
    ).toThrow(new Refusal("The GLC Inflation spot curve has no years: row"));
  });

  it("refuses a file missing one of the three gilt workbooks", () => {
    expect(() =>
      readCurve(
        fileWith({ "GLC Real daily data current month.xlsx": undefined }),
      ),
    ).toThrow(new Refusal("The Bank's file holds no GLC Real workbook"));
  });

  // A refusal rather than a failure, since the screen says why.
  it("refuses a file that is no zip", () => {
    const read = (): unknown => readCurve(new Uint8Array([1, 2, 3]));

    expect(read).toThrow(Refusal);
    expect(read).toThrow(new Refusal("The Bank's file is not a zip"));
  });
});
