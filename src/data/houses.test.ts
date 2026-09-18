import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";

import type { HouseDraft, HouseValues } from "./houses";

import { derive, houseOf, isSound, toRecords } from "./houses";

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
        balloon: 0,
        cadence: "year",
        cap: 0,
        contribution: 0,
        funding: "fixed",
        growth: "fixed",
        kind: "house",
        name: "Home",
        rate: 0.02,
      },
      loan: null,
    });
  });

  // The loan clears in 21.2 years from September 2026, which is 2047.
  it("writes a mortgaged house with the loan against it and the payments to the year it clears", () => {
    const { asset, loan } = toRecords(home, plan);

    expect(asset.name).toBe("Home");
    expect(loan).toStrictEqual({
      account: {
        balance: -341810,
        balloon: 0,
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
        lastMonth: 10,
        lastYear: 2047,
        name: "Home mortgage",
      },
    });
  });

  // £1,000 a month at no rate clears £114,000 in 114 payments, the last
  // of which falls in February 2036 from September 2026, with eight
  // months of the year gone.
  it("ends the payments in the month the last one falls, counted from the month the plan is read in", () => {
    const { loan } = toRecords(
      { ...home, balance: 114000, payment: 1000, rate: 0 },
      plan,
    );

    expect(loan?.line.lastYear).toBe(2036);
    expect(loan?.line.lastMonth).toBe(1);
  });

  it("leaves the payments open-ended when they never clear the loan", () => {
    const { loan } = toRecords({ ...home, payment: 1000 }, plan);

    expect(loan?.line.lastYear).toBeNull();
    expect(loan?.line.lastMonth).toBeNull();
  });
});
