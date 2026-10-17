// @vitest-environment node
import { describe, expect, it } from "vitest";

import { statePension } from "@/data/income.fixture";
import { owners, sam } from "@/data/owners.fixture";

import {
  statePensionAge,
  statePensionFrom,
  statePensionLines,
  statePensionOn,
} from "./state-pension";

// The owners fixture's one, born in 1990, so 68 in 2058.
const [me] = owners;

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
    expect(statePensionLines({ ...me, qualifyingYears: 30 })).toStrictEqual([
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
    expect(statePensionLines(me)).toStrictEqual([statePension]);
  });

  it("pays an owner with too few years, or none typed, no line", () => {
    expect(statePensionLines({ ...me, qualifyingYears: 9 })).toStrictEqual([]);
    expect(statePensionLines(sam)).toStrictEqual([]);
  });
});
