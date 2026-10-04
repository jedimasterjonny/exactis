// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Plan } from "@/data/plan";

import { decadesOf, placed } from "./span";

// Forty years from 2026, so the span ends in 2066 and the shares are round.
const plan: Plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0.05,
  retires: 90,
  years: 40,
};

describe("decadesOf", () => {
  it("rules each decade the span reaches past its first year", () => {
    expect(decadesOf(plan)).toStrictEqual([2030, 2040, 2050, 2060]);
    expect(decadesOf({ ...plan, from: 2030, years: 9 })).toStrictEqual([]);
    expect(decadesOf({ ...plan, from: 2030, years: 10 })).toStrictEqual([2040]);
  });
});

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
