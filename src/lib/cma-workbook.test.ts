// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Cma, Risk } from "@/data/cma";
import type { Priced } from "@/lib/cma-workbook.fixture";

import { Refusal } from "@/lib/answer";
import {
  cmaFile,
  dated,
  priced,
  startingPointOf,
} from "@/lib/cma-workbook.fixture";
import { workbookOf } from "@/lib/workbook.fixture";

import { readCma } from "./cma-workbook";

// How far the class named strays in a vintage, or none for one it
// prices without a volatility or does not price at all.
function riskIn(cma: Cma, name: string): Risk | undefined {
  return cma.assets.find((asset) => asset.name === name)?.risk;
}

// The workbook of the reference rows with those given in their place,
// or left out where given nothing.
function withRows(
  rows: Readonly<Record<string, Priced | undefined>>,
): Uint8Array {
  return cmaFile(
    startingPointOf(
      priced.flatMap((row) => {
        if (!(row[2] in rows)) {
          return [row];
        }
        const replaced = rows[row[2]];
        return replaced === undefined ? [] : [replaced];
      }),
    ),
  );
}

describe("readCma", () => {
  it("reads the vintage, the day its data are as of, and sterling's equities and fixed income at 20 years, in order, with the classes carried in after them", () => {
    const cma = readCma(cmaFile());

    expect(cma.vintage).toStrictEqual({ month: 7, year: 2026 });
    expect(cma.asOf).toBe("2026-06-30");
    expect(cma.assets.map(({ name, sleeve }) => [name, sleeve])).toStrictEqual([
      ["US large cap equities", "stocks"],
      ["UK large cap equities", "stocks"],
      ["Emerging large cap equities", "stocks"],
      ["Global small cap equities", "stocks"],
      ["Global ex-UK large cap equities", "stocks"],
      ["UK index-linked gilts (5+ year)", "bonds"],
      ["UK cash", "bonds"],
      ["Global aggregate bonds", "bonds"],
      ["Global aggregate bonds (GBP hedged)", "bonds"],
      ["Japan large cap equities", "stocks"],
      ["US small cap equities", "stocks"],
    ]);
    expect(cma.assets[1]).toStrictEqual({
      name: "UK large cap equities",
      rate: 0.08156,
      risk: { bonds: -0.1, stocks: 0.8, volatility: 0.16 },
      sleeve: "stocks",
    });
  });

  // Japan's large caps are 0.567 of a point over US large caps in yen,
  // and US small caps 1.172 under them in dollars, so over sterling's
  // 8.015% they come to 8.582% and 6.843%.
  it("carries Japan's large caps in from the yen, and US small caps from the dollar, by their gap over US large caps", () => {
    const { assets } = readCma(cmaFile());
    const japan = assets.find(
      ({ name }) => name === "Japan large cap equities",
    );
    const small = assets.find(({ name }) => name === "US small cap equities");

    expect(japan).toMatchObject({ carriedFrom: "JPY", sleeve: "stocks" });
    expect(japan?.rate).toBeCloseTo(0.08582, 12);
    expect(small).toMatchObject({ carriedFrom: "USD", sleeve: "stocks" });
    expect(small?.rate).toBeCloseTo(0.06843, 12);
  });

  // A vintage pricing Japan in sterling, as May 2026's did, keeps its
  // own return and carries nothing in over it.
  it("carries in no class sterling prices itself", () => {
    const { assets } = readCma(
      cmaFile(
        startingPointOf([
          ...priced,
          ["GBP", "Equities", "Japan large cap equities", 0.075],
        ]),
      ),
    );
    const japan = assets.filter(
      ({ name }) => name === "Japan large cap equities",
    );

    expect(japan).toStrictEqual([
      {
        name: "Japan large cap equities",
        rate: 0.075,
        risk: { bonds: -0.1, stocks: 0.8, volatility: 0.16 },
        sleeve: "stocks",
      },
    ]);
  });

  // A sterling class with no return refuses the pull, so sterling's US
  // large caps are left out rather than blanked.
  it.each([
    ["the yen's US large caps", "JPY", "US large cap equities"],
    ["the yen's Japanese large caps", "JPY", "Japan large cap equities"],
  ])("carries Japan in only with a return for %s", (_, currency, name) => {
    const sheet = startingPointOf(
      priced.map((row) =>
        row[0] === currency && row[2] === name
          ? ([currency, "Equities", name, "n/a"] as const)
          : row,
      ),
    );

    expect(
      readCma(cmaFile(sheet)).assets.map(({ name: listed }) => listed),
    ).not.toContain("Japan large cap equities");
  });

  it("carries nothing in where sterling prices no US large caps", () => {
    const sheet = startingPointOf(
      priced.filter(
        ([currency, , name]) =>
          currency !== "GBP" || name !== "US large cap equities",
      ),
    );

    expect(
      readCma(cmaFile(sheet)).assets.some(
        ({ carriedFrom }) => carriedFrom !== undefined,
      ),
    ).toBe(false);
  });

  // The dollar-hedged 4.553% carried from 3.585% dollar cash to 3.574%
  // sterling cash, 0.011 of a point lower. Global ex-US treasuries is
  // hedged in dollars too, but sterling prices no class of that name.
  it("adds a sterling-hedged form after each class priced hedged in dollars, carried from dollar cash to sterling cash", () => {
    const hedged = readCma(cmaFile()).assets.find(
      ({ hedges }) => hedges !== undefined,
    );

    expect(hedged).toMatchObject({
      hedges: "Global aggregate bonds",
      name: "Global aggregate bonds (GBP hedged)",
      sleeve: "bonds",
    });
    expect(hedged?.rate).toBeCloseTo(0.04542, 12);
  });

  // UK large caps stray by 16%, with equities and a little against
  // government bonds; cash by nothing, its blank correlations read as
  // none; and the equities every class is correlated with move 0.05
  // against government bonds.
  it("reads each class's volatility, its correlations with government bonds and equities, and how the two move together", () => {
    const cma = readCma(cmaFile());

    expect(riskIn(cma, "UK large cap equities")).toStrictEqual({
      bonds: -0.1,
      stocks: 0.8,
      volatility: 0.16,
    });
    expect(riskIn(cma, "UK cash")).toStrictEqual({
      bonds: 0,
      stocks: 0,
      volatility: 0,
    });
    expect(cma.correlation).toBeCloseTo(-0.05, 15);
  });

  // The hedged form strays as the dollar-hedged row does, its currency
  // hedged away; Japan's large caps, carried in over US large caps, stray
  // as sterling's US large caps do.
  it("gives a hedged form the risk of the class hedged in dollars, and a class carried in that of US large caps in sterling", () => {
    const cma = readCma(cmaFile());

    expect(riskIn(cma, "Global aggregate bonds (GBP hedged)")).toStrictEqual({
      bonds: 0.9,
      stocks: 0,
      volatility: 0.035,
    });
    expect(riskIn(cma, "Japan large cap equities")).toStrictEqual({
      bonds: -0.12,
      stocks: 0.85,
      volatility: 0.185,
    });
  });

  // A volatility written as text is none, and a sheet without the blocks
  // gives no class a risk and says nothing of how the markets move
  // together, rather than refusing the pull.
  it("gives no risk to a class with no volatility, and none to any on a sheet without them", () => {
    const blanked = startingPointOf().map((row) =>
      row[2] === "UK large cap equities" ? row.with(12, "n/a") : row,
    );
    const bare = readCma(
      cmaFile(startingPointOf().map((row) => row.slice(0, 12))),
    );

    expect(
      riskIn(readCma(cmaFile(blanked)), "UK large cap equities"),
    ).toBeUndefined();
    expect(bare.assets.some(({ risk }) => risk !== undefined)).toBe(false);
    expect(bare).not.toHaveProperty("correlation");
  });

  // Government bonds retitled, so its column is not found: the
  // correlations with it are not read as nothing but as missing, and no
  // class carries a risk.
  it("gives no class a risk on a sheet missing either correlation's column", () => {
    const retitled = startingPointOf().map((row) =>
      row.map((cell) => (cell === "Government bonds" ? "Govt bonds" : cell)),
    );
    const cma = readCma(cmaFile(retitled));

    expect(cma.assets.some(({ risk }) => risk !== undefined)).toBe(false);
    expect(cma).not.toHaveProperty("correlation");
  });

  it.each(["UK cash ", "US cash"])(
    "adds no hedged form when %s is missing",
    (cash) => {
      const { assets } = readCma(withRows({ [cash]: undefined }));

      expect(assets.some(({ hedges }) => hedges !== undefined)).toBe(false);
      expect(assets.map(({ name }) => name)).toContain(
        "Global aggregate bonds",
      );
    },
  );

  // A dollar return priced as text is no return to carry, so the class
  // it hedges is left unhedged.
  it("adds no hedged form of a dollar return that is not a number", () => {
    const { assets } = readCma(
      withRows({
        "Global aggregate bonds (hedged)": [
          "USD",
          "Fixed income",
          "Global aggregate bonds (hedged)",
          "n/a",
        ],
      }),
    );

    expect(assets.some(({ hedges }) => hedges !== undefined)).toBe(false);
  });

  // The header is on BlackRock's third row; here it is further down,
  // under rows holding nothing in their first cell, and the block of
  // expected returns starts a column later than BlackRock's.
  it("finds the header and the block of expected returns wherever they have moved to", () => {
    const [title = [], line = [], header = [], ...rest] = startingPointOf();
    const moved = [
      [],
      [undefined, "Draft"],
      title,
      [line[0], undefined, undefined, undefined, undefined, "Expected returns"],
      header,
      ...rest,
    ];

    const cma = readCma(cmaFile(moved));

    expect(cma.vintage).toStrictEqual({ month: 7, year: 2026 });
    expect(cma.assets[1]?.rate).toBeCloseTo(0.08156, 12);
  });

  it("reads the expected return rather than the lower end of its range", () => {
    expect(readCma(cmaFile()).assets[1]?.rate).toBeCloseTo(0.08156, 12);
  });

  it("refuses a workbook with no starting point", () => {
    expect(() =>
      readCma(workbookOf({ "Strategic asset allocation": [] })),
    ).toThrow(new Refusal("The workbook has no sheet Starting point"));
  });

  it("refuses a sheet with no header headed Currency", () => {
    expect(() => readCma(cmaFile(startingPointOf().slice(0, 2)))).toThrow(
      new Refusal("The Starting point sheet has no header headed Currency"),
    );
  });

  it("refuses a sheet whose header has no row of labels above it", () => {
    expect(() => readCma(cmaFile(startingPointOf().slice(2)))).toThrow(
      new Refusal(
        "The Starting point sheet has no column headed Expected returns",
      ),
    );
  });

  it.each([
    [4, "Expected returns"],
    [1, "Asset class"],
    [2, "Asset"],
  ])("refuses a sheet with no column headed %s", (column, text) => {
    const sheet = startingPointOf().map((row, index) =>
      index === 1 || index === 2 ? row.with(column, undefined) : row,
    );

    expect(() => readCma(cmaFile(sheet))).toThrow(
      new Refusal(`The Starting point sheet has no column headed ${text}`),
    );
  });

  // The ranges' 20-year column follows the expected returns', and is
  // not taken in its place.
  it("refuses a block of expected returns with no 20-year column", () => {
    const sheet = startingPointOf().map((row, index) =>
      index === 2 ? row.with(6, "25 year") : row,
    );

    expect(() => readCma(cmaFile(sheet))).toThrow(
      new Refusal("The Starting point sheet has no column headed 20 year"),
    );
  });

  it("refuses a sterling equity or fixed income with no 20-year return", () => {
    const file = withRows({
      "UK cash ": ["GBP", "Fixed income", "UK cash ", undefined],
    });

    expect(() => readCma(file)).toThrow(
      new Refusal("The Starting point sheet gives UK cash no 20-year return"),
    );
  });

  // A private market's return is never read, so one missing is no
  // reason to refuse.
  it("reads a sheet whose private market has no return", () => {
    const file = withRows({
      "Hedge funds (global)": [
        "GBP",
        "Private markets",
        "Hedge funds (global)",
        undefined,
      ],
    });

    expect(readCma(file).assets).toHaveLength(11);
  });

  it("refuses a sheet pricing nothing a fund holds in sterling", () => {
    const sheet = startingPointOf(
      priced.filter(
        ([currency, kind]) => currency !== "GBP" || kind === "Private markets",
      ),
    );

    expect(() => readCma(cmaFile(sheet))).toThrow(
      new Refusal(
        "The Starting point sheet prices nothing a fund holds in GBP",
      ),
    );
  });

  it("refuses a sheet listing a sterling class twice", () => {
    const sheet = startingPointOf([
      ...priced,
      ["GBP", "Equities", "UK large cap equities ", 0.08],
    ]);

    expect(() => readCma(cmaFile(sheet))).toThrow(
      new Refusal(
        "The Starting point sheet lists UK large cap equities in GBP twice",
      ),
    );
  });

  // A row read in another currency is refused listed twice, as a
  // sterling class is, rather than one of the two taken: the dollar cash
  // a hedge is carried from, a return hedged to dollars, and the class
  // carried from each currency with the anchor it is carried over.
  it.each([
    { currency: "USD", name: "US cash" },
    { currency: "USD", name: "Global aggregate bonds (hedged)" },
    { currency: "USD", name: "US small cap equities" },
    { currency: "USD", name: "US large cap equities" },
    { currency: "JPY", name: "Japan large cap equities" },
    { currency: "JPY", name: "US large cap equities" },
  ])(
    "refuses a sheet listing $name in $currency twice",
    ({ currency, name }) => {
      const sheet = startingPointOf([
        ...priced,
        [currency, "Equities", name, 0.05],
      ]);

      expect(() => readCma(cmaFile(sheet))).toThrow(
        new Refusal(
          `The Starting point sheet lists ${name} in ${currency} twice`,
        ),
      );
    },
  );

  // A hedged return for a class sterling does not price, and a row of
  // euros, are never read, so either listed twice refuses nothing.
  it("takes a sheet listing twice a row it never reads", () => {
    const sheet = startingPointOf([
      ...priced,
      ["USD", "Fixed income", "Global ex-US treasuries (hedged)", 0.05],
      ["EUR", "Equities", "Europe large cap equities", 0.05],
    ]);

    expect(readCma(cmaFile(sheet))).toStrictEqual(readCma(cmaFile()));
  });

  it("refuses a sheet with no line dating its vintage", () => {
    expect(() =>
      readCma(cmaFile(startingPointOf(priced, "Capital Market Assumptions"))),
    ).toThrow(
      new Refusal("The Starting point sheet does not say which vintage it is"),
    );
  });

  it("refuses a vintage dated to no month", () => {
    expect(() =>
      readCma(
        cmaFile(startingPointOf(priced, dated.replace("August", "Agust"))),
      ),
    ).toThrow(
      new Refusal("The Starting point sheet dates its vintage to no month"),
    );
  });

  it("refuses data dated to a day the month does not have", () => {
    expect(() =>
      readCma(cmaFile(startingPointOf(priced, dated.replace("30", "31")))),
    ).toThrow(
      new Refusal("The Starting point sheet dates its data to no day there is"),
    );
  });
});
