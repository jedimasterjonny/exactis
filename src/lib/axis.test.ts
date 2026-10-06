// @vitest-environment node
import { describe, expect, it } from "vitest";

import { axisOf } from "./axis";

describe("axisOf", () => {
  it("marks a plot above nothing as recharts would, the last tick at or over its top", () => {
    expect(axisOf(0, 5800000)).toStrictEqual({
      domain: [0, 6000000],
      ticks: [0, 1500000, 3000000, 4500000, 6000000],
    });
  });

  // £250,000 owed under £6m held reaches no step below nothing, so the
  // axis goes only as deep as the debt rather than a whole step; £2m
  // owed reaches one.
  it("reaches below nothing only as deep as the plot goes, at the step above it", () => {
    expect(axisOf(-250000, 6000000)).toStrictEqual({
      domain: [-250000, 6000000],
      ticks: [0, 1500000, 3000000, 4500000, 6000000],
    });
    expect(axisOf(-2000000, 6000000)).toStrictEqual({
      domain: [-2000000, 6000000],
      ticks: [-1500000, 0, 1500000, 3000000, 4500000, 6000000],
    });
  });

  it("marks a plot below nothing alone at the step it would take above", () => {
    expect(axisOf(-150000, 0)).toStrictEqual({
      domain: [-150000, 0],
      ticks: [-120000, -80000, -40000, 0],
    });
  });
});
