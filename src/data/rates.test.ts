// @vitest-environment node
import { describe, expect, it } from "vitest";

import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";

import { allInStocks, openingRates, planRate, stocksTotal } from "./rates";
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
