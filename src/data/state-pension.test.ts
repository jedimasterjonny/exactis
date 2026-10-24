// @vitest-environment node
import { describe, expect, it } from "vitest";

import { retiring, statePension } from "@/data/income.fixture";
import { atAge } from "@/data/milestones";
import { owners, sam } from "@/data/owners.fixture";

import {
  qualifyingYearsOf,
  statePensionAge,
  statePensionFrom,
  statePensionLines,
  statePensionOn,
} from "./state-pension";

// The owners fixture's one, born in 1992, so 68 in 2060, and retiring
// at 61, in 2053, so 2052/53 is their last working tax year, on the plan
// whose owner they are.
const [me] = owners;

describe("qualifyingYearsOf", () => {
  it("takes years with no tax year as they stand, whenever the owner retires", () => {
    expect(qualifyingYearsOf({ ...me, qualifyingYears: 13 }, retiring)).toBe(
      13,
    );
    expect(qualifyingYearsOf(sam, retiring)).toBe(0);
  });

  // 2026/27 to 2052/53 is 27 tax years.
  it("counts a year on for each tax year after the one the years run through, to the last before retirement", () => {
    const dated = { ...me, qualifiedThrough: 2025, qualifyingYears: 13 };

    expect(qualifyingYearsOf(dated, retiring)).toBe(40);
    expect(
      qualifyingYearsOf({ ...dated, qualifiedThrough: 2020 }, retiring),
    ).toBe(45);
  });

  // Retiring at 34 is retiring in 2026, the year after the record, and
  // at 28 in 2020, before it.
  it("counts none on for an owner retiring before another tax year is worked", () => {
    const dated = { ...me, qualifiedThrough: 2025, qualifyingYears: 13 };

    expect(
      qualifyingYearsOf({ ...dated, retirement: atAge(34) }, retiring),
    ).toBe(13);
    expect(
      qualifyingYearsOf({ ...dated, retirement: atAge(28) }, retiring),
    ).toBe(13);
  });

  // Retiring at 72, in 2064, the count stops at 2059/60, the last tax
  // year opening before the State Pension age is reached in 2060.
  it("counts no year on past the State Pension age, for an owner working beyond it", () => {
    const dated = { ...me, qualifiedThrough: 2025, qualifyingYears: 0 };

    expect(
      qualifyingYearsOf({ ...dated, retirement: atAge(72) }, retiring),
    ).toBe(34);
  });

  // Sam retires with the plan's owner, in 2053, and at 61 in 2056 on
  // their own.
  it("counts to the retirement of an owner retiring with the plan's owner, or at an age of their own", () => {
    const dated = { ...sam, qualifiedThrough: 2025, qualifyingYears: 0 };

    expect(
      qualifyingYearsOf({ ...dated, retirement: "retirement" }, retiring),
    ).toBe(27);
    expect(
      qualifyingYearsOf({ ...dated, retirement: atAge(61) }, retiring),
    ).toBe(30);
  });
});

describe("statePensionAge", () => {
  it("reads the age off the year born: 66 to 1960, 67 from 1961 to 1977, and 68 from 1978", () => {
    expect(statePensionAge(1950)).toBe(66);
    expect(statePensionAge(1960)).toBe(66);
    expect(statePensionAge(1961)).toBe(67);
    expect(statePensionAge(1977)).toBe(67);
    expect(statePensionAge(1978)).toBe(68);
    expect(statePensionAge(1992)).toBe(68);
  });
});

describe("statePensionFrom", () => {
  it("pays from the year the owner reaches their State Pension age", () => {
    expect(statePensionFrom(me)).toBe(2060);
    expect(statePensionFrom({ born: 1960 })).toBe(2026);
    expect(statePensionFrom({ born: 1961 })).toBe(2028);
  });
});

describe("statePensionOn", () => {
  // £241.30 a week is £12,547.60 a year, held as £12,548; ten years earn
  // ten 35ths of it, £3,585.14, and thirty £10,755.43.
  it("pays the full amount on 35 years or more, nothing on fewer than ten, and a 35th a year between, to the pound", () => {
    expect(statePensionOn(0)).toBe(0);
    expect(statePensionOn(9)).toBe(0);
    expect(statePensionOn(10)).toBe(3585);
    expect(statePensionOn(30)).toBe(10755);
    expect(statePensionOn(35)).toBe(12548);
    expect(statePensionOn(50)).toBe(12548);
  });
});

describe("statePensionLines", () => {
  it("pays an owner with thirty years a line of their own from their State Pension age to the end of the plan, rising with inflation", () => {
    expect(
      statePensionLines({ ...me, qualifyingYears: 30 }, retiring),
    ).toStrictEqual([
      {
        amount: 10755,
        bonus: 0,
        cadence: "year",
        endsAfter: 0,
        endsAt: null,
        feeds: null,
        firstYear: 2060,
        growth: "inflation",
        id: 1,
        kind: "state-pension",
        lastMonth: null,
        lastYear: null,
        match: 0,
        name: "State pension · Me",
        owner: 1,
        rsu: 0,
        sacrifice: 0,
        startsAt: null,
      },
    ]);
  });

  // The income fixture holds the line the household lays for the owners
  // fixture's one, on their 35 years.
  it("pays the full amount on 35 years, as the income fixture holds it", () => {
    expect(statePensionLines(me, retiring)).toStrictEqual([statePension]);
  });

  it("pays an owner with too few years, or none typed, no line", () => {
    expect(
      statePensionLines({ ...me, qualifyingYears: 9 }, retiring),
    ).toStrictEqual([]);
    expect(statePensionLines(sam, retiring)).toStrictEqual([]);
  });

  // Five years through 2025/26 count on to 32, which earn £11,472 a year,
  // retiring at 61; retiring at 34 they stay five, which earn nothing.
  it("pays on the years counted to the retirement the plan lays out", () => {
    const dated = { ...me, qualifiedThrough: 2025, qualifyingYears: 5 };

    expect(statePensionLines(dated, retiring)).toStrictEqual([
      { ...statePension, amount: 11472 },
    ]);
    expect(
      statePensionLines({ ...dated, retirement: atAge(34) }, retiring),
    ).toStrictEqual([]);
  });
});
