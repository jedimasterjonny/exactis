// @vitest-environment node
import { describe, expect, it } from "vitest";

import { axisOf } from "./axis";

describe("axisOf", () => {
  it("marks a plot above nothing as recharts would, the last tick at or over its top", () => {
    expect(axisOf(0, 9500000)).toStrictEqual({
      domain: [0, 10000000],
      ticks: [0, 2500000, 5000000, 7500000, 10000000],
    });
  });

  // £400,000 owed under £10m held reaches no step below nothing, so the
  // axis goes only as deep as the debt rather than a whole step; £3m
  // owed reaches one.
  it("reaches below nothing only as deep as the plot goes, at the step above it", () => {
    expect(axisOf(-400000, 10000000)).toStrictEqual({
      domain: [-400000, 10000000],
      ticks: [0, 2500000, 5000000, 7500000, 10000000],
    });
    expect(axisOf(-3000000, 10000000)).toStrictEqual({
      domain: [-3000000, 10000000],
      ticks: [-2500000, 0, 2500000, 5000000, 7500000, 10000000],
    });
  });

  it("marks a plot below nothing alone at the step it would take above", () => {
    expect(axisOf(-150000, 0)).toStrictEqual({
      domain: [-150000, 0],
      ticks: [-120000, -80000, -40000, 0],
    });
  });
});
