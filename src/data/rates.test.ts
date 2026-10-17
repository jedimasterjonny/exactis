// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  allInStocks,
  bondsAt,
  openingRates,
  planRate,
  realRate,
  resultsOf,
  stocksTotal,
} from "./rates";
import { allocation, rates } from "./rates.fixture";

describe("openingRates", () => {
  it("carries the plan's 5% onto each class, with the Bank's 2% target for inflation", () => {
    expect(openingRates).toStrictEqual({
      bonds: 0.05,
      dividends: 0,
      inflation: 0.02,
      stocks: 0.05,
    });
  });

  // Stocks and bonds alike at 5%, so the plan rate is 5% however the
  // savings are split.
  it("grows the plan at 5% whatever the split", () => {
    expect(planRate(openingRates, allInStocks, 0)).toBeCloseTo(0.05, 15);
    expect(planRate(openingRates, { stocks: 0 }, 0)).toBeCloseTo(0.05, 15);
    expect(planRate(openingRates, allocation, 0)).toBeCloseTo(0.05, 15);
  });
});

describe("resultsOf", () => {
  // Four fifths at 5.95% growth with 2% on top and a fifth at 4.45%: the
  // portfolio returns 7.25%, which is the plan rate, made of 5.65%
  // growth and 1.60% yield, and over 2.95% of inflation each comes to
  // what realRate makes of its return.
  it("works out each class and the portfolio, which adds up down and across", () => {
    const results = resultsOf(rates, allocation, 0);

    expect(results.nominal.stocks).toBeCloseTo(0.0795, 15);
    expect(results.nominal.bonds).toBeCloseTo(0.0445, 15);
    expect(results.nominal.portfolio).toBeCloseTo(
      planRate(rates, allocation, 0),
      15,
    );
    expect(results.growth.stocks).toBeCloseTo(0.0595, 15);
    expect(results.growth.bonds).toBeCloseTo(0.0445, 15);
    expect(results.growth.portfolio).toBeCloseTo(0.0565, 15);
    expect(results.yield.stocks).toBeCloseTo(0.02, 15);
    expect(results.yield.bonds).toBe(0);
    expect(results.yield.portfolio).toBeCloseTo(0.016, 15);
    expect(results.real.portfolio).toBeCloseTo(realRate(0.0725, 0.0295), 15);
    expect(results.real.bonds).toBeCloseTo(realRate(0.0445, 0.0295), 15);
  });

  // Rebalancing earning 0.4 of a point takes the portfolio's return to
  // 7.65% and its growth to 6.05%, so the two still add up with the
  // 1.60% yield, and the real return follows; each class stays as it
  // was, since the term is the portfolio's alone.
  it("adds what rebalancing earns to the portfolio's return and growth, and to nothing else", () => {
    const results = resultsOf(rates, allocation, 0.004);

    expect(results.nominal.portfolio).toBeCloseTo(0.0765, 15);
    expect(results.growth.portfolio).toBeCloseTo(0.0605, 15);
    expect(results.yield.portfolio).toBeCloseTo(0.016, 15);
    expect(results.real.portfolio).toBeCloseTo(realRate(0.0765, 0.0295), 15);
    expect(results.nominal.stocks).toBeCloseTo(0.0795, 15);
    expect(results.nominal.bonds).toBeCloseTo(0.0445, 15);
    expect(results.growth.stocks).toBeCloseTo(0.0595, 15);
    expect(results.real.bonds).toBeCloseTo(realRate(0.0445, 0.0295), 15);
  });
});

describe("realRate", () => {
  // 7.95% over 2.95% is 1.0795 / 1.0295, not the 5% subtracting gives.
  it("divides the inflation out rather than subtracting it", () => {
    expect(realRate(0.0795, 0.0295)).toBeCloseTo(0.05 / 1.0295, 15);
  });

  it("is nothing for a rate that only keeps up with prices", () => {
    expect(realRate(0.0295, 0.0295)).toBe(0);
  });
});

describe("stocksTotal", () => {
  it("adds the dividend yield to the growth", () => {
    expect(stocksTotal(rates)).toBeCloseTo(0.0795, 15);
  });
});

describe("planRate", () => {
  // Four fifths at 7.95% and a fifth at 4.45%.
  it("blends stocks' total and bonds' growth by the share held in each", () => {
    expect(planRate(rates, allocation, 0)).toBeCloseTo(0.0725, 15);
  });

  it("takes stocks' total alone when everything is in stocks, and bonds' alone when nothing is", () => {
    expect(planRate(rates, allInStocks, 0)).toBeCloseTo(0.0795, 15);
    expect(planRate(rates, { stocks: 0 }, 0)).toBeCloseTo(0.0445, 15);
  });

  // The 7.25% the blend makes and 0.4 of a point rebalancing earns.
  it("adds what rebalancing earns over the blend", () => {
    expect(planRate(rates, allocation, 0.004)).toBeCloseTo(0.0765, 15);
  });
});

describe("bondsAt", () => {
  // Fifteen points of bonds to 52, rising to 40 by 60, and down to 25 by 75.
  const glide = [
    { age: 52, bonds: 0.15 },
    { age: 60, bonds: 0.4 },
    { age: 75, bonds: 0.25 },
  ] as const;

  // Halfway from 52 to 60 is halfway from 15% to 40%, 27.5%; a third of
  // the way from 60 to 75 is a third of the way down to 25%, 35%.
  it("holds an anchor's share at its age and the line between two between them", () => {
    expect(bondsAt(glide, 56)).toBeCloseTo(0.275, 15);
    expect(bondsAt(glide, 65)).toBeCloseTo(0.35, 15);
  });

  // An anchor's figure comes back as it was typed, not by way of what
  // stocks leave, which would carry it a hair off.
  it("gives an anchor's own figure back at its age, exactly", () => {
    for (const anchor of glide) {
      expect(bondsAt(glide, anchor.age)).toBe(anchor.bonds);
    }
  });

  it("holds flat before the first anchor and past the last", () => {
    expect(bondsAt(glide, 34)).toBe(glide[0].bonds);
    expect(bondsAt(glide, 91)).toBe(glide[2].bonds);
  });

  it("holds no share for a glide path of no anchors", () => {
    expect(bondsAt([], 52)).toBeNull();
  });
});
