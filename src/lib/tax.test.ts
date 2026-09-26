// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  drawFor,
  drawOf,
  incomeTaxOn,
  insuranceOn,
  isWithinAllowance,
  lumpSumAllowance,
  mostFixedOf,
  reliefOf,
  relievableOn,
} from "./tax";

// A month's draw with the whole allowance to come and nothing else
// earned, and one beside a salary at the top of the basic rate band, a
// twelfth of £50,270, so the draw is taxed at the higher rate.
const alone = {
  allowance: lumpSumAllowance,
  below: 0,
  isEarly: false,
  months: 1,
};

const beside = { ...alone, below: 50270 / 12 };

describe("drawOf", () => {
  // £1,000 is £250 free and £750 taxed, which alone sits under a twelfth
  // of the personal allowance and pays nothing, and beside the salary
  // pays 40% of the £750, £300, leaving £700.
  it("takes a quarter free of tax and taxes the rest on top of the income below it", () => {
    expect(drawOf(1000, alone)).toStrictEqual({
      gross: 1000,
      net: 1000,
      taxable: 750,
      taxFree: 250,
    });
    expect(drawOf(1000, beside).net).toBeCloseTo(700, 10);
  });

  // £100 of the allowance left frees £100 of the £1,100 and no more, so
  // £1,000 is taxed at 40% and £700 is left.
  it("frees no more than the allowance has left", () => {
    const draw = drawOf(1100, { ...beside, allowance: 100 });

    expect(draw.taxFree).toBe(100);
    expect(draw.taxable).toBe(1000);
    expect(draw.net).toBeCloseTo(700, 10);
  });
});

describe("drawFor", () => {
  // Alone, the first £1,396.67 is taxed nothing, its taxed three
  // quarters filling the month's £1,047.50 of the allowance; every pound
  // after keeps 85p, the basic rate taken off three quarters of it, so
  // the £1,603.33 still wanted takes £1,886.27 more: £3,282.94, of which
  // £282.94 is tax. Beside the salary each pound keeps 70p from the
  // first, so £700 takes £1,000.
  it("grosses a draw up so what is left of it once taxed is what was asked for", () => {
    const draw = drawFor(3000, alone);

    expect(draw.gross).toBeCloseTo(3282.94, 2);
    expect(draw.net).toBeCloseTo(3000, 10);
    expect(draw.taxFree).toBeCloseTo(draw.gross / 4, 10);
    expect(drawFor(700, beside).gross).toBeCloseTo(1000, 10);
  });

  // With the allowance gone every pound is taxed, a year at a time
  // here. £50,270 fills the basic rate band and keeps £42,730; £10,000
  // over £100,000 keeps 40p a pound, £4,000; and £2,000 from £1,000 under
  // £125,140 keeps 40p a pound on the first £1,000 and 55p on the next,
  // £950.
  it("grosses up through the bands a stretch at a time", () => {
    const year = { ...alone, allowance: 0, months: 12 };

    expect(drawFor(42730, year).gross).toBeCloseTo(50270, 10);
    expect(drawFor(4000, { ...year, below: 100000 }).gross).toBeCloseTo(
      10000,
      10,
    );
    expect(drawFor(950, { ...year, below: 124140 }).gross).toBeCloseTo(
      2000,
      10,
    );
  });

  // £100 of the allowance frees a quarter of the first £400, which
  // keeps 70p a pound, £280; the £420 still wanted is taxed whole at
  // 40% and takes £700 more, so £1,100 is drawn and £100 of it is free.
  it("frees a quarter of the draw only until the allowance runs out", () => {
    const draw = drawFor(700, { ...beside, allowance: 100 });

    expect(draw.gross).toBeCloseTo(1100, 10);
    expect(draw.taxFree).toBe(100);
  });

  it("draws nothing for nothing", () => {
    expect(drawFor(0, alone).gross).toBe(0);
  });

  // Every band's edge, a pound either side of it and on it, with the
  // allowance whole, all but gone and gone: what a draw grossed up to
  // leaves is what was asked for, to a millionth of a penny, and a pound
  // more asked for always draws more.
  it("inverts what a draw leaves at every band's edge and the allowance's end", () => {
    const edges = [0, 12570, 50270, 100000, 125140].flatMap((edge) =>
      [edge / 12 - 1, edge / 12, edge / 12 + 1].filter((below) => below >= 0),
    );
    for (const below of edges) {
      for (const allowance of [0, 100, lumpSumAllowance]) {
        const standing = { ...alone, allowance, below };
        for (const net of [0.01, 1, 999, 20000, 1000000]) {
          const draw = drawFor(net, standing);

          expect(drawOf(draw.gross, standing).net).toBeCloseTo(net, 8);
          expect(drawFor(net + 1, standing).gross).toBeGreaterThan(draw.gross);
        }
      }
    }
  });

  // A figure that is not a number compares false against every band, so
  // the walk would never find the stretch it ends in; one below nothing
  // would free a quarter of nothing less than nothing. Both are refused
  // before the first step.
  it("refuses a draw from a standing no pension is in", () => {
    for (const standing of [
      { ...alone, below: Number.NaN },
      { ...alone, below: -1 },
      { ...alone, allowance: -50 },
      { ...alone, months: 0 },
    ]) {
      expect(() => drawFor(1000, standing)).toThrow();
      expect(() => drawOf(1000, standing)).toThrow();
    }
    for (const net of [-100, Number.NaN]) {
      expect(() => drawFor(net, alone)).toThrow(
        "A tax is charged on nothing or more",
      );
      expect(() => drawOf(net, alone)).toThrow(
        "A tax is charged on nothing or more",
      );
    }
  });

  // Before the pension age a draw keeps 45p a pound whatever else the
  // month earned, so £900 takes £2,000, and none of it is income or
  // uses the allowance.
  it("charges a draw before the pension age 55% and nothing else", () => {
    const draw = drawFor(900, { ...beside, isEarly: true });

    expect(draw.gross).toBeCloseTo(2000, 10);
    expect(draw.net).toBeCloseTo(900, 10);
    expect(draw.taxable + draw.taxFree).toBe(0);
  });
});

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

