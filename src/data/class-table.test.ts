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
// the fixture leaves out that the household's taxonomy needs.
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
  // The household's Asset Allocation taxonomy as Portfolio Performance
  // names it, dots and all.
  it("suggests each of the household's categories onto its class", () => {
    expect(
      [
        "Developed World ex-U.K.",
        "S&P 500",
        "U.K All Share",
        "Emerging Markets",
        "Developed Europe ex-U.K.",
        "Japan",
        "S&P 400",
        "Pacific ex-Japan",
        "S&P 600",
        "FTSE North America",
        "FTSE 100",
        "Global Bonds",
        "U.K. Government Bond",
        "U.K. Inflation-Linked Gilt",
        "U.K. Investment Grade Bond",
      ].map((name) => [name, suggestedClass(name, august)]),
    ).toStrictEqual([
      ["Developed World ex-U.K.", "Global ex-UK large cap equities"],
      ["S&P 500", "US large cap equities"],
      ["U.K All Share", "UK large cap equities"],
      ["Emerging Markets", "Emerging large cap equities"],
      ["Developed Europe ex-U.K.", "Europe large cap equities"],
      ["Japan", "Japan large cap equities"],
      ["S&P 400", "US small cap equities"],
      ["Pacific ex-Japan", "Global ex-UK large cap equities"],
      ["S&P 600", "US small cap equities"],
      ["FTSE North America", "US large cap equities"],
      ["FTSE 100", "UK large cap equities"],
      ["Global Bonds", "Global aggregate bonds (GBP hedged)"],
      ["U.K. Government Bond", "UK gilts (all maturities)"],
      ["U.K. Inflation-Linked Gilt", "UK index-linked gilts (5+ year)"],
      ["U.K. Investment Grade Bond", "UK corporate bonds (all maturities)"],
    ]);
  });

  it("falls back to the next class where the vintage does not price the first", () => {
    expect(suggestedClass("Japan", without("Japan large cap equities"))).toBe(
      "Global ex-UK large cap equities",
    );
    expect(suggestedClass("S&P 600", without("US small cap equities"))).toBe(
      "Global small cap equities",
    );
    expect(
      suggestedClass(
        "Global Bonds",
        without("Global aggregate bonds (GBP hedged)"),
      ),
    ).toBe("Global aggregate bonds");
  });

  it("suggests nothing for a name the table does not hold, or whose classes the vintage prices none of", () => {
    expect(suggestedClass("Short-dated gilts", august)).toBeUndefined();
    expect(suggestedClass("Gold", august)).toBeUndefined();
    expect(
      suggestedClass(
        "Developed Europe ex-U.K.",
        without("Europe large cap equities"),
      ),
    ).toBeUndefined();
  });

  // A name held twice would be suggested onto whichever entry came
  // last, with nothing to say so.
  it("holds each name once", () => {
    expect(new Set(tableNames).size).toBe(tableNames.length);
  });
});

describe("suggestedMappings", () => {
  // FTSE North America asks for nothing and has no class; the rest of
  // the reference are mapped onto classes August prices.
  it("maps each category with no class onto its suggestion, and leaves a priced choice as it is", () => {
    const northAmerica = targets.categories.find(
      ({ name }) => name === "FTSE North America",
    );

    expect(suggestedMappings(august, targets, mappings)).toStrictEqual([
      { asset: "US large cap equities", category: northAmerica?.id },
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

  // The UK's two categories, UK equity and FTSE 100, both stand for the
  // UK All Share fund; the all-cap fund, by name, for the developed
  // world less the UK.
  it("finds every category standing for the fund of the SEDOL given, by name, with the fund's sleeve", () => {
    expect(standingFor("B3X7QG6", targets.categories)).toStrictEqual({
      categories: named("UK equity", "FTSE 100"),
      sleeve: "stocks",
    });
    expect(standingFor("B59G4Q7", targets.categories)).toStrictEqual({
      categories: named("FTSE Global All Cap ex-UK"),
      sleeve: "stocks",
    });
    expect(standingFor("B50W2R1", targets.categories)).toStrictEqual({
      categories: named("Global bonds, hedged"),
      sleeve: "bonds",
    });
  });

  // Europe is a fund of LifeStrategy's the reference has no category for.
  it("finds no category for a fund none stands for, and nothing for a SEDOL the table does not hold", () => {
    expect(standingFor("B5B71H8", targets.categories)).toStrictEqual({
      categories: [],
      sleeve: "stocks",
    });
    expect(standingFor("B000000", targets.categories)).toBeUndefined();
  });

  // A SEDOL held twice would give a fund two sets of categories, with
  // nothing to say so.
  it("holds each SEDOL once", () => {
    expect(new Set(tableSedols).size).toBe(tableSedols.length);
  });
});
