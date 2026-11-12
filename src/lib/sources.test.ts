// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { cma } from "@/data/cma.fixture";
import { kept } from "@/data/household.fixture";
import { house, houseLoan } from "@/data/houses.fixture";
import { curve } from "@/data/inflation.fixture";

import { sourcesOf } from "./sources";

// A second house, kept with no purchase, invented.
const annexe: Account = {
  balance: 150_000,
  growth: { kind: "fixed", rate: 0.02 },
  id: 30,
  kind: "house",
  name: "Annexe",
};

// The reference household on the CMA's rates, its home the house it is,
// bought in October 2021, with its mortgage against it: August 2026's
// vintage, the first of September's curve, and the index to July 2026,
// pulled on 15 September 2026.
const housed = {
  ...kept,
  accounts: [...accounts.slice(0, 3), house, houseLoan],
  rateSet: "cma" as const,
};

describe("sourcesOf", () => {
  // January 2027's close: October's vintage is three months before it,
  // September's four.
  it("marks the CMA stale once its vintage is four months before the month, across a year end", () => {
    const at = (month: number): ReturnType<typeof sourcesOf> =>
      sourcesOf(
        {
          ...kept,
          cma: {
            latest: { ...cma, vintage: { month, year: 2026 } },
            previous: null,
          },
        },
        { month: 0, year: 2027 },
      );

    expect(at(9)).toStrictEqual([{ isStale: false, source: "cma" }]);
    expect(at(8)).toStrictEqual([{ isStale: true, source: "cma" }]);
  });

  // January 2027's close again: a curve of the first of December is a
  // month before it, one of the last of November two.
  it("marks the curve stale once its day is two months before the month, under the CMA's rates", () => {
    const at = (asOf: string): ReturnType<typeof sourcesOf> =>
      sourcesOf(
        { ...housed, curve: { ...curve, asOf } },
        { month: 0, year: 2027 },
      );

    expect(at("2026-12-01")).toStrictEqual([
      { isStale: true, source: "cma" },
      { isStale: false, source: "curve" },
      { isStale: true, source: "housePrices" },
    ]);
    expect(at("2026-11-30")).toStrictEqual([
      { isStale: true, source: "cma" },
      { isStale: true, source: "curve" },
      { isStale: true, source: "housePrices" },
    ]);
  });

  // Nothing the custom rates run on reads the curve, however old.
  it("offers no curve under the custom rates", () => {
    expect(
      sourcesOf({ ...housed, rateSet: "custom" }, { month: 0, year: 2027 }),
    ).toStrictEqual([
      { isStale: true, source: "cma" },
      { isStale: true, source: "housePrices" },
    ]);
  });

  // October 2026's close, cut on Friday 23 October: an index to August
  // is two months before it; one to July is three, and stale until it
  // is pulled on the cut or after it.
  it("marks house prices stale once the index is three months before the month, until pulled since its cut", () => {
    const at = (
      to: number,
      pulledOn: string,
    ): ReturnType<typeof sourcesOf>[number] | undefined =>
      sourcesOf(
        {
          ...housed,
          housePrices: {
            from: { month: 9, year: 2021 },
            pulledOn,
            to: { month: to, year: 2026 },
          },
        },
        { month: 9, year: 2026 },
      ).at(-1);

    expect(at(7, "2026-09-16")).toStrictEqual({
      isStale: false,
      source: "housePrices",
    });
    expect(at(6, "2026-10-22")).toStrictEqual({
      isStale: true,
      source: "housePrices",
    });
    expect(at(6, "2026-10-23")).toStrictEqual({
      isStale: false,
      source: "housePrices",
    });
    expect(at(6, "2026-10-24")).toStrictEqual({
      isStale: false,
      source: "housePrices",
    });
  });

  // The pull revalues the one house with its purchase, so a second
  // house without one leaves the row offered.
  it("offers house prices where one house with its purchase is listed beside one without", () => {
    expect(
      sourcesOf(
        { ...housed, accounts: [...housed.accounts, annexe] },
        { month: 9, year: 2026 },
      ).map(({ source }) => source),
    ).toStrictEqual(["cma", "curve", "housePrices"]);
  });

  it("offers no house prices where no house is listed, or two with their purchases", () => {
    for (const listed of [
      accounts,
      [...housed.accounts, { ...house, id: 30, name: "Annexe" }],
    ]) {
      expect(
        sourcesOf(
          { ...housed, accounts: listed },
          { month: 9, year: 2026 },
        ).map(({ source }) => source),
      ).toStrictEqual(["cma", "curve"]);
    }
  });

  it("marks nothing stale that was never pulled", () => {
    expect(
      sourcesOf(
        { ...housed, cma: null, curve: null, housePrices: null },
        { month: 0, year: 2027 },
      ),
    ).toStrictEqual([
      { isStale: false, source: "cma" },
      { isStale: false, source: "curve" },
      { isStale: false, source: "housePrices" },
    ]);
  });
});
