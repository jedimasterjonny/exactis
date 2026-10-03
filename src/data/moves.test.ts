// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Cma } from "@/data/cma";
import type { Sources } from "@/data/household";
import type { Curve } from "@/data/inflation";

import { derivedSet } from "@/data/cma";
import { cma, mappings } from "@/data/cma.fixture";
import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";
import { planRate } from "@/data/rates";
import { targets, targetsUnder } from "@/data/targets.fixture";

import { movesBetween } from "./moves";

// The reference household's sources: August's vintage, the first of
// September's curve, its target allocation and mappings, and 0.20% of
// fees and a 2% yield set on the first of September.
const reference: Sources = {
  cma: { latest: cma, previous: null },
  curve,
  deductions: { dividends: 0.02, fees: 0.002, setOn: "2026-09-01" },
  mappings,
  targets,
};

// August's vintage with every class returning a tenth of a point less.
const lower: Cma = {
  ...cma,
  assets: cma.assets.map((asset) => ({ ...asset, rate: asset.rate - 0.001 })),
};

// The first of September's curve with every maturity a tenth of a point
// higher, which raises the inflation derived from it by as much.
const higher: Curve = {
  ...curve,
  implied: {
    5: curve.implied[5] + 0.001,
    10: curve.implied[10] + 0.001,
    20: curve.implied[20] + 0.001,
    30: curve.implied[30] + 0.001,
  },
};

// The plan rate the sources make, worked out directly.
function rateOf(sources: Sources): number {
  const derived = derivedSet(sources);
  if ("short" in derived) {
    throw new Error(derived.short);
  }
  return planRate(derived.rates, derived.allocation);
}

describe("movesBetween", () => {
  // A vintage pulled before kept as the previous, the same allocation
  // imported again on another day, its mappings made in another order,
  // and fees and yield confirmed: none moves a rate.
  it("takes no step where no source changed in a way that moves a rate", () => {
    const moves = movesBetween(reference, {
      ...reference,
      cma: { latest: cma, previous: cma },
      deductions: { ...reference.deductions, setOn: "2026-10-01" },
      mappings: mappings.toReversed(),
      targets: { ...targets, importedOn: "2026-10-01" },
    });

    expect(moves?.steps).toStrictEqual([]);
    expect(moves?.now).toStrictEqual(moves?.before);
  });

  // Every class a tenth of a point lower takes the plan rate down by as
  // much, moves no inflation, and takes the real return down by that
  // over the inflation.
  it("moves the plan rate by a new vintage, and not the inflation", () => {
    const moves = movesBetween(reference, {
      ...reference,
      cma: { latest: lower, previous: cma },
    });
    const inflation = inflationOf(curve).rate;

    expect(moves?.steps.map(({ sources }) => sources)).toStrictEqual([["cma"]]);
    expect(moves?.steps[0]?.by.planRate).toBeCloseTo(-0.001, 12);
    expect(moves?.steps[0]?.by.inflation).toBe(0);
    expect(moves?.steps[0]?.by.real).toBeCloseTo(-0.001 / (1 + inflation), 12);
    expect(moves?.before.planRate).toBeCloseTo(rateOf(reference), 15);
  });

  // The plan rate is nominal, so the curve leaves it where it was.
  it("moves the inflation and the real return by a new curve, and not the plan rate", () => {
    const moves = movesBetween(reference, { ...reference, curve: higher });

    expect(moves?.steps.map(({ sources }) => sources)).toStrictEqual([
      ["curve"],
    ]);
    expect(moves?.steps[0]?.by.planRate).toBe(0);
    expect(moves?.steps[0]?.by.inflation).toBeCloseTo(0.001, 12);
    expect(moves?.steps[0]?.by.real).toBeLessThan(0);
  });

  it("moves the plan rate by a new target allocation, all in equities", () => {
    const now = { ...reference, targets: targetsUnder("Equity") };
    const moves = movesBetween(reference, now);

    expect(moves?.steps.map(({ sources }) => sources)).toStrictEqual([
      ["targets"],
    ]);
    expect(moves?.steps[0]?.by.planRate).toBeCloseTo(
      rateOf(now) - rateOf(reference),
      15,
    );
  });

  // A tenth of a point more fees comes off both sleeves; a yield split
  // out differently moves stocks' return between growth and yield, and
  // nothing the plan rate is made of.
  it("moves the plan rate by the fees, and counts a yield changed alone as a step that moves nothing", () => {
    const fees = movesBetween(reference, {
      ...reference,
      deductions: { dividends: 0.02, fees: 0.003 },
    });
    const yieldOnly = movesBetween(reference, {
      ...reference,
      deductions: { dividends: 0.025, fees: 0.002 },
    });

    expect(fees?.steps[0]?.by.planRate).toBeCloseTo(-0.001, 12);
    expect(yieldOnly?.steps).toStrictEqual([
      { by: { inflation: 0, planRate: 0, real: 0 }, sources: ["deductions"] },
    ]);
  });

  it("takes each source that changed in turn, the steps adding up to the move in all", () => {
    const now: Sources = {
      cma: { latest: lower, previous: cma },
      curve: higher,
      deductions: { dividends: 0.02, fees: 0.003 },
      mappings,
      targets: targetsUnder("Equity"),
    };
    const moves = movesBetween(reference, now);
    const added = (moves?.steps ?? []).reduce(
      (sum, { by }) => sum + by.planRate,
      0,
    );

    expect(moves?.steps.map(({ sources }) => sources)).toStrictEqual([
      ["cma"],
      ["curve"],
      ["targets"],
      ["deductions"],
    ]);
    expect(moves?.now.planRate).toBeCloseTo(rateOf(now), 15);
    expect(added).toBeCloseTo(rateOf(now) - rateOf(reference), 15);
  });

  it("says nothing where the sources before derive no rates, or the sources now", () => {
    expect(movesBetween({ ...reference, cma: null }, reference)).toBeNull();
    expect(movesBetween(reference, { ...reference, cma: null })).toBeNull();
    expect(movesBetween(reference, { ...reference, targets: null })).toBeNull();
  });

  // August without UK cash, which short-dated gilts are moved off onto
  // global aggregate bonds: taken first, the vintage leaves the gilts
  // mapped onto a class it no longer prices, so it is taken together
  // with the mappings that follow it.
  it("takes a source that derives no rates alone together with the ones after it, until they do", () => {
    const gilts = targets.categories.find(
      ({ name }) => name === "Short-dated gilts",
    );
    const now: Sources = {
      ...reference,
      cma: {
        latest: {
          ...cma,
          assets: cma.assets.filter(({ name }) => name !== "UK cash"),
        },
        previous: cma,
      },
      mappings: mappings.map((mapping) =>
        mapping.category === gilts?.id
          ? { ...mapping, asset: "Global aggregate bonds" }
          : mapping,
      ),
    };

    const moves = movesBetween(reference, now);

    expect(moves?.steps.map(({ sources }) => sources)).toStrictEqual([
      ["cma", "targets"],
    ]);
    expect(moves?.steps[0]?.by.planRate).toBeCloseTo(
      rateOf(now) - rateOf(reference),
      15,
    );
  });
});
