// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Curve } from "./inflation";

import { horizon, inflationOf, rpiWedge } from "./inflation";
import { curve } from "./inflation.fixture";

// The reference kit's curve, 3.365% at 20 years, as at the day given.
function curveAsOf(asOf: string): Curve {
  return { ...curve, asOf };
}

describe("inflationOf", () => {
  // The reference kit's card: 3.42 of the twenty years fall before
  // February 2030, so 0.111 of the 0.65-point wedge comes off, and 0.3
  // for the premium, leaving 2.95%.
  it("takes the horizon's implied rate less the wedge its years before 2030 carry and the premium", () => {
    const inflation = inflationOf(curve);

    expect(inflation.implied).toBeCloseTo(0.03365, 10);
    expect(inflation.years).toBeCloseTo(3.42, 2);
    expect(inflation.wedge).toBeCloseTo(0.00111, 5);
    expect(inflation.premium).toBeCloseTo(0.003, 10);
    expect(inflation.rate).toBeCloseTo(0.02954, 5);
    expect(inflation.rate).toBe(
      inflation.implied - inflation.wedge - inflation.premium,
    );
  });

  it("takes none of the wedge from February 2030, when RPI is aligned with CPIH", () => {
    for (const asOf of ["2030-02-01", "2031-06-30"]) {
      const inflation = inflationOf(curveAsOf(asOf));

      expect(inflation.years).toBe(0);
      expect(inflation.wedge).toBe(0);
      expect(inflation.rate).toBeCloseTo(0.03065, 10);
    }
  });

  it("takes no more than the whole wedge however long before 2030", () => {
    const inflation = inflationOf(curveAsOf("2001-01-01"));

    expect(inflation.years).toBe(horizon);
    expect(inflation.wedge).toBe(rpiWedge);
  });
});
