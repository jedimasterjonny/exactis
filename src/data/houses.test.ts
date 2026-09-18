import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";

import type { HouseDraft, HouseValues } from "./houses";

import {
  derive,
  houseOf,
  isSound,
  paymentOf,
  rateOf,
  termOf,
  toRecords,
} from "./houses";

// The reference kit's house: worth £416,386, with £341,810 owed on it at
// 5.15% and £2,210 paid a month, which clears it in 21.2 years.
const home: HouseValues = {
  balance: 341810,
  growth: 0.02,
  name: "Home",
  payment: 2210,
  rate: 0.0515,
  status: "mortgaged",
  value: 416386,
};

const draft: HouseDraft = { ...home, term: 22 };

// The plan read in September 2026, so eight months of the year are gone.
const plan = { from: 2026, month: 8 };

describe("paymentOf", () => {
  // £100,000 at 6% over 30 years is the textbook £599.55 a month.
  it("finds the annuity payment that clears the balance over the term", () => {
    expect(paymentOf(100000, 0.06, 30)).toBeCloseTo(599.55, 2);
    expect(paymentOf(341810, 0.0515, 22)).toBeCloseTo(2166.33, 2);
  });

  it("spreads the balance flat at no rate, and clears a term of nothing in one payment", () => {
    expect(paymentOf(120000, 0, 10)).toBe(1000);
    expect(paymentOf(1000, 0.12, 0)).toBeCloseTo(1010, 10);
  });
});

describe("termOf", () => {
  it("finds the years the payment takes to clear the balance at the rate", () => {
    expect(termOf(341810, 2210, 0.0515)).toBeCloseTo(21.21, 2);
    expect(termOf(100000, 599.55, 0.06)).toBeCloseTo(30, 3);
  });

  // A rate too small to move one in floating point would have the
  // formula divide nothing by nothing, so it is spread flat as well.
  it("spreads the balance flat at no rate, or one too small to compound", () => {
    expect(termOf(120000, 1000, 0)).toBe(10);
    expect(termOf(120000, 1000, 1e-18)).toBe(10);
  });

  it("clears nothing owed at once, and never clears with nothing paid or a payment the interest swallows", () => {
    expect(termOf(0, 2210, 0.0515)).toBe(0);
    expect(termOf(341810, 0, 0.0515)).toBeNull();
    expect(termOf(100000, 500, 0.06)).toBeNull();
  });
});

describe("rateOf", () => {
  it("finds the rate at which the payment clears the balance over the term", () => {
    expect(rateOf(100000, 599.55, 30)).toBeCloseTo(0.06, 5);
    expect(rateOf(341810, 2210, 22)).toBeCloseTo(0.0537, 4);
  });

  // £990 a month clears £1,000 in a year only at nearly twelve hundred per
  // cent, above the first ceiling tried, so the ceiling is raised until
  // it is enough.
  it("finds a rate above the first ceiling by raising it", () => {
    const rate = rateOf(1000, 990, 1);

    expect(rate).not.toBeNull();
    expect(rate).toBeGreaterThan(1);
    expect(paymentOf(1000, rate ?? 0, 1)).toBeCloseTo(990, 6);
  });

  it("finds no rate when the payments fall short of the balance, and none at all when they meet it", () => {
    expect(rateOf(120000, 999, 10)).toBeNull();
    expect(rateOf(120000, 1000, 10)).toBe(0);
    expect(rateOf(0, 2210, 22)).toBe(0);
  });
});

describe("derive", () => {
  it("works each figure out from the other two, the payment to the pound", () => {
    expect(derive(draft, "payment")).toBe(2166);
    expect(derive(draft, "rate")).toBeCloseTo(0.0537, 4);
    expect(derive(draft, "term")).toBeCloseTo(21.21, 2);
  });
});

