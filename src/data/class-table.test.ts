// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Cma } from "./cma";

import { suggestedClass, suggestedMappings, tableNames } from "./class-table";
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
