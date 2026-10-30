// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Cma } from "./cma";

import {
  standingFor,
  suggestedClass,
  suggestedMappings,
  tableNames,
  tableSedols,
} from "./class-table";
import { cma, mappings } from "./cma.fixture";
import { targets } from "./targets.fixture";

// August's vintage as the fixture prices it, with the sterling classes
// the fixture leaves out that the taxonomy below needs.
const august: Cma = {
  ...cma,
  assets: [
    ...cma.assets,
    { name: "Europe large cap equities", rate: 0.07855, sleeve: "stocks" },
    { name: "UK gilts (all maturities)", rate: 0.04996, sleeve: "bonds" },
    {
      name: "UK corporate bonds (all maturities)",
      rate: 0.05961,
      sleeve: "bonds",
    },
  ],
};

// A vintage pricing none of the classes named.
function without(...names: readonly string[]): Cma {
  return {
    ...august,
    assets: august.assets.filter(({ name }) => !names.includes(name)),
  };
}

describe("suggestedClass", () => {
  // An Asset Allocation taxonomy as Portfolio Performance names it, dots
  // and all.
  it("suggests each of a taxonomy's categories onto its class", () => {
    expect(
      [
        "World ex-U.K.",
        "FTSE USA",
        "FTSE All-Share",
        "FTSE Emerging",
        "Europe ex-U.K.",
        "Japan",
        "S&P MidCap 400",
        "Asia Pacific ex-Japan",
        "US small cap",
        "North America",
        "UK equity",
        "Global Aggregate",
        "U.K. gilts",
        "Index-linked gilts",
        "Sterling corporate bonds",
      ].map((name) => [name, suggestedClass(name, august)]),
    ).toStrictEqual([
      ["World ex-U.K.", "Global ex-UK large cap equities"],
      ["FTSE USA", "US large cap equities"],
      ["FTSE All-Share", "UK large cap equities"],
      ["FTSE Emerging", "Emerging large cap equities"],
      ["Europe ex-U.K.", "Europe large cap equities"],
      ["Japan", "Japan large cap equities"],
      ["S&P MidCap 400", "US small cap equities"],
      ["Asia Pacific ex-Japan", "Global ex-UK large cap equities"],
      ["US small cap", "US small cap equities"],
      ["North America", "US large cap equities"],
      ["UK equity", "UK large cap equities"],
      ["Global Aggregate", "Global aggregate bonds (GBP hedged)"],
      ["U.K. gilts", "UK gilts (all maturities)"],
      ["Index-linked gilts", "UK index-linked gilts (5+ year)"],
      ["Sterling corporate bonds", "UK corporate bonds (all maturities)"],
    ]);
  });

  it("falls back to the next class where the vintage does not price the first", () => {
    expect(suggestedClass("Japan", without("Japan large cap equities"))).toBe(
      "Global ex-UK large cap equities",
    );
    expect(
      suggestedClass("US small cap", without("US small cap equities")),
    ).toBe("Global small cap equities");
    expect(
      suggestedClass(
        "Global Aggregate",
        without("Global aggregate bonds (GBP hedged)"),
      ),
    ).toBe("Global aggregate bonds");
  });

  it("suggests nothing for a name the table does not hold, or whose classes the vintage prices none of", () => {
    expect(suggestedClass("Short-dated gilts", august)).toBeUndefined();
    expect(suggestedClass("Gold", august)).toBeUndefined();
    expect(
      suggestedClass("Europe ex-U.K.", without("Europe large cap equities")),
    ).toBeUndefined();
  });

  // A name held twice would be suggested onto whichever entry came
  // last, with nothing to say so.
  it("holds each name once", () => {
    expect(new Set(tableNames).size).toBe(tableNames.length);
  });
});

