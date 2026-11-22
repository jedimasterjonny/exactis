// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  currencyFormatOf,
  formatAxisGbp,
  formatChance,
  formatCurrency,
  formatCurveRate,
  formatGbp,
  formatPercent,
  formatPoints,
  formatPrice,
  formatShares,
  formatSignedCurrency,
  formatSignedGbp,
  formatWholePercent,
  negated,
  priceFormatOf,
} from "./money";

describe("currencyFormatOf", () => {
  it("returns two-place currency format for ISO codes and plain decimals for GBX or invalid codes", () => {
    expect(currencyFormatOf("GBP")).toStrictEqual({
      currency: "GBP",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    });
    expect(currencyFormatOf("GBX")).toStrictEqual({
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
    expect(currencyFormatOf("EURO")).toStrictEqual({
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  });
});

describe("formatAxisGbp", () => {
  it("shortens millions and thousands for an axis, to two places where they need them", () => {
    expect(formatAxisGbp(7000000)).toBe("£7m");
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

describe("formatChance", () => {
  it("rounds a chance down, so it reads 90% only once 9 in 10 last", () => {
    expect(formatChance(0.899)).toBe("89%");
    expect(formatChance(0.9)).toBe("90%");
    expect(formatChance(0.29)).toBe("29%");
    expect(formatChance(1)).toBe("100%");
    expect(formatChance(0)).toBe("0%");
  });

  it("reads a chance short of all as 99%, and one more than none as 1%", () => {
    expect(formatChance(0.999)).toBe("99%");
    expect(formatChance(0.001)).toBe("1%");
  });
});

describe("formatCurrency", () => {
  it("writes ISO currencies to two decimal places with a real minus and unsigned zero", () => {
    expect(formatCurrency(1234.5, "GBP")).toBe("£1,234.50");
    expect(formatCurrency(0, "GBP")).toBe("£0.00");
    expect(formatCurrency(-42.18, "GBP")).toBe("−£42.18");
    expect(formatCurrency(-0.004, "GBP")).toBe("£0.00");
    expect(formatCurrency(-0, "GBP")).toBe("£0.00");
    expect(formatCurrency(850, "USD")).toBe("US$850.00");
    expect(formatCurrency(-99.9, "EUR")).toBe("−€99.90");
  });

  it("writes GBX in pence rather than passing it to Intl as an ISO currency", () => {
    expect(formatCurrency(214.5, "GBX")).toBe("214.50p");
    expect(formatCurrency(-12.3, "GBX")).toBe("−12.30p");
    expect(formatCurrency(-0.004, "GBX")).toBe("0.00p");
  });

  it("falls back to two decimal places for a non-ISO code without throwing", () => {
    expect(formatCurrency(1500, "EURO")).toBe("1,500.00 EURO");
    expect(formatCurrency(-25.5, "EURO")).toBe("−25.50 EURO");
    expect(formatCurrency(10, "")).toBe("10.00");
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
    expect(formatGbp(391640)).toBe("£391,640");
    expect(formatGbp(0)).toBe("£0");
  });

  it("rounds pence away and signs a loss with a real minus", () => {
    expect(formatGbp(1234.56)).toBe("£1,235");
    expect(formatGbp(-176520)).toBe("−£176,520");
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
    expect(negated(176520)).toBe(-176520);
    expect(negated(-2180)).toBe(2180);
    // toBe compares as Object.is does, which tells minus nothing apart.
    expect(negated(0)).toBe(0);
    expect(formatGbp(negated(0))).toBe("£0");
  });
});

describe("formatPrice", () => {
  it("writes quotes to between two and six decimal places, formatting GBX in pence and falling back safely on non-ISO codes", () => {
    expect(formatPrice(125.5, "GBP")).toBe("£125.50");
    expect(formatPrice(214.0156, "GBP")).toBe("£214.0156");
    expect(formatPrice(214.015, "GBX")).toBe("214.015p");
    expect(formatPrice(200, "GBX")).toBe("200.00p");
    expect(formatPrice(-12.3456, "USD")).toBe("−US$12.3456");
    expect(formatPrice(-0.0000004, "GBP")).toBe("£0.00");
    expect(formatPrice(18.125, "EURO")).toBe("18.125 EURO");
    expect(formatPrice(18.125, "")).toBe("18.125");
  });
});

describe("formatShares", () => {
  it("writes share counts up to eight decimal places with no trailing zeroes and a real minus", () => {
    expect(formatShares(0)).toBe("0");
    expect(formatShares(-0)).toBe("0");
    expect(formatShares(-0.000000004)).toBe("0");
    expect(formatShares(1250)).toBe("1,250");
    expect(formatShares(12.3456)).toBe("12.3456");
    expect(formatShares(0.12345678)).toBe("0.12345678");
    expect(formatShares(-2.5)).toBe("−2.5");
  });
});

describe("priceFormatOf", () => {
  it("returns currency format for ISO codes and plain decimals for GBX or invalid codes", () => {
    expect(priceFormatOf("GBP")).toStrictEqual({
      currency: "GBP",
      maximumFractionDigits: 6,
      minimumFractionDigits: 2,
      style: "currency",
    });
    expect(priceFormatOf("GBX")).toStrictEqual({
      maximumFractionDigits: 6,
      minimumFractionDigits: 2,
    });
    expect(priceFormatOf("EURO")).toStrictEqual({
      maximumFractionDigits: 6,
      minimumFractionDigits: 2,
    });
  });
});

describe("formatSignedCurrency", () => {
  it("signs inflows with +, outflows with a real minus, and leaves neutral or zero figures unsigned", () => {
    expect(formatSignedCurrency(42.18, "GBP", "in")).toBe("+£42.18");
    expect(formatSignedCurrency(1250, "GBP", "out")).toBe("−£1,250.00");
    expect(formatSignedCurrency(500, "GBP", "neutral")).toBe("£500.00");
    expect(formatSignedCurrency(0, "GBP", "in")).toBe("£0.00");
    expect(formatSignedCurrency(0.004, "GBP", "out")).toBe("£0.00");
    expect(formatSignedCurrency(100, "USD", "out")).toBe("−US$100.00");
  });
});

describe("formatSignedGbp", () => {
  it("signs a move either way, with a real minus, and leaves one that rounds to nothing unsigned", () => {
    expect(formatSignedGbp(128309)).toBe("+£128,309");
    expect(formatSignedGbp(-11000.4)).toBe("−£11,000");
    expect(formatSignedGbp(0.4)).toBe("£0");
    expect(formatSignedGbp(-0.4)).toBe("£0");
  });
});

describe("formatWholePercent", () => {
  it("writes a share as a whole percentage", () => {
    expect(formatWholePercent(0.881)).toBe("88%");
    expect(formatWholePercent(1)).toBe("100%");
    expect(formatWholePercent(0)).toBe("0%");
  });

  it("reads a share short of all as 99% at the most, and one more than none as 1% at the least", () => {
    expect(formatWholePercent(0.996)).toBe("99%");
    expect(formatWholePercent(0.004)).toBe("1%");
  });
});
