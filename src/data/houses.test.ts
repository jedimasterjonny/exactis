// @vitest-environment node
import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import {
  homeValues as home,
  homePart,
  house,
  houseLoan,
} from "@/data/houses.fixture";

import type { PartDraft } from "./houses";

import { derive, houseOf, isSound, toRecords } from "./houses";

const draft: PartDraft = { ...homePart, key: 0, term: 22 };

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
  it("wants a name, a price it was bought for, and a mortgage in a sub-account at least, each owing and paying something at a rate no lower than nothing", () => {
    expect(isSound(home)).toBe(true);
    expect(isSound({ ...home, parts: [homePart, homePart] })).toBe(true);
    expect(isSound({ ...home, name: "  " })).toBe(false);
    expect(isSound({ ...home, bought: { ...home.bought, price: 0 } })).toBe(
      false,
    );
    expect(isSound({ ...home, parts: [] })).toBe(false);
    expect(isSound({ ...home, parts: [{ ...homePart, balance: 0 }] })).toBe(
      false,
    );
    expect(
      isSound({ ...home, parts: [homePart, { ...homePart, payment: 0 }] }),
    ).toBe(false);
    expect(isSound({ ...home, parts: [{ ...homePart, rate: -0.01 }] })).toBe(
      false,
    );
    expect(isSound({ ...home, parts: [], status: "outright" })).toBe(true);
  });
});

describe("houseOf", () => {
  // The fixture's home as a house, with its mortgage secured on it: the
  // loan's £182,940 owed comes back positive and its £2,210 a month is
  // the payment; a second loan is a second sub-account, after the first;
  // without a loan the house is owned outright.
  it("reads a house's values back off its records", () => {
    const pair = { asset: house, loans: [houseLoan] };
    const owed = { balance: 182940, payment: 2210, rate: 0.0515 };

    expect(houseOf(pair, plan)).toStrictEqual({
      bought: { month: { month: 5, year: 2022 }, price: 380000 },
      growth: 0.021,
      name: "Home",
      parts: [owed],
      status: "mortgaged",
      value: 416386,
    });
    expect(
      houseOf(
        {
          ...pair,
          loans: [
            houseLoan,
            {
              ...houseLoan,
              balance: -60000,
              contribution: { amount: 400, cadence: "month", kind: "fixed" },
              growth: { kind: "fixed", rate: 0.039 },
              id: 6,
            },
          ],
        },
        plan,
      ).parts,
    ).toStrictEqual([owed, { balance: 60000, payment: 400, rate: 0.039 }]);
    expect(houseOf({ ...pair, loans: [] }, plan)).toStrictEqual({
      bought: { month: { month: 5, year: 2022 }, price: 380000 },
      growth: 0.021,
      name: "Home",
      parts: [],
      status: "outright",
      value: 416386,
    });
  });

  // The household holds a house to carrying its purchase, so a record
  // without one reaches the dialog only as a new house does: it opens
  // on the plan's month, for nothing, and the save holds until it is
  // typed.
  it("opens a house kept without its purchase on the plan's month for nothing", () => {
    const [, , , unbought] = accounts;

    expect(
      houseOf({ asset: { ...unbought, kind: "house" }, loans: [] }, plan)
        .bought,
    ).toStrictEqual({ month: { month: 8, year: 2026 }, price: 0 });
  });
});

describe("toRecords", () => {
  it("writes a house owned outright as a real asset growing at its own rate", () => {
    expect(
      toRecords({ ...home, parts: [], status: "outright" }, plan),
    ).toStrictEqual({
      asset: {
        balance: 416386,
        balloon: 0,
        bought: { month: { month: 5, year: 2022 }, price: 380000 },
        cadence: "year",
        cap: 0,
        contribution: 0,
        funding: "fixed",
        growth: "fixed",
        isAlwaysFunded: false,
        kind: "house",
        name: "Home",
        owner: null,
        rate: 0.021,
      },
      loans: [],
    });
  });

  // Its payments' end is the loan's to say, worked out when the
  // household is read, so the line is saved from the plan's first year
  // and open-ended.
  it("writes a mortgaged house with the loan against it and its payments from the plan's first year, their end left to the loan", () => {
    const { asset, loans } = toRecords(home, plan);

    expect(asset.name).toBe("Home");
    expect(loans).toStrictEqual([
      {
        account: {
          balance: -341810,
          balloon: 0,
          cadence: "month",
          cap: 0,
          contribution: 2210,
          funding: "fixed",
          growth: "fixed",
          isAlwaysFunded: false,
          kind: "debt",
          name: "Home mortgage",
          owner: null,
          rate: 0.0515,
        },
        line: {
          amount: 2210,
          cadence: "month",
          endsAfter: 0,
          endsAt: null,
          firstYear: 2026,
          growth: "nominal",
          lastMonth: null,
          lastYear: null,
          name: "Home mortgage",
          startsAt: null,
        },
      },
    ]);
  });

  // Each sub-account is a loan of its own with its own payments, named
  // by its place so the month end can tell them apart.
  it("writes a mortgage in sub-accounts as a loan each, in their order, numbered", () => {
    const { loans } = toRecords(
      {
        ...home,
        parts: [homePart, { balance: 60000, payment: 400, rate: 0.039 }],
      },
      plan,
    );

    expect(
      loans.map(({ account, line }) => [
        account.name,
        account.balance,
        account.rate,
        line.name,
        line.amount,
      ]),
    ).toStrictEqual([
      ["Home mortgage 1", -341810, 0.0515, "Home mortgage 1", 2210],
      ["Home mortgage 2", -60000, 0.039, "Home mortgage 2", 400],
    ]);
  });
});
