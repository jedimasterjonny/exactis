// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Plan } from "@/data/plan";

import { placed } from "./span";

// Forty years from 2026, so the span ends in 2066 and the shares are round.
const plan: Plan = {
  born: 1990,
  from: 2026,
  month: 0,
  rate: 0.05,
  retires: 90,
  years: 40,
};

describe("placed", () => {
  it("places a year by its share of the span, a fraction of one that far into it", () => {
    expect(placed(2026, plan)).toBe(0);
    expect(placed(2036, plan)).toBe(25);
    expect(placed(2046.5, plan)).toBeCloseTo(51.25);
    expect(placed(2066, plan)).toBe(100);
  });

  it("holds a year outside the span to its edge", () => {
    expect(placed(2000, plan)).toBe(0);
    expect(placed(2100, plan)).toBe(100);
  });
});
