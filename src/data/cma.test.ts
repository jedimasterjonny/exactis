// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Blend, Cma, DerivedSet, Mapping } from "./cma";
import type { Targets } from "./targets";

import {
  blendsOf,
  cmaRates,
  derivedSet,
  riskOf,
  spreadOf,
  stocksMoved,
  vintageMonth,
  vintageName,
} from "./cma";
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

describe("derivedSet", () => {
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

  // Four fifths of the reference blend into stocks and a fifth into
  // bonds.
  it("derives the rates from the latest vintage's blends, with the curve's inflation, and the split from the target allocation's", () => {
    const derived = derivedSet(sources);

    expect(derived).toMatchObject({
      rates: cmaRates(blended(), sources.deductions, inflationOf(curve).rate),
    });
    expect("short" in derived ? null : derived.allocation.stocks).toBeCloseTo(
      0.8,
      12,
    );
  });

  // All in UK equities, the plan holds everything in stocks, and bonds'
  // rate is stocks' return in all less the fees, which weighs nothing.
  it("derives a set for an allocation with nothing in one sleeve, splitting everything into the other", () => {
    const derived = derivedSet({ ...sources, targets: onlyIn("UK equity") });
    const all = "short" in derived ? null : derived;

    expect(all?.allocation.stocks).toBeCloseTo(1, 12);
    expect(all?.rates.bonds).toBeCloseTo(0.08156 - 0.002, 12);
    expect(all?.rates.stocks).toBeCloseTo(0.08156 - 0.002 - 0.02, 12);
  });

  it("derives none before a vintage or a curve is pulled, or while the vintage makes no blend", () => {
    expect(derivedSet({ ...sources, cma: null })).toStrictEqual({
      short: "No CMA is pulled",
    });
    expect(derivedSet({ ...sources, curve: null })).toStrictEqual({
      short: "No inflation curve is pulled",
    });
    expect(derivedSet({ ...sources, targets: null })).toStrictEqual({
      short: "No target allocation is imported to weight the CMA by",
    });
  });
});

