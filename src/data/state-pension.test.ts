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

// The owners fixture's one, born in 1990, so 68 in 2058, and retiring
// at 59, in 2049, so 2048/49 is their last working tax year, on the plan
// whose owner they are.
const [me] = owners;

describe("qualifyingYearsOf", () => {
  it("takes years with no tax year as they stand, whenever the owner retires", () => {
    expect(qualifyingYearsOf({ ...me, qualifyingYears: 15 }, retiring)).toBe(
      15,
    );
    expect(qualifyingYearsOf(sam, retiring)).toBe(0);
  });

  // 2026/27 to 2048/49 is 23 tax years.
  it("counts a year on for each tax year after the one the years run through, to the last before retirement", () => {
    const dated = { ...me, qualifiedThrough: 2025, qualifyingYears: 15 };

    expect(qualifyingYearsOf(dated, retiring)).toBe(38);
    expect(
      qualifyingYearsOf({ ...dated, qualifiedThrough: 2020 }, retiring),
    ).toBe(43);
  });

  // Retiring at 36 is retiring in 2026, the year after the record, and
  // at 30 in 2020, before it.
  it("counts none on for an owner retiring before another tax year is worked", () => {
    const dated = { ...me, qualifiedThrough: 2025, qualifyingYears: 15 };

    expect(
      qualifyingYearsOf({ ...dated, retirement: atAge(36) }, retiring),
    ).toBe(15);
    expect(
      qualifyingYearsOf({ ...dated, retirement: atAge(30) }, retiring),
    ).toBe(15);
  });

  // Retiring at 70, in 2060, the count stops at 2057/58, the last tax
  // year opening before the State Pension age is reached in 2058.
  it("counts no year on past the State Pension age, for an owner working beyond it", () => {
    const dated = { ...me, qualifiedThrough: 2025, qualifyingYears: 0 };

    expect(
      qualifyingYearsOf({ ...dated, retirement: atAge(70) }, retiring),
    ).toBe(32);
  });

  // Sam retires with the plan's owner, in 2049, and at 59 in 2052 on
  // their own.
  it("counts to the retirement of an owner retiring with the plan's owner, or at an age of their own", () => {
    const dated = { ...sam, qualifiedThrough: 2025, qualifyingYears: 0 };

    expect(
      qualifyingYearsOf({ ...dated, retirement: "retirement" }, retiring),
    ).toBe(23);
    expect(
      qualifyingYearsOf({ ...dated, retirement: atAge(59) }, retiring),
    ).toBe(26);
  });
});

describe("statePensionAge", () => {
  it("reads the age off the year born: 66 to 1960, 67 from 1961 to 1977, and 68 from 1978", () => {
    expect(statePensionAge(1950)).toBe(66);
    expect(statePensionAge(1960)).toBe(66);
    expect(statePensionAge(1961)).toBe(67);
    expect(statePensionAge(1977)).toBe(67);
    expect(statePensionAge(1978)).toBe(68);
    expect(statePensionAge(1990)).toBe(68);
  });
});

describe("statePensionFrom", () => {
  it("pays from the year the owner reaches their State Pension age", () => {
    expect(statePensionFrom(me)).toBe(2058);
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
        firstYear: 2058,
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

  // Five years through 2025/26 count on to 28, which earn £10,038 a year,
  // retiring at 59; retiring at 36 they stay five, which earn nothing.
  it("pays on the years counted to the retirement the plan lays out", () => {
    const dated = { ...me, qualifiedThrough: 2025, qualifyingYears: 5 };

    expect(statePensionLines(dated, retiring)).toStrictEqual([
      { ...statePension, amount: 10038 },
    ]);
    expect(
      statePensionLines({ ...dated, retirement: atAge(36) }, retiring),
    ).toStrictEqual([]);
  });
});
