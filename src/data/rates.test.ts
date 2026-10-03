// @vitest-environment node
import { describe, expect, it } from "vitest";

import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";

import {
  allInStocks,
  openingRates,
  planRate,
  realRate,
  resultsOf,
  stocksTotal,
} from "./rates";
import { allocation, rates } from "./rates.fixture";

describe("openingRates", () => {
  it("carries the plan's 5% onto each class, with the curve's inflation", () => {
    expect(openingRates(curve)).toStrictEqual({
      bonds: 0.05,
      dividends: 0,
      inflation: inflationOf(curve).rate,
      stocks: 0.05,
    });
  });

  it("takes the Bank's 2% target for inflation before a curve is pulled", () => {
    expect(openingRates(null)).toMatchObject({ inflation: 0.02 });
  });

  // Stocks and bonds alike at 5%, so the plan rate is 5% however the
  // savings are split.
  it("grows the plan at 5% whatever the split", () => {
    const opening = openingRates(null);

    expect(planRate(opening, allInStocks)).toBeCloseTo(0.05, 15);
    expect(planRate(opening, { stocks: 0 })).toBeCloseTo(0.05, 15);
    expect(planRate(opening, allocation)).toBeCloseTo(0.05, 15);
  });
});

describe("resultsOf", () => {
  // Four fifths at 5.95% growth with 2% on top and a fifth at 4.45%: the
  // portfolio returns 7.25%, which is the plan rate, made of 5.65%
  // growth and 1.60% yield, and over 2.95% of inflation each comes to
  // what realRate makes of its return.
  it("works out each class and the portfolio, which adds up down and across", () => {
    const results = resultsOf(rates, allocation);

    expect(results.nominal.stocks).toBeCloseTo(0.0795, 15);
    expect(results.nominal.bonds).toBeCloseTo(0.0445, 15);
    expect(results.nominal.portfolio).toBeCloseTo(
      planRate(rates, allocation),
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
    expect(planRate(rates, allocation)).toBeCloseTo(0.0725, 15);
  });

  it("takes stocks' total alone when everything is in stocks, and bonds' alone when nothing is", () => {
    expect(planRate(rates, allInStocks)).toBeCloseTo(0.0795, 15);
    expect(planRate(rates, { stocks: 0 })).toBeCloseTo(0.0445, 15);
  });
});