describe("riskOf", () => {
  // The blends' risk under the allocation given, or a failure naming
  // why there is none.
  function risked(
    allocation: Targets,
    vintage: Cma = cma,
  ): ReturnType<typeof riskOf> {
    return riskOf(vintage, blended(vintage, allocation));
  }

  // Half in UK equities at 16% and half in the equities every class is
  // correlated with, at 19%, which UK equities move with by their own
  // 0.8: 0.25 × 0.16² + 0.25 × 0.19² + 2 × 0.25 × 0.16 × 0.19 × 0.8 is
  // 0.027585, 16.61% a year, under the 17.5% of the two apart. Nothing
  // is in bonds, so they stray by nothing and move with nothing.
  it("blends a sleeve's classes by their weights and how far they move together", () => {
    expect(
      risked(onlyIn("UK equity", "FTSE Global All Cap ex-UK")),
    ).toStrictEqual({ bonds: 0, correlation: 0, stocks: Math.sqrt(0.027585) });
  });

  // FTSE 100 and UK equity are both mapped onto UK equities, which move
  // wholly with themselves, so the two stray by UK equities' 16%.
  it("blends a class two categories are mapped onto as one", () => {
    expect(risked(onlyIn("FTSE 100", "UK equity"))).toMatchObject({
      stocks: 0.16,
    });
  });

  // UK equities' correlations of -0.1 and 0.8 work back, through the
  // -0.05 between government bonds and equities, to -0.0602 of the one
  // and 0.7970 of the other; hedged bonds' 0.9 and nothing to 0.9023
  // and 0.0451. Met, -0.0602 × 0.9023 + 0.7970 × 0.0451 - 0.05 ×
  // (-0.0602 × 0.0451 + 0.7970 × 0.9023), they move -0.0541 together.
  it("correlates the sleeves by what their classes share of government bonds and equities", () => {
    const risk = risked(onlyIn("UK equity", "Global bonds, hedged"));

    expect(risk).toMatchObject({ bonds: 0.035, stocks: 0.16 });
    expect("correlation" in risk && risk.correlation).toBeCloseTo(
      -0.0541353,
      6,
    );
  });

  // Two classes each wholly with government bonds and wholly against
  // equities, or the other way about, are read as a class and its
  // opposite, which the -0.05 between the two pushes past wholly against
  // each other: -1.90. Half each in one sleeve would stray by less than
  // nothing, and one in each sleeve would move together more than wholly
  // against each other.
  it("holds a sleeve to straying by nothing at the least, and the sleeves to moving together no more than wholly", () => {
    // The vintage with the classes named straying 10% a year, wholly
    // with government bonds and against equities at one of them, and the
    // other way about at the other.
    const opposing = (towards: string, away: string): Cma => ({
      ...cma,
      assets: cma.assets.map((asset) => {
        const bonds = { [away]: -1, [towards]: 1 }[asset.name];
        return bonds === undefined
          ? asset
          : { ...asset, risk: { bonds, stocks: -bonds, volatility: 0.1 } };
      }),
    });

    expect(
      risked(
        onlyIn("UK equity", "FTSE Global All Cap ex-UK"),
        opposing("UK large cap equities", "Global ex-UK large cap equities"),
      ),
    ).toMatchObject({ correlation: 0, stocks: 0 });
    expect(
      risked(
        onlyIn("UK equity", "Global bonds, hedged"),
        opposing(
          "UK large cap equities",
          "Global aggregate bonds (GBP hedged)",
        ),
      ),
    ).toStrictEqual({ bonds: 0.1, correlation: -1, stocks: 0.1 });
  });

  it("correlates a sleeve that strays by nothing with nothing", () => {
    expect(risked(onlyIn("Global bonds, hedged"))).toStrictEqual({
      bonds: 0.035,
      correlation: 0,
      stocks: 0,
    });
  });

  it("gives none for a vintage pulled before its volatilities were read, while a class blended carries none, or while the vintage does not say how bonds and equities move together", () => {
    const unread: Cma = {
      asOf: cma.asOf,
      assets: cma.assets.map(({ name, rate, sleeve }) => ({
        name,
        rate,
        sleeve,
      })),
      vintage: cma.vintage,
    };
    const ukUnrisked: Cma = {
      ...cma,
      assets: cma.assets.map((asset) =>
        asset.name === "UK large cap equities"
          ? { name: asset.name, rate: asset.rate, sleeve: asset.sleeve }
          : asset,
      ),
    };
    const uncorrelated: Cma = {
      asOf: cma.asOf,
      assets: cma.assets,
      vintage: cma.vintage,
    };

    expect(risked(onlyIn("FTSE 100", "UK equity"), unread)).toStrictEqual({
      short: "The August 2026 CMA was pulled before its volatilities were read",
    });
    expect(risked(onlyIn("FTSE 100", "UK equity"), ukUnrisked)).toStrictEqual({
      short: "The August 2026 CMA gives UK large cap equities no volatility",
    });
    expect(risked(onlyIn("UK equity"), uncorrelated)).toStrictEqual({
      short:
        "The August 2026 CMA does not say how bonds and equities move together",
    });
  });
});

