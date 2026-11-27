// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AccountGrowth, Blend, Cma, DerivedSet, Mapping } from "./cma";
import type { Targets } from "./targets";

import {
  accountGrowthOf,
  accountTargetsOf,
  blendsOf,
  cmaRates,
  derivedSet,
  rebalancingOf,
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

// August's vintage as one pulled before volatilities were read: every
// class at its return, with no risk, and no correlation between
// government bonds and equities.
const unread: Cma = {
  asOf: cma.asOf,
  assets: cma.assets.map(({ name, rate, sleeve }) => ({ name, rate, sleeve })),
  vintage: cma.vintage,
};

// The vintage pricing no global bonds, hedged or not, so nothing stands
// in for bonds the target allocation holds none of.
const unbonded: Cma = {
  ...cma,
  assets: cma.assets.filter(
    ({ name }) => !name.startsWith("Global aggregate bonds"),
  ),
};

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
        category?.name,
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

  // FTSE All-Share is mapped and FTSE USA is not, and neither asks
  // for anything, so neither blends and neither stops the blend.
  it("leaves out a category asking for nothing, mapped or not", () => {
    const { stocks } = blended();

    expect(stocks.parts.map(({ category }) => category?.name)).not.toContain(
      "FTSE All-Share",
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
      short: "No target allocation is synced to weight the CMA by",
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

  // UK equity alone is all in equities, at UK large caps' 8.156%, with
  // bonds standing in at hedged global bonds: 4.563% before the hedging,
  // which takes 0.021 of a point off.
  it("stands bonds nothing blends into in at hedged global bonds, the whole of the sleeve and none of the whole", () => {
    const hedged = cma.assets.find(
      ({ name }) => name === "Global aggregate bonds (GBP hedged)",
    );
    const { bonds, stocks } = blended(cma, onlyIn("UK equity"));

    expect(stocks.share).toBeCloseTo(1, 12);
    expect(stocks.rate).toBeCloseTo(0.08156, 12);
    expect(bonds).toStrictEqual({
      hedging: (hedged?.rate ?? 0) - 0.04563,
      parts: [{ asset: hedged, weight: 1 }],
      rate: 0.04563,
      share: 0,
    });
  });

  // A vintage pricing no hedged form stands bonds in at the unhedged
  // class's 4.563%, with nothing for hedging.
  it("stands bonds in at unhedged global bonds where the vintage prices no hedged form", () => {
    const unhedged = cma.assets.find(
      ({ name }) => name === "Global aggregate bonds",
    );
    const { bonds } = blended(
      {
        ...cma,
        assets: cma.assets.filter(
          ({ name }) => name !== "Global aggregate bonds (GBP hedged)",
        ),
      },
      onlyIn("UK equity"),
    );

    expect(bonds).toStrictEqual({
      hedging: 0,
      parts: [{ asset: unhedged, weight: 1 }],
      rate: 0.04563,
      share: 0,
    });
  });

  // The hedged class giving no volatility while others give one, the
  // unhedged class stands in; neither giving one, nothing does, and
  // bonds stand in at stocks' return. A vintage pulled before any
  // volatility was read stands in at the hedged class all the same.
  it("stands bonds in only at a class saying how far it strays, where the vintage says it of any", () => {
    const unrisked = (...names: readonly string[]): Cma => ({
      ...cma,
      assets: cma.assets.map((asset) =>
        names.includes(asset.name)
          ? { name: asset.name, rate: asset.rate, sleeve: asset.sleeve }
          : asset,
      ),
    });
    const standIn = (vintage: Cma): string | undefined =>
      blended(vintage, onlyIn("UK equity")).bonds.parts[0]?.asset.name;

    expect(standIn(unrisked("Global aggregate bonds (GBP hedged)"))).toBe(
      "Global aggregate bonds",
    );
    expect(
      standIn(
        unrisked(
          "Global aggregate bonds (GBP hedged)",
          "Global aggregate bonds",
        ),
      ),
    ).toBeUndefined();
    expect(standIn(unread)).toBe("Global aggregate bonds (GBP hedged)");
  });

  // With no global bonds priced, UK equity alone stands bonds in at UK
  // large caps' 8.156%; short-dated gilts alone is all in bonds, at
  // cash's 3.574%, and stocks stand in at that.
  it("stands a sleeve nothing blends into in at the other's return, with no parts and none of the whole, where no class stands in for it", () => {
    const equities = blended(unbonded, onlyIn("UK equity"));
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
  // bonds, and rebalancing earns the portfolio's term over the blend,
  // 0.398 of a point.
  it("derives the rates from the latest vintage's blends, with the curve's inflation, the split from the target allocation's, and what rebalancing earns from the vintage's risk", () => {
    const derived = derivedSet(sources);
    const risk = riskOf(cma, blended());

    expect(derived).toMatchObject({
      rates: cmaRates(blended(), sources.deductions, inflationOf(curve).rate),
      rebalancing: expect.closeTo(0.0039837, 7) as unknown,
    });
    expect("short" in derived ? null : derived.allocation.stocks).toBeCloseTo(
      0.8,
      12,
    );
    expect("short" in derived ? null : derived.rebalancing).toBe(
      "short" in risk ? null : rebalancingOf(blended(), risk).portfolio,
    );
  });

  // All in UK equities, the plan holds everything in stocks, and bonds'
  // rate is hedged global bonds' 4.542% in all less the fees, which
  // weighs nothing; one class in each sleeve, nothing is rebalanced, and
  // nothing earned.
  it("derives a set for an allocation with nothing in one sleeve, splitting everything into the other", () => {
    const derived = derivedSet({ ...sources, targets: onlyIn("UK equity") });
    const all = "short" in derived ? null : derived;

    expect(all?.allocation.stocks).toBeCloseTo(1, 12);
    expect(all?.rates.bonds).toBeCloseTo(0.04542 - 0.002, 12);
    expect(all?.rates.stocks).toBeCloseTo(0.08156 - 0.002 - 0.02, 12);
    expect(all?.rebalancing).toBe(0);
  });

  // At the glide path's 60/40 the rates are blended as they were, and
  // rebalancing earns what it does between the sleeves in those shares.
  it("derives the rates as blended at a split given in place of the target allocation's, and what rebalancing earns at it", () => {
    const derived = derivedSet(sources, { stocks: 0.6 });
    const [bonds, stocks] = [blended().bonds, blended().stocks];
    const risk = riskOf(cma, blended());

    expect(derived).toMatchObject({
      allocation: { stocks: 0.6 },
      rates: cmaRates(blended(), sources.deductions, inflationOf(curve).rate),
    });
    expect("short" in derived ? null : derived.rebalancing).toBe(
      "short" in risk
        ? null
        : rebalancingOf(
            {
              bonds: { ...bonds, share: 0.4 },
              stocks: { ...stocks, share: 0.6 },
            },
            risk,
          ).portfolio,
    );
  });

  // All in UK equities, nothing says what the 40% the glide path holds
  // in bonds returns; all in stocks, it holds nothing in them.
  it("derives the bonds a split holds at the class standing in for them where the target allocation holds none", () => {
    const equities = { ...sources, targets: onlyIn("UK equity") };

    const derived = derivedSet(equities, { stocks: 0.6 });

    expect(derived).toMatchObject({ allocation: { stocks: 0.6 } });
    expect("short" in derived ? null : derived.rates.bonds).toBeCloseTo(
      0.04542 - 0.002,
      12,
    );
  });

  // All in short-dated gilts, nothing says what the 40% the glide path
  // holds in stocks returns; all in UK equities under a vintage pricing
  // no global bonds, nothing says what its 40% in bonds does, and all in
  // stocks it holds nothing in them.
  it("derives none at a split holding stocks the target allocation holds none of, or bonds no class stands in for", () => {
    const gilts = { ...sources, targets: onlyIn("Short-dated gilts") };
    const unpriced = {
      ...sources,
      cma: { latest: unbonded, previous: null },
      targets: onlyIn("UK equity"),
    };

    expect(derivedSet(gilts, { stocks: 0.6 })).toStrictEqual({
      short:
        "The glide path holds stocks the target allocation holds none of, so nothing says what they return",
    });
    expect(derivedSet(unpriced, { stocks: 0.6 })).toStrictEqual({
      short:
        "The glide path holds bonds the target allocation holds none of, so nothing says what they return",
    });
    expect(derivedSet(unpriced, { stocks: 1 })).not.toHaveProperty("short");
  });

  // A vintage pulled before volatilities were read gives the same rates
  // and nothing over them, so the plan runs on the blend as it did.
  it("derives the rates with nothing earned by rebalancing while the vintage gives no risk", () => {
    const derived = derivedSet({
      ...sources,
      cma: { latest: unread, previous: null },
    });

    expect(derived).toMatchObject({
      rates: cmaRates(blended(), sources.deductions, inflationOf(curve).rate),
      rebalancing: 0,
    });
  });

  it("derives none before a vintage or a curve is pulled, or while the vintage makes no blend", () => {
    expect(derivedSet({ ...sources, cma: null })).toStrictEqual({
      short: "No CMA is pulled",
    });
    expect(derivedSet({ ...sources, curve: null })).toStrictEqual({
      short: "No inflation curve is pulled",
    });
    expect(derivedSet({ ...sources, targets: null })).toStrictEqual({
      short: "No target allocation is synced to weight the CMA by",
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
  // is in bonds, so they stray as hedged global bonds standing in for
  // them do, by 3.5%.
  it("blends a sleeve's classes by their weights and how far they move together", () => {
    const risk = risked(onlyIn("UK equity", "FTSE Global All Cap ex-UK"));

    expect(risk).toMatchObject({ stocks: Math.sqrt(0.027585) });
    expect("bonds" in risk && risk.bonds).toBeCloseTo(0.035, 12);
  });

  // FTSE All-Share and UK equity are both mapped onto UK equities, which
  // move wholly with themselves, so the two stray by UK equities' 16%.
  it("blends a class two categories are mapped onto as one", () => {
    expect(risked(onlyIn("FTSE All-Share", "UK equity"))).toMatchObject({
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

    expect(risked(onlyIn("FTSE All-Share", "UK equity"), unread)).toStrictEqual(
      {
        short:
          "The August 2026 CMA was pulled before its volatilities were read",
      },
    );
    expect(
      risked(onlyIn("FTSE All-Share", "UK equity"), ukUnrisked),
    ).toStrictEqual({
      short: "The August 2026 CMA gives UK large cap equities no volatility",
    });
    expect(risked(onlyIn("UK equity"), uncorrelated)).toStrictEqual({
      short:
        "The August 2026 CMA does not say how bonds and equities move together",
    });
  });
});

describe("rebalancingOf", () => {
  // The blends and the risk the allocation given makes.
  function parted(allocation: Targets): Parameters<typeof rebalancingOf> {
    const blends = blended(cma, allocation);
    const risk = riskOf(cma, blends);
    if ("short" in risk) {
      throw new Error(risk.short);
    }
    return [blends, risk];
  }

  // Half in UK equities at 16% and half in the equities at 19%, blended
  // to 0.027585 of variance: half of 0.5 × 0.16² + 0.5 × 0.19² less
  // that, 0.0016325, within stocks. Nothing is in bonds, so they earn
  // nothing, and all in stocks the portfolio earns what stocks do.
  it("earns within a sleeve half the gap between its classes' variances in their weights and its own", () => {
    expect(
      rebalancingOf(
        ...parted(onlyIn("UK equity", "FTSE Global All Cap ex-UK")),
      ),
    ).toStrictEqual({
      bonds: 0,
      portfolio: expect.closeTo(0.0016325, 12) as unknown,
      stocks: expect.closeTo(0.0016325, 12) as unknown,
    });
  });

  // One class to a sleeve earns nothing within it. Half in UK equities
  // at 16% and half in hedged bonds at 3.5%, moving -0.0541 together,
  // earns half of 0.25 × (0.16² + 0.035² - 2 × -0.0541 × 0.16 × 0.035)
  // between the two, 0.0034289.
  it("earns between the sleeves half their shares' product times how far apart they move", () => {
    expect(
      rebalancingOf(...parted(onlyIn("UK equity", "Global bonds, hedged"))),
    ).toStrictEqual({
      bonds: 0,
      portfolio: expect.closeTo(0.0034289, 7) as unknown,
      stocks: 0,
    });
  });

  // The reference allocation: stocks stray 16.68% blended against a
  // weighted variance of their four classes earning 0.205 of a point,
  // bonds 3.42% earning 0.020, and the two moving 0.013 together, 0.231
  // between them at four fifths and a fifth: 0.8 × 0.205 + 0.2 × 0.020 +
  // 0.231, 0.398 of a point on the portfolio.
  it("earns the portfolio the sleeves' terms in their shares and the term between them", () => {
    expect(rebalancingOf(...parted(targets))).toStrictEqual({
      bonds: expect.closeTo(0.0002031, 7) as unknown,
      portfolio: expect.closeTo(0.0039837, 7) as unknown,
      stocks: expect.closeTo(0.0020462, 7) as unknown,
    });
  });

  // All in UK equities, bonds stand in with no parts and none of the
  // whole, so they earn nothing and add nothing between the sleeves.
  it("earns nothing on a sleeve nothing blends into", () => {
    expect(rebalancingOf(...parted(onlyIn("UK equity")))).toStrictEqual({
      bonds: 0,
      portfolio: 0,
      stocks: 0,
    });
  });
});

describe("spreadOf", () => {
  const vintages = { latest: cma, previous: null };

  // Stocks at 6% and a 2% yield, 8% in all, bonds at 4%, prices at 3%.
  const rates = { bonds: 0.04, dividends: 0.02, inflation: 0.03, stocks: 0.06 };

  // The split given, on the rates above, with rebalancing earning what
  // is given over them, or nothing.
  function live(stocks: number, rebalancing = 0): DerivedSet {
    return { allocation: { stocks }, rates, rebalancing };
  }

  // Half in UK equities at 16% and half in hedged bonds at 3.5%, moving
  // -0.0541 together: 0.25 × 0.16² + 0.25 × 0.035² + 2 × 0.25 × -0.0541
  // × 0.16 × 0.035, a portfolio straying 8.10% a year about the 6% the
  // split makes, which in logs is 7.60%; about the 7% it makes with a
  // point earned by rebalancing, 7.53%. All in stocks, the stocks' 16%
  // about 8% is 14.58% in logs, and prices' standing 2% about 3% is
  // 1.94% in logs either way.
  it("spreads the plan rate as far as the portfolio strays in the split it runs on, and prices by the standing figure, each in logs", () => {
    const sources = {
      cma: vintages,
      mappings,
      targets: onlyIn("UK equity", "Global bonds, hedged"),
    };
    const halved = spreadOf(sources, live(0.5));
    const earning = spreadOf(sources, live(0.5, 0.01));
    const stocked = spreadOf(sources, live(1));

    expect("rate" in halved && halved.rate).toBeCloseTo(0.0760476, 6);
    expect("rate" in earning && earning.rate).toBeCloseTo(0.0753429, 6);
    expect("rate" in stocked && stocked.rate).toBeCloseTo(0.1458034, 6);
    expect("inflation" in stocked && stocked.inflation).toBeCloseTo(
      0.019412,
      6,
    );
  });

  it("spreads nothing before a vintage is pulled, while it makes no blend or gives no risk, or while the plan holds what the target allocation does not", () => {
    expect(spreadOf({ cma: null, mappings, targets }, live(0.8))).toStrictEqual(
      { short: "No CMA is pulled" },
    );
    expect(
      spreadOf({ cma: vintages, mappings, targets: null }, live(0.8)),
    ).toStrictEqual({
      short: "No target allocation is synced to weight the CMA by",
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
        {
          cma: { latest: unbonded, previous: null },
          mappings,
          targets: onlyIn("UK equity"),
        },
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

// Helper creating targets with invented per-account holdings by category name.
function bespokeOf(
  growth: AccountGrowth,
): Extract<AccountGrowth, { readonly kind: "bespoke" }> {
  if (growth.kind !== "bespoke") {
    throw new Error(growth.reason);
  }
  return growth;
}

function targetsWithHoldings(
  holdings: Readonly<
    Record<string, readonly { readonly name: string; readonly value: number }[]>
  >,
): Targets {
  return {
    ...targets,
    categories: targets.categories.map(
      ({ classes, id, isImplemented, name, share, value }) => {
        const accounts = holdings[name];
        return accounts === undefined
          ? { classes, id, isImplemented, name, share, value }
          : { accounts, classes, id, isImplemented, name, share, value };
      },
    ),
  };
}

describe("accountTargetsOf", () => {
  it("returns null for null targets, blank names, missing accounts, or zero total holdings", () => {
    expect(accountTargetsOf(null, "Brokerage ISA")).toBeNull();
    expect(accountTargetsOf(targets, "   ")).toBeNull();
    expect(accountTargetsOf(targets, "Brokerage ISA")).toBeNull();
    expect(
      accountTargetsOf(
        targetsWithHoldings({
          "UK equity": [{ name: "Brokerage ISA", value: 0 }],
        }),
        "Brokerage ISA",
      ),
    ).toBeNull();
  });

  // Trims both the requested name and Portfolio Performance account
  // names, summing duplicate trimmed entries within a category.
  it("matches untrimmed Portfolio Performance account names and sums duplicate entries", () => {
    const withPadded = targetsWithHoldings({
      "Global bonds, hedged": [{ name: " Padded ISA ", value: 2000 }],
      "UK equity": [
        { name: " Padded ISA", value: 3000 },
        { name: "Padded ISA ", value: 5000 },
        { name: "Other ISA", value: 9000 },
      ],
    });
    const accountTargets = accountTargetsOf(withPadded, "  Padded ISA  ");
    const byName = new Map(
      accountTargets?.categories.map(({ name, share }) => [name, share]) ?? [],
    );

    expect(byName.get("UK equity")).toBeCloseTo(0.8, 15);
    expect(byName.get("Global bonds, hedged")).toBeCloseTo(0.2, 15);
  });

  // Three equal categories in the same sleeve normalize to exact 1.0
  // without floating-point drift leaving a residual bond share, and the
  // 1-ULP remainder lands on the same category id regardless of input
  // category order.
  it("normalizes positive category holdings to exact 1 deterministically across category orders", () => {
    const withThree = targetsWithHoldings({
      "FTSE Global All Cap ex-UK": [{ name: "Equal ISA", value: 1000 }],
      "Global emerging markets": [{ name: "Equal ISA", value: 1000 }],
      "UK equity": [{ name: "Equal ISA", value: 1000 }],
    });
    const reversed: Targets = {
      ...withThree,
      categories: withThree.categories.toReversed(),
    };
    const forwardTargets = accountTargetsOf(withThree, "Equal ISA");
    const reversedTargets = accountTargetsOf(reversed, "Equal ISA");
    const shares = forwardTargets?.categories.map(({ share }) => share) ?? [];

    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(1);
    expect(shares.filter((share) => share > 0)).toHaveLength(3);
    const byId = (listed: null | Targets): Readonly<Record<string, number>> =>
      Object.fromEntries(
        listed?.categories.map(({ id, share }) => [id, share]) ?? [],
      );
    expect(byId(reversedTargets)).toStrictEqual(byId(forwardTargets));
  });
});

describe("accountGrowthOf", () => {
  const baseSources = {
    cma: { latest: cma, previous: null },
    curve,
    deductions: { dividends: 0.02, fees: 0.002 },
    glide: [] as const,
    mappings,
    rateSet: "cma" as const,
  };
  const plan = { born: 1992, from: 2026, years: 3 };

  it("falls back under custom rates, missing targets, missing CMA, or zero holdings", () => {
    const held = targetsWithHoldings({
      "UK equity": [{ name: "Brokerage ISA", value: 50000 }],
    });

    expect(
      accountGrowthOf(
        { ...baseSources, rateSet: "custom", targets: held },
        plan,
        "Brokerage ISA",
      ),
    ).toStrictEqual({ kind: "fallback", reason: "Custom rates are live" });
    expect(
      accountGrowthOf({ ...baseSources, targets: null }, plan, "Brokerage ISA"),
    ).toStrictEqual({
      kind: "fallback",
      reason: "No target allocation is synced",
    });
    expect(
      accountGrowthOf({ ...baseSources, targets }, plan, "Brokerage ISA"),
    ).toStrictEqual({
      kind: "fallback",
      reason: "No categorised holdings synced from Portfolio",
    });
    expect(
      accountGrowthOf(
        { ...baseSources, cma: null, targets: held },
        plan,
        "Brokerage ISA",
      ),
    ).toStrictEqual({ kind: "fallback", reason: "No CMA is pulled" });
  });

  // Single-category UK equity (8.156% less 0.20% fees = 7.956%), multi-
  // category equity with intra-sleeve rebalancing, and mixed 50/50
  // stocks/bonds with hedged global bonds and cross-sleeve rebalancing.
  it("derives bespoke rate, spread, and stock share for single, multi-equity, and mixed accounts", () => {
    const held = targetsWithHoldings({
      "FTSE Global All Cap ex-UK": [{ name: "Multi Equity", value: 25000 }],
      "Global bonds, hedged": [{ name: "Balanced SIPP", value: 30000 }],
      "UK equity": [
        { name: "UK Only", value: 40000 },
        { name: "Multi Equity", value: 25000 },
        { name: "Balanced SIPP", value: 30000 },
      ],
    });
    const sources = { ...baseSources, targets: held };

    const ukOnly = accountGrowthOf(sources, plan, "UK Only");
    expect(ukOnly).toMatchObject({ kind: "bespoke", stocks: 1 });
    expect(ukOnly.kind === "bespoke" ? ukOnly.rate.rate : 0).toBeCloseTo(
      0.08156 - 0.002,
      12,
    );
    expect(ukOnly.kind === "bespoke" ? ukOnly.spread?.rate : 0).toBeGreaterThan(
      0,
    );

    const multi = accountGrowthOf(sources, plan, "Multi Equity");
    const expectedMulti = derivedSet({
      ...sources,
      targets: onlyIn("UK equity", "FTSE Global All Cap ex-UK"),
    });
    expect(multi).toMatchObject({ kind: "bespoke", stocks: 1 });
    expect(multi.kind === "bespoke" ? multi.rate.rate : 0).toBeCloseTo(
      "short" in expectedMulti
        ? 0
        : (0.08156 + 0.07722) / 2 - 0.002 + expectedMulti.rebalancing,
      12,
    );

    const balanced = accountGrowthOf(sources, plan, "Balanced SIPP");
    expect(balanced).toMatchObject({ kind: "bespoke", stocks: 0.5 });
    expect(
      balanced.kind === "bespoke" ? balanced.spread?.rate : 0,
    ).toBeLessThan(ukOnly.kind === "bespoke" ? (ukOnly.spread?.rate ?? 1) : 0);
  });

  // Falls back on unmapped category, unrisked class in a risked vintage,
  // and a rate at or below -100%; omits spread when vintage predates
  // volatilities.
  it("falls back on unmapped, unrisked, or total-loss holdings, and omits spread for unread vintages", () => {
    const held = targetsWithHoldings({
      "UK equity": [{ name: "UK ISA", value: 10000 }],
    });

    expect(
      accountGrowthOf(
        {
          ...baseSources,
          mappings: remapped({ "UK equity": null }),
          targets: held,
        },
        plan,
        "UK ISA",
      ),
    ).toStrictEqual({ kind: "fallback", reason: "UK equity has no CMA class" });

    const ukUnrisked: Cma = {
      ...cma,
      assets: cma.assets.map((asset) =>
        asset.name === "UK large cap equities"
          ? { name: asset.name, rate: asset.rate, sleeve: asset.sleeve }
          : asset,
      ),
    };
    expect(
      accountGrowthOf(
        {
          ...baseSources,
          cma: { latest: ukUnrisked, previous: null },
          targets: held,
        },
        plan,
        "UK ISA",
      ),
    ).toStrictEqual({
      kind: "fallback",
      reason: "The August 2026 CMA gives UK large cap equities no volatility",
    });

    const totalLoss: Cma = {
      ...cma,
      assets: cma.assets.map((asset) =>
        asset.name === "UK large cap equities" ? { ...asset, rate: -1 } : asset,
      ),
    };
    expect(
      accountGrowthOf(
        {
          ...baseSources,
          cma: { latest: totalLoss, previous: null },
          targets: held,
        },
        plan,
        "UK ISA",
      ),
    ).toStrictEqual({
      kind: "fallback",
      reason: "A rate loses no more than everything",
    });

    const noRisk = accountGrowthOf(
      {
        ...baseSources,
        cma: { latest: unread, previous: null },
        targets: held,
      },
      plan,
      "UK ISA",
    );
    expect(noRisk.kind).toBe("bespoke");
    expect(noRisk.kind === "bespoke" && "spread" in noRisk).toBe(false);

    // A vintage carrying asset volatilities without a bond/equity
    // correlation keeps deterministic bespoke rates and omits spread.
    const noCorrelation: Cma = {
      asOf: cma.asOf,
      assets: cma.assets,
      vintage: cma.vintage,
    };
    const withoutCorrelation = bespokeOf(
      accountGrowthOf(
        {
          ...baseSources,
          cma: { latest: noCorrelation, previous: null },
          targets: held,
        },
        plan,
        "UK ISA",
      ),
    );
    expect(withoutCorrelation.rate.rate).toBeCloseTo(0.08156 - 0.002, 12);
    expect("spread" in withoutCorrelation).toBe(false);
  });

  // Along a glide path, an all-equity account uses bondsStandIn as bonds
  // rise with age, handles plan.years === 0 and unread vintages, and an
  // all-bonds account falls back with Portfolio-account wording (both at
  // year 0 and when a later year requires stocks).
  it("follows the glide path year by year and rewrites missing-sleeve shortfalls", () => {
    const held = targetsWithHoldings({
      "Short-dated gilts": [{ name: "Bonds Only", value: 10000 }],
      "UK equity": [{ name: "Equity Only", value: 10000 }],
    });
    const glide = [
      { age: 34, bonds: 0.2 },
      { age: 36, bonds: 0.4 },
    ] as const;

    const glidedEquity = bespokeOf(
      accountGrowthOf(
        { ...baseSources, glide, targets: held },
        plan,
        "Equity Only",
      ),
    );
    expect(glidedEquity.stocks).toBeCloseTo(0.8, 12);
    expect(glidedEquity.rate.byYear).toHaveLength(3);
    expect(glidedEquity.rate.byYear?.[0]).toBeCloseTo(
      glidedEquity.rate.rate,
      12,
    );
    expect(glidedEquity.rate.byYear?.[2]).toBeLessThan(
      glidedEquity.rate.byYear?.[0] ?? 0,
    );
    expect(glidedEquity.spread?.byYear).toHaveLength(3);

    const zeroYears = bespokeOf(
      accountGrowthOf(
        { ...baseSources, glide, targets: held },
        { ...plan, years: 0 },
        "Equity Only",
      ),
    );
    expect(zeroYears.rate.byYear).toStrictEqual([]);
    expect(zeroYears.spread?.byYear).toStrictEqual([]);

    const unreadGlided = accountGrowthOf(
      {
        ...baseSources,
        cma: { latest: unread, previous: null },
        glide,
        targets: held,
      },
      plan,
      "Equity Only",
    );
    expect(unreadGlided.kind).toBe("bespoke");
    expect(unreadGlided.kind === "bespoke" && "spread" in unreadGlided).toBe(
      false,
    );

    expect(
      accountGrowthOf(
        { ...baseSources, glide, targets: held },
        plan,
        "Bonds Only",
      ),
    ).toStrictEqual({
      kind: "fallback",
      reason: "Holds no stocks for the glide path",
    });

    // Starts at 100% bonds at age 34 (valid) then moves to 50% stocks at
    // age 35 (fails inside the year loop).
    expect(
      accountGrowthOf(
        {
          ...baseSources,
          glide: [
            { age: 34, bonds: 1 },
            { age: 35, bonds: 0.5 },
          ],
          targets: held,
        },
        plan,
        "Bonds Only",
      ),
    ).toStrictEqual({
      kind: "fallback",
      reason: "Holds no stocks for the glide path",
    });
  });
});
