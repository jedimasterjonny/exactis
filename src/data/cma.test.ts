// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Blend, Cma, Mapping } from "./cma";
import type { Targets } from "./targets";

import { blendsOf, cmaRates, derivedRates, vintageName } from "./cma";
import { cma, mappings } from "./cma.fixture";
import { inflationOf } from "./inflation";
import { curve } from "./inflation.fixture";
import { targets } from "./targets.fixture";

// The blends the vintage, allocation and mappings given make, the
// reference ones unless given, or a failure naming why they make none.
function blended(
  vintage: Cma = cma,
  allocation: Targets = targets,
  mapped: readonly Mapping[] = mappings,
): { readonly bonds: Blend; readonly stocks: Blend } {
  const blends = blendsOf(vintage, allocation, mapped);
  if ("short" in blends) {
    throw new Error(blends.short);
  }
  return blends;
}

// The reference allocation with every category's share moved into the
// named ones, split evenly.
function onlyIn(...names: readonly string[]): Targets {
  return {
    ...targets,
    categories: targets.categories.map((category) => ({
      ...category,
      share: names.includes(category.name) ? 1 / names.length : 0,
    })),
  };
}

// The reference mappings with the named categories' taken off, or
// moved onto the class given.
function remapped(
  classes: Readonly<Record<string, null | string>>,
): readonly Mapping[] {
  return targets.categories.flatMap(({ id, name }) => {
    const mapped = mappings.find(({ category }) => category === id);
    if (!(name in classes)) {
      return mapped === undefined ? [] : [mapped];
    }
    const asset = classes[name] ?? null;
    return asset === null ? [] : [{ asset, category: id }];
  });
}

describe("blendsOf", () => {
  // Equities are four fifths of the whole, at 60/15/15/10 of the sleeve:
  // 7.722%, 9.256%, 8.156% and 7.991% blend to 8.0441%. Nothing is
  // hedged among them.
  it("blends each sleeve's classes by the categories' shares of it", () => {
    const { stocks } = blended();

    expect(stocks.share).toBeCloseTo(0.8, 12);
    expect(stocks.rate).toBeCloseTo(0.080441, 12);
    expect(stocks.hedging).toBe(0);
    expect(
      stocks.parts.map(({ asset, category, weight }) => [
        category.name,
        asset.name,
        weight,
      ]),
    ).toStrictEqual([
      [
        "FTSE Global All Cap ex-UK",
        "Global ex-UK large cap equities",
        expect.closeTo(0.6, 12),
      ],
      [
        "Global emerging markets",
        "Emerging large cap equities",
        expect.closeTo(0.15, 12),
      ],
      ["UK equity", "UK large cap equities", expect.closeTo(0.15, 12)],
      [
        "Global small cap",
        "Global small cap equities",
        expect.closeTo(0.1, 12),
      ],
    ]);
  });

  // Bonds are a fifth at 70/20/10: the hedged global bonds at the
  // unhedged 4.563%, the linkers at 4.570% and cash at 3.574% blend to
  // 4.4655%, and hedging takes 70% of the 0.021 points it costs, 0.0147.
  it("blends a hedged class at the return of the class it hedges, keeping the hedging apart", () => {
    const { bonds } = blended();

    expect(bonds.share).toBeCloseTo(0.2, 12);
    expect(bonds.rate).toBeCloseTo(0.044655, 12);
    expect(bonds.hedging).toBeCloseTo(-0.000147, 12);
    expect(bonds.rate + bonds.hedging).toBeCloseTo(0.044508, 12);
  });

  // FTSE 100 is mapped and FTSE North America is not, and neither asks
  // for anything, so neither blends and neither stops the blend.
  it("leaves out a category asking for nothing, mapped or not", () => {
    const { stocks } = blended();

    expect(stocks.parts.map(({ category }) => category.name)).not.toContain(
      "FTSE 100",
    );
  });

  // A class hedging one the vintage does not price is blended at its
  // own return, with no adjustment, rather than at nothing.
  it("blends a hedged class at its own return when the class it hedges is missing", () => {
    const unpriced = {
      ...cma,
      assets: cma.assets.filter(
        ({ name }) => name !== "Global aggregate bonds",
      ),
    };
    const { bonds } = blended(unpriced);

    expect(bonds.hedging).toBe(0);
    expect(bonds.rate).toBeCloseTo(0.044508, 12);
  });

  it("makes no blend without a target allocation", () => {
    expect(blendsOf(cma, null, mappings)).toStrictEqual({
      short: "No target allocation is imported to weight the CMA by",
    });
  });

  it("names the categories asking for a share that are mapped onto no class", () => {
    expect(
      blendsOf(cma, targets, remapped({ "UK equity": null })),
    ).toStrictEqual({ short: "UK equity has no CMA class" });
    expect(
      blendsOf(
        cma,
        targets,
        remapped({ "Global small cap": null, "UK equity": null }),
      ),
    ).toStrictEqual({
      short: "UK equity and Global small cap have no CMA class",
    });
  });

  it("names the categories mapped onto a class the vintage does not price", () => {
    expect(
      blendsOf(
        cma,
        targets,
        remapped({ "UK equity": "Canada large cap equities" }),
      ),
    ).toStrictEqual({
      short:
        "UK equity is mapped onto a class the August 2026 CMA does not price",
    });
    expect(
      blendsOf(
        cma,
        targets,
        remapped({
          "Global small cap": "Australia large cap equities",
          "UK equity": "Canada large cap equities",
        }),
      ),
    ).toStrictEqual({
      short:
        "UK equity and Global small cap are mapped onto a class the August 2026 CMA does not price",
    });
  });

  // A category with no class is named before one whose class is gone,
  // since mapping it is the first thing to do.
  it("names the categories with no class before those whose class is not priced", () => {
    expect(
      blendsOf(
        cma,
        targets,
        remapped({
          "Global small cap": null,
          "UK equity": "Canada large cap equities",
        }),
      ),
    ).toStrictEqual({ short: "Global small cap has no CMA class" });
  });

  // UK equity alone is all in equities, at UK large caps' 8.156%, and
  // short-dated gilts alone all in bonds, at cash's 3.574%.
  it("stands a sleeve nothing blends into in at the other's return, with no parts and none of the whole", () => {
    const equities = blended(cma, onlyIn("UK equity"));
    const bonds = blended(cma, onlyIn("Short-dated gilts"));

    expect(equities.stocks.share).toBeCloseTo(1, 12);
    expect(equities.stocks.rate).toBeCloseTo(0.08156, 12);
    expect(equities.bonds).toStrictEqual({
      ...equities.stocks,
      parts: [],
      share: 0,
    });
    expect(bonds.bonds.rate).toBeCloseTo(0.03574, 12);
    expect(bonds.stocks).toStrictEqual({ ...bonds.bonds, parts: [], share: 0 });
  });

  it("makes no blend when nothing asks for a share", () => {
    expect(blendsOf(cma, onlyIn(), mappings)).toStrictEqual({
      short: "Nothing in the target allocation asks for a share",
    });
  });

  // Global bonds mapped onto UK equities blend into stocks however the
  // taxonomy files them, since the class says the sleeve.
  it("blends a category into the sleeve of the class it is mapped onto", () => {
    const { bonds, stocks } = blended(
      cma,
      onlyIn("UK equity", "Global bonds, hedged", "Short-dated gilts"),
      remapped({ "Global bonds, hedged": "UK large cap equities" }),
    );

    expect(stocks.share).toBeCloseTo(2 / 3, 12);
    expect(bonds.share).toBeCloseTo(1 / 3, 12);
  });
});