describe("spreadOf", () => {
  const vintages = { latest: cma, previous: null };

  // Stocks at 6% and a 2% yield, 8% in all, bonds at 4%, prices at 3%.
  const rates = { bonds: 0.04, dividends: 0.02, inflation: 0.03, stocks: 0.06 };

  // The split given, on the rates above.
  function live(stocks: number): DerivedSet {
    return { allocation: { stocks }, rates };
  }

  // Half in UK equities at 16% and half in hedged bonds at 3.5%, moving
  // -0.0541 together: 0.25 × 0.16² + 0.25 × 0.035² + 2 × 0.25 × -0.0541
  // × 0.16 × 0.035, a portfolio straying 8.10% a year about the 6% the
  // split makes, which in logs is 7.60%. All in stocks, the stocks' 16%
  // about 8% is 14.58% in logs, and prices' standing 2% about 3% is
  // 1.94% in logs either way.
  it("spreads the plan rate as far as the portfolio strays in the split it runs on, and prices by the standing figure, each in logs", () => {
    const sources = {
      cma: vintages,
      mappings,
      targets: onlyIn("UK equity", "Global bonds, hedged"),
    };
    const halved = spreadOf(sources, live(0.5));
    const stocked = spreadOf(sources, live(1));

    expect("rate" in halved && halved.rate).toBeCloseTo(0.0760476, 6);
    expect("rate" in stocked && stocked.rate).toBeCloseTo(0.1458034, 6);
    expect("inflation" in stocked && stocked.inflation).toBeCloseTo(
      0.019412,
      6,
    );
  });

  it("spreads nothing before a vintage is pulled, while it makes no blend or gives no risk, or while the plan holds what the target allocation does not", () => {
    const unread: Cma = {
      asOf: cma.asOf,
      assets: cma.assets.map(({ name, rate, sleeve }) => ({
        name,
        rate,
        sleeve,
      })),
      vintage: cma.vintage,
    };

    expect(spreadOf({ cma: null, mappings, targets }, live(0.8))).toStrictEqual(
      { short: "No CMA is pulled" },
    );
    expect(
      spreadOf({ cma: vintages, mappings, targets: null }, live(0.8)),
    ).toStrictEqual({
      short: "No target allocation is imported to weight the CMA by",
    });
    expect(
      spreadOf(
        {
          cma: { latest: unread, previous: null },
          mappings,
          targets: onlyIn("UK equity"),
        },
        live(1),
      ),
    ).toStrictEqual({
      short: "The August 2026 CMA was pulled before its volatilities were read",
    });
    expect(
      spreadOf(
        { cma: vintages, mappings, targets: onlyIn("Global bonds, hedged") },
        live(0.6),
      ),
    ).toStrictEqual({
      short:
        "The plan holds stocks the target allocation holds none of, so nothing says how far they stray",
    });
    expect(
      spreadOf(
        { cma: vintages, mappings, targets: onlyIn("UK equity") },
        live(0.6),
      ),
    ).toStrictEqual({
      short:
        "The plan holds bonds the target allocation holds none of, so nothing says how far they stray",
    });
  });
});

describe("stocksMoved", () => {
  // May's vintage with every class returning a tenth of a point more,
  // and one with no UK large cap equities at all.
  const may = {
    ...cma,
    assets: cma.assets.map((asset) => ({ ...asset, rate: asset.rate + 0.001 })),
    vintage: { month: 4, year: 2026 },
  };
  const unpriced = {
    ...may,
    assets: may.assets.filter(({ name }) => name !== "UK large cap equities"),
  };

  it("gives the move in stocks' return in all from the previous vintage to the latest", () => {
    expect(
      stocksMoved({ latest: cma, previous: may }, targets, mappings),
    ).toBeCloseTo(-0.001, 12);
  });

  // All in bonds, stocks stand in at bonds' return, which says nothing
  // of how stocks moved.
  it("gives none while nothing blends into stocks", () => {
    expect(
      stocksMoved(
        { latest: cma, previous: may },
        onlyIn("Short-dated gilts"),
        mappings,
      ),
    ).toBeNull();
  });

  it("gives none before a second vintage, or while either makes no blend", () => {
    expect(
      stocksMoved({ latest: cma, previous: null }, targets, mappings),
    ).toBeNull();
    expect(
      stocksMoved({ latest: cma, previous: unpriced }, targets, mappings),
    ).toBeNull();
    expect(
      stocksMoved({ latest: unpriced, previous: cma }, targets, mappings),
    ).toBeNull();
  });
});

describe("vintageMonth", () => {
  it("names a vintage by its month cut short and its year", () => {
    expect(vintageMonth(cma)).toBe("Aug 2026");
  });
});

describe("vintageName", () => {
  it("names a vintage by its month in full and its year", () => {
    expect(vintageName(cma)).toBe("August 2026");
  });
});
