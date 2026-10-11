// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Measured } from "./goals";

import { conditionOf, isReached } from "./goals";
import { goals } from "./goals.fixture";

const [firstMillion, independence] = goals;

// A year worth a million, half of it the house, spending £30,000 and
// owing £40,000.
const year: Measured = {
  debt: 40000,
  expenses: 30000,
  liquid: 500000,
  worth: 1000000,
};

describe("conditionOf", () => {
  it("says a condition in words, a sum of pounds formatted and a multiple of a measure named", () => {
    expect(firstMillion.conditions.map(conditionOf)).toStrictEqual([
      "Net worth ≥ £1,000,000",
    ]);
    expect(independence.conditions.map(conditionOf)).toStrictEqual([
      "Liquid net worth ≥ 25 years of expenses",
      "Liquid net worth ≥ 10 times the debt",
    ]);
    expect(
      conditionOf({ measure: "expenses", of: "worth", times: 0.025 }),
    ).toBe("A year's expenses ≥ 0.03 times net worth");
  });
});

describe("isReached", () => {
  it("is reached once the measure is at least the multiple of its basis, and not short of it", () => {
    expect(isReached(firstMillion, year)).toBe(true);
    expect(isReached(firstMillion, { ...year, worth: 999999 })).toBe(false);
  });

  // £500,000 is 25 years of £20,000 and ten times £40,000 owed, and no
  // more than either.
  it("is reached only once every condition holds", () => {
    expect(isReached(independence, { ...year, expenses: 20000 })).toBe(true);
    expect(isReached(independence, year)).toBe(false);
    expect(
      isReached(independence, { ...year, debt: 50001, expenses: 20000 }),
    ).toBe(false);
  });

  it("is reached at once by a goal holding no condition", () => {
    expect(isReached({ conditions: [] }, year)).toBe(true);
  });
});