describe("cmaRates", () => {
  // Stocks 8.0441% less 0.20% of fees and the 2.00% yield split out
  // grow at 5.8441%, bonds 4.4508% less the fees at 4.2508%.
  it("takes the fees off each sleeve's return in all, and the yield off stocks' as their dividend yield", () => {
    const rates = cmaRates(blended(), { dividends: 0.02, fees: 0.002 }, 0.0295);

    expect(rates.stocks).toBeCloseTo(0.058441, 12);
    expect(rates.dividends).toBeCloseTo(0.02, 12);
    expect(rates.bonds).toBeCloseTo(0.042508, 12);
    expect(rates.inflation).toBeCloseTo(0.0295, 12);
  });
});

describe("derivedRates", () => {
  // What the reference household derives from: August's vintage, the
  // first of September's curve, its allocation and mappings, and 0.20%
  // of fees and a 2% yield.
  const sources = {
    cma: { latest: cma, previous: null },
    curve,
    deductions: { dividends: 0.02, fees: 0.002 },
    mappings,
    targets,
  };

  it("derives the rates from the latest vintage's blends, with the curve's inflation", () => {
    expect(derivedRates(sources)).toStrictEqual(
      cmaRates(blended(), sources.deductions, inflationOf(curve).rate),
    );
  });

  it("derives none before a vintage or a curve is pulled, or while the vintage makes no blend", () => {
    expect(derivedRates({ ...sources, cma: null })).toStrictEqual({
      short: "No CMA is pulled",
    });
    expect(derivedRates({ ...sources, curve: null })).toStrictEqual({
      short: "No inflation curve is pulled",
    });
    expect(derivedRates({ ...sources, targets: null })).toStrictEqual({
      short: "No target allocation is imported to weight the CMA by",
    });
  });
});

describe("vintageName", () => {
  it("names a vintage by its month in full and its year", () => {
    expect(vintageName(cma)).toBe("August 2026");
  });
});