describe("isSound", () => {
  it("wants a name, and a mortgage that owes and pays something at a rate no lower than nothing", () => {
    expect(isSound(home)).toBe(true);
    expect(isSound({ ...home, name: "  " })).toBe(false);
    expect(isSound({ ...home, balance: 0 })).toBe(false);
    expect(isSound({ ...home, payment: 0 })).toBe(false);
    expect(isSound({ ...home, rate: -0.01 })).toBe(false);
    expect(
      isSound({ ...home, balance: 0, payment: 0, status: "outright" }),
    ).toBe(true);
  });
});

describe("houseOf", () => {
  const [, , , asset, loan] = accounts;

  // The fixture's home as a house, with its mortgage secured on it: the
  // loan's £182,940 owed comes back positive and its £2,210 a month is
  // the payment; without the loan the house is owned outright.
  it("reads a house's values back off its records", () => {
    const house = { asset: { ...asset, kind: "house" as const }, loan };

    expect(houseOf(house)).toStrictEqual({
      balance: 182940,
      growth: 0.021,
      name: "Home",
      payment: 2210,
      rate: 0.0515,
      status: "mortgaged",
      value: 416386,
    });
    expect(houseOf({ ...house, loan: null })).toStrictEqual({
      balance: 0,
      growth: 0.021,
      name: "Home",
      payment: 0,
      rate: 0,
      status: "outright",
      value: 416386,
    });
  });
});

describe("toRecords", () => {
  it("writes a house owned outright as a real asset growing at its own rate", () => {
    expect(
      toRecords(
        { ...home, balance: 0, payment: 0, rate: 0, status: "outright" },
        plan,
      ),
    ).toStrictEqual({
      asset: {
        balance: 416386,
        cadence: "year",
        cap: 0,
        contribution: 0,
        funding: "fixed",
        growth: "fixed",
        kind: "house",
        name: "Home",
        rate: 0.02,
      },
      mortgage: null,
    });
  });

  // The loan clears in 21.2 years from September 2026, which is 2047.
  it("writes a mortgaged house with the loan against it and the payments to the year it clears", () => {
    const { asset, mortgage } = toRecords(home, plan);

    expect(asset.name).toBe("Home");
    expect(mortgage).toStrictEqual({
      account: {
        balance: -341810,
        cadence: "month",
        cap: 0,
        contribution: 2210,
        funding: "fixed",
        growth: "fixed",
        kind: "debt",
        name: "Home mortgage",
        rate: 0.0515,
      },
      line: {
        amount: 2210,
        cadence: "month",
        firstYear: 2026,
        growth: "nominal",
        kind: "debt",
        lastYear: 2047,
        name: "Home mortgage",
      },
    });
  });

  // The plan's month is a paying month. £1,000 a month at no rate clears
  // £114,000 in 114 payments: from January the last is June 2035, from
  // September, with eight months of the year gone, February 2036. The
  // 120th payment on £120,000 falls in December 2035 from January and
  // November 2036 from December, and the 124th on £124,000 in December
  // 2036 from September: a term landing on a year end stays in the year
  // it lands in rather than running into the next.
  it("ends the payments in the year the last one falls, counted from the month the plan is read in", () => {
    const flat = { ...home, payment: 1000, rate: 0 };
    const lastYear = (
      balance: number,
      month: number,
    ): null | number | undefined =>
      toRecords({ ...flat, balance }, { from: 2026, month }).mortgage?.line
        .lastYear;

    expect(lastYear(114000, 0)).toBe(2035);
    expect(lastYear(114000, 8)).toBe(2036);
    expect(lastYear(120000, 0)).toBe(2035);
    expect(lastYear(120000, 11)).toBe(2036);
    expect(lastYear(124000, 8)).toBe(2036);
    expect(lastYear(1000, 11)).toBe(2026);
  });

  it("leaves the payments open-ended when they never clear the loan", () => {
    expect(
      toRecords({ ...home, payment: 1000 }, plan).mortgage?.line.lastYear,
    ).toBeNull();
  });
});
