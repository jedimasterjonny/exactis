// @vitest-environment node
import { describe, expect, it } from "vitest";

import { incomeTaxOn, insuranceOn, reliefOf } from "./tax";

describe("incomeTaxOn", () => {
  // Nothing on the allowance; £36,000 is 20% on the £23,430 above it;
  // £50,270 fills the basic rate band, £7,540; £100,000 is that and 40%
  // on the £49,730 above it, £27,432.
  it("charges nothing on the allowance, then the basic and higher rates", () => {
    expect(incomeTaxOn(0, 12)).toBe(0);
    expect(incomeTaxOn(12570, 12)).toBe(0);
    expect(incomeTaxOn(36000, 12)).toBeCloseTo(4686, 10);
    expect(incomeTaxOn(50270, 12)).toBeCloseTo(7540, 10);
    expect(incomeTaxOn(100000, 12)).toBeCloseTo(27432, 10);
  });

  // A month's £3,000 meets a twelfth of the allowance, £1,047.50, and
  // pays 20% on the £1,952.50 above it, £390.50, which is a twelfth of
  // the £4,686 on a year of such months; seven months of £3,000 meet
  // seven twelfths of it and pay seven times as much.
  it("charges what part of a year earned against that part of each band", () => {
    expect(incomeTaxOn(3000, 1)).toBeCloseTo(390.5, 10);
    expect(incomeTaxOn(21000, 7)).toBeCloseTo(7 * 390.5, 10);
    expect(incomeTaxOn(1047.5, 1)).toBe(0);
  });

  // £110,000 leaves £7,570 of the allowance, so £102,430 is taxed:
  // £7,540 at the basic rate and 40% on £64,730, £33,432, which is the
  // 60% band's £6,000 on the £27,432 at £100,000. At £125,140 the
  // allowance is gone, £42,516 in all, and £150,000 adds 45% on the
  // £24,860 above that, £53,703.
  it("withdraws the allowance over £100,000 and charges the additional rate above £125,140", () => {
    const tapered = 0.2 * 37700 + 0.4 * (110000 - (12570 - 5000) - 37700);

    expect(incomeTaxOn(110000, 12)).toBeCloseTo(tapered, 10);
    expect(incomeTaxOn(110000, 12)).toBeCloseTo(33432, 10);
    expect(incomeTaxOn(125140, 12)).toBeCloseTo(42516, 10);
    expect(incomeTaxOn(150000, 12)).toBeCloseTo(53703, 10);
  });
});

describe("insuranceOn", () => {
  // A salary of £36,000 pays 8% on the £23,430 above the threshold; one
  // of £60,000 pays 8% to the upper limit, £3,016, and 2% on the £9,730
  // above it. A month of the first is charged against a twelfth of the
  // threshold, as a pay period is.
  it("charges a salary Class 1", () => {
    expect(insuranceOn("employment", 12570, 12)).toBe(0);
    expect(insuranceOn("employment", 36000, 12)).toBeCloseTo(1874.4, 10);
    expect(insuranceOn("employment", 60000, 12)).toBeCloseTo(3210.6, 10);
    expect(insuranceOn("employment", 3000, 1)).toBeCloseTo(156.2, 10);
  });

  // 6% on the £23,430, and on £60,000, 6% to the upper limit, £2,262,
  // and 2% on the £9,730 above it.
  it("charges self-employed profit Class 4", () => {
    expect(insuranceOn("self-employment", 12570, 12)).toBe(0);
    expect(insuranceOn("self-employment", 36000, 12)).toBeCloseTo(1405.8, 10);
    expect(insuranceOn("self-employment", 60000, 12)).toBeCloseTo(2456.6, 10);
  });

  it("charges a pension and other income nothing", () => {
    expect(insuranceOn("pension", 60000, 12)).toBe(0);
    expect(insuranceOn("other", 60000, 12)).toBe(0);
  });
});

describe("refusing a charge", () => {
  // No months takes no share of any band, so every band would start at
  // nothing times a boundless top, which is not a number; a part of a
  // month or more than a year is no stretch a tax year holds.
  it("refuses a stretch that is not one to twelve whole months", () => {
    for (const months of [0, -1, 0.5, 13, Number.NaN]) {
      expect(() => incomeTaxOn(1000, months)).toThrow(
        "A tax year holds one to twelve months",
      );
      expect(() => insuranceOn("pension", 1000, months)).toThrow(
        "A tax year holds one to twelve months",
      );
    }
  });

  // A sum that is not a number comes back as a tax that is not one, and
  // one below nothing as no tax at all, either of them quietly.
  it("refuses a sum below nothing or not a number, whatever the kind", () => {
    for (const sum of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => incomeTaxOn(sum, 12)).toThrow(
        "A tax is charged on nothing or more",
      );
      expect(() => insuranceOn("other", sum, 12)).toThrow(
        "A tax is charged on nothing or more",
      );
    }
    expect(incomeTaxOn(0, 1)).toBe(0);
  });
});

describe("reliefOf", () => {
  // £800 paid is £1,000 gross less the basic rate's £200, which the
  // pension claims back: a quarter of what was paid. Nothing else
  // claims anything.
  it("adds the basic rate to what a pension is paid, and nothing to anything else", () => {
    expect(800 * (1 + reliefOf({ kind: "tax-deferred" }))).toBe(1000);
    for (const kind of ["cash", "tax-free", "debt"] as const) {
      expect(reliefOf({ kind })).toBe(0);
    }
  });
});
