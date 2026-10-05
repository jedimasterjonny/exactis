// @vitest-environment node
import { describe, expect, it } from "vitest";

import { normalsFrom } from "./random";

// Draws enough that the sample's moments sit within a few hundredths of
// the distribution's: the mean's standard error is one over the root of
// the count, 0.007, and the variance's the root of two over it, 0.01.
const count = 20000;

function drawn(seed: number, length: number): number[] {
  const normal = normalsFrom(seed);
  return Array.from({ length }, () => normal());
}

describe("normalsFrom", () => {
  it("draws the same stream from the same seed, and another from another", () => {
    expect(drawn(2026, 5)).toStrictEqual(drawn(2026, 5));
    expect(drawn(2027, 5)).not.toStrictEqual(drawn(2026, 5));
  });

  // Each held within four standard errors, which a sound stream misses
  // once in some fifteen thousand seeds, and this seed is fixed.
  it("draws nought on average and one either side of it", () => {
    const draws = drawn(2026, count);
    const mean = draws.reduce((sum, draw) => sum + draw, 0) / count;
    const variance =
      draws.reduce((sum, draw) => sum + (draw - mean) ** 2, 0) / count;

    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(variance - 1)).toBeLessThan(0.04);
  });

  // A normal falls outside 1.96 either side one time in twenty, and
  // outside 3 about one time in 370; a tail drawn too thin or too fat
  // misses both. The share past 1.96 has a standard error of 0.0015.
  it("draws the tails as often as a normal does", () => {
    const draws = drawn(2026, count);
    const past = (bound: number): number =>
      draws.filter((draw) => Math.abs(draw) > bound).length / count;

    expect(Math.abs(past(1.96) - 0.05)).toBeLessThan(0.006);
    expect(past(3)).toBeGreaterThan(0.001);
    expect(past(3)).toBeLessThan(0.005);
  });
});
