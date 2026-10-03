// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  formatAxisGbp,
  formatCurveRate,
  formatGbp,
  formatPercent,
  formatPoints,
  negated,
} from "./money";

describe("formatAxisGbp", () => {
  it("shortens millions and thousands for an axis, to two places where they need them", () => {
    expect(formatAxisGbp(12000000)).toBe("£12m");
    expect(formatAxisGbp(2500000)).toBe("£2.5m");
    expect(formatAxisGbp(1250000)).toBe("£1.25m");
    expect(formatAxisGbp(500000)).toBe("£500k");
    expect(formatAxisGbp(12500)).toBe("£12.5k");
  });

  it("writes less than a thousand in full, and signs a loss with a real minus", () => {
    expect(formatAxisGbp(0)).toBe("£0");
    expect(formatAxisGbp(750)).toBe("£750");
    expect(formatAxisGbp(-1500000)).toBe("−£1.5m");
    expect(formatAxisGbp(-250000)).toBe("−£250k");
  });
});

describe("formatCurveRate", () => {
  it("writes a curve's rate as a percentage to three places, signing a fall with a real minus", () => {
    expect(formatCurveRate(0.03365)).toBe("3.365%");
    expect(formatCurveRate(0.0345855)).toBe("3.459%");
    expect(formatCurveRate(0)).toBe("0.000%");
    expect(formatCurveRate(-0.002)).toBe("−0.200%");
  });

  it("writes a fall that rounds to nothing unsigned", () => {
    expect(formatCurveRate(-0.000004)).toBe("0.000%");
    expect(formatCurveRate(-0)).toBe("0.000%");
  });
});

describe("formatGbp", () => {
  it("writes pounds with thousands separators and no pence", () => {
    expect(formatGbp(412880)).toBe("£412,880");
    expect(formatGbp(0)).toBe("£0");
  });

  it("rounds pence away and signs a loss with a real minus", () => {
    expect(formatGbp(1234.56)).toBe("£1,235");
    expect(formatGbp(-182940)).toBe("−£182,940");
  });

  it("writes a loss that rounds to nothing unsigned", () => {
    expect(formatGbp(-0.4)).toBe("£0");
    expect(formatGbp(-0)).toBe("£0");
  });
});

describe("formatPercent", () => {
  it("writes a fraction as a percentage to two places", () => {
    expect(formatPercent(0.021)).toBe("2.10%");
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatPercent(0.12345)).toBe("12.35%");
  });

  it("signs a fall with a real minus", () => {
    expect(formatPercent(-0.021)).toBe("−2.10%");
  });

  it("writes a fall that rounds to nothing unsigned", () => {
    expect(formatPercent(-0.00004)).toBe("0.00%");
    expect(formatPercent(-0)).toBe("0.00%");
  });
});

describe("formatPoints", () => {
  it("writes a difference in percentage points, to three places or the places given", () => {
    expect(formatPoints(0.003)).toBe("0.300pp");
    expect(formatPoints(-0.0011114)).toBe("−0.111pp");
    expect(formatPoints(0.0065, 2)).toBe("0.65pp");
  });

  // A curve dated the day before RPI is aligned with CPIH leaves a
  // wedge of less than a millionth to take off.
  it("writes a difference that rounds to nothing unsigned", () => {
    expect(formatPoints(-8.9e-7)).toBe("0.000pp");
    expect(formatPoints(-0)).toBe("0.000pp");
  });
});

describe("negated", () => {
  it("turns a figure's sign, and leaves nothing as nothing rather than minus nothing", () => {
    expect(negated(182940)).toBe(-182940);
    expect(negated(-2210)).toBe(2210);
    // toBe compares as Object.is does, which tells minus nothing apart.
    expect(negated(0)).toBe(0);
    expect(formatGbp(negated(0))).toBe("£0");
  });
});