describe("relievableOn", () => {
  // A year earning £40,000 relieves £40,000, and one earning £2,000 or
  // nothing still relieves £3,600, which a month earning nothing takes
  // a twelfth of: £300. A month earning £1,000 relieves the £1,000.
  it("relieves what is earned, and £3,600 a year when that is less", () => {
    expect(relievableOn(40000, 12)).toBe(40000);
    expect(relievableOn(2000, 12)).toBe(3600);
    expect(relievableOn(0, 12)).toBe(3600);
    expect(relievableOn(0, 1)).toBe(300);
    expect(relievableOn(1000, 1)).toBe(1000);
  });
});

describe("mostFixedOf", () => {
  // What lands as the whole allowance: an ISA's £20,000, and the £48,000
  // a pension is paid that lands as £60,000 with the relief.
  it("gives the most a fixed sum lands the allowance from, and none for a kind with no allowance", () => {
    expect(mostFixedOf("tax-free")).toBe(20000);
    expect(mostFixedOf("tax-deferred")).toBe(48000);
    expect(mostFixedOf("cash")).toBeNull();
    expect(mostFixedOf("debt")).toBeNull();
  });
});

describe("isWithinAllowance", () => {
  const isa = {
    balance: 0,
    balloon: 0,
    cadence: "year",
    cap: 0,
    contribution: 20000,
    funding: "fixed",
    growth: "plan",
    isAlwaysFunded: false,
    kind: "tax-free",
    name: "ISA",
    owner: 1,
    rate: 0,
  } as const;

  // At the most, whether stated a year or a month, is within; a pound
  // past it, or a month of £1,667, which is £20,004 a year, is not.
  it("holds an ISA's fixed sum to £20,000 a year and a pension's to £48,000", () => {
    expect(isWithinAllowance(isa)).toBe(true);
    expect(isWithinAllowance({ ...isa, contribution: 20001 })).toBe(false);
    expect(
      isWithinAllowance({ ...isa, cadence: "month", contribution: 1666 }),
    ).toBe(true);
    expect(
      isWithinAllowance({ ...isa, cadence: "month", contribution: 1667 }),
    ).toBe(false);
    expect(
      isWithinAllowance({ ...isa, contribution: 48000, kind: "tax-deferred" }),
    ).toBe(true);
    expect(
      isWithinAllowance({ ...isa, contribution: 48001, kind: "tax-deferred" }),
    ).toBe(false);
  });

  // The spare money is held to the allowance by the engine, and cash
  // and a debt have none, so none of them states a sum it could pass.
  it("asks nothing of the spare money or of a kind with no allowance", () => {
    expect(
      isWithinAllowance({ ...isa, contribution: 99999, funding: "spare" }),
    ).toBe(true);
    expect(
      isWithinAllowance({
        ...isa,
        contribution: 99999,
        kind: "cash",
        owner: null,
      }),
    ).toBe(true);
  });
});