describe("suggestedMappings", () => {
  // FTSE USA asks for nothing and has no class; the rest of the
  // reference are mapped onto classes August prices.
  it("maps each category with no class onto its suggestion, and leaves a priced choice as it is", () => {
    const usa = targets.categories.find(({ name }) => name === "FTSE USA");

    expect(suggestedMappings(august, targets, mappings)).toStrictEqual([
      { asset: "US large cap equities", category: usa?.id },
    ]);
  });

  // UK equity mapped onto Canada, which no vintage prices, and onto
  // Global small caps, a priced choice the table would not make.
  it("maps a category on a class the vintage does not price onto its suggestion, but not one on a priced class", () => {
    const ukEquity = targets.categories.find(
      ({ name }) => name === "UK equity",
    );
    const remapped = (asset: string): typeof mappings =>
      mappings.map((mapping) =>
        mapping.category === ukEquity?.id ? { ...mapping, asset } : mapping,
      );

    expect(
      suggestedMappings(august, targets, remapped("Canada large cap equities")),
    ).toContainEqual({
      asset: "UK large cap equities",
      category: ukEquity?.id,
    });
    expect(
      suggestedMappings(august, targets, remapped("Global small cap equities")),
    ).not.toContainEqual(expect.objectContaining({ category: ukEquity?.id }));
  });

  it("maps nothing the table holds no name for", () => {
    expect(
      suggestedMappings(august, targets, []).map(({ asset }) => asset),
    ).not.toContain("UK cash");
  });
});

describe("standingFor", () => {
  const named = (...names: readonly string[]): typeof targets.categories =>
    targets.categories.filter(({ name }) => names.includes(name));

  // The UK's two categories, UK equity and FTSE All-Share, both stand
  // for the UK All Share fund; the all-cap fund, by name, for the
  // developed world less the UK.
  it("finds every category standing for the fund of the SEDOL given, by name, with the fund's sleeve", () => {
    expect(standingFor("B3X7QG6", targets.categories)).toStrictEqual({
      categories: named("UK equity", "FTSE All-Share"),
      cuts: [],
      sleeve: "stocks",
    });
    expect(standingFor("B59G4Q7", targets.categories)).toStrictEqual({
      categories: named("FTSE Global All Cap ex-UK"),
      cuts: [],
      sleeve: "stocks",
    });
    expect(standingFor("B50W2R1", targets.categories)).toStrictEqual({
      categories: named("Global bonds, hedged"),
      cuts: [],
      sleeve: "bonds",
    });
  });

  // Europe is a fund of LifeStrategy's the reference has no category for.
  it("finds no category for a fund none stands for, and nothing for a SEDOL the table does not hold", () => {
    expect(standingFor("B5B71H8", targets.categories)).toStrictEqual({
      categories: [],
      cuts: [],
      sleeve: "stocks",
    });
    expect(standingFor("B000000", targets.categories)).toBeUndefined();
  });

  // The US market fund's index is cut into the S&P 500, MidCap 400 and
  // SmallCap 600: FTSE USA renamed the first and global small caps the
  // second, by its longer name, stand for theirs, at their market caps
  // in millions of dollars, and no category stands for the third. A
  // category for US small caps stands for the second and the third.
  it("finds the categories standing for each cut of a fund's index, by name, with its market cap", () => {
    const renamed = (small: string): typeof targets.categories => {
      const names = new Map([
        ["FTSE USA", "S&P 500"],
        ["Global small cap", small],
      ]);
      return targets.categories.map((category) => ({
        ...category,
        name: names.get(category.name) ?? category.name,
      }));
    };
    const cutsOf = (
      categories: typeof targets.categories,
    ): readonly (readonly [readonly string[], number])[] =>
      (standingFor("B5B71Q7", categories)?.cuts ?? []).map(
        ({ cap, categories: standing }) => [
          standing.map(({ name }) => name),
          cap,
        ],
      );

    expect(cutsOf(renamed("S&P MidCap 400"))).toStrictEqual([
      [["S&P 500"], 68_828_211.97],
      [["S&P MidCap 400"], 3_788_135.2],
      [[], 1_942_867.17],
    ]);
    expect(cutsOf(renamed("US small cap"))).toStrictEqual([
      [["S&P 500"], 68_828_211.97],
      [["US small cap"], 3_788_135.2],
      [["US small cap"], 1_942_867.17],
    ]);
  });

  // A SEDOL held twice would give a fund two sets of categories, with
  // nothing to say so.
  it("holds each SEDOL once", () => {
    expect(new Set(tableSedols).size).toBe(tableSedols.length);
  });
});
