// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import type { CarDraft, CarValues } from "./cars";

import { carOf, clearsAfter, derive, isSound, toRecords } from "./cars";

// A Golf worth £18,000 and losing 15% a year, with £14,000 owed on it
// at 7.9% on a PCP paying £290 a month towards a £6,000 balloon, which
// it reaches in three years and, carried on, clears in 4.9.
const golf: CarValues = {
  agreement: "pcp",
  balance: 14000,
  balloon: 6000,
  depreciation: 0.15,
  name: "Golf",
  payment: 290,
  rate: 0.079,
  value: 18000,
};

// The same car on a loan, which £438 a month clears in three years.
const financed: CarValues = {
  ...golf,
  agreement: "loan",
  balloon: 0,
  payment: 438,
};

const outright: CarValues = {
  ...golf,
  agreement: "outright",
  balance: 0,
  balloon: 0,
  payment: 0,
  rate: 0,
};

const draft: CarDraft = { ...golf, term: 3 };

// The Golf as the store holds it: the car, and the finance secured on
// it.
const asset: Account = {
  balance: 18000,
  growth: { kind: "fixed", rate: -0.15 },
  id: 6,
  kind: "car",
  name: "Golf",
};

const loan: Account = {
  balance: -14000,
  contribution: { amount: 438, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.079 },
  id: 7,
  kind: "debt",
  name: "Golf loan",
  secures: 6,
};

const pcp: Account = {
  ...loan,
  balloon: 6000,
  contribution: { amount: 290, cadence: "month", kind: "fixed" },
  name: "Golf PCP",
};

// The plan read in September 2026, so eight months of the year are gone.
const plan = { from: 2026 };

describe("derive", () => {
  it("works each figure out from the other two, down to the balloon, the payment to the pound", () => {
    expect(derive(draft, "payment")).toBe(290);
    expect(derive(draft, "rate")).toBeCloseTo(0.0792, 4);
    expect(derive(draft, "term")).toBeCloseTo(3, 2);
  });

  // A balloon left in a field the agreement hides is no balloon.
  it("works a loan's figures out down to nothing, whatever balloon the draft holds", () => {
    expect(derive({ ...financed, term: 3 }, "payment")).toBe(438);
    expect(derive({ ...financed, term: 3 }, "term")).toBeCloseTo(3, 2);
    expect(derive({ ...financed, balloon: 6000, term: 3 }, "payment")).toBe(
      438,
    );
  });
});

describe("clearsAfter", () => {
  // The balloon is refinanced on the same terms, so the £290 carries on
  // until the whole £14,000 is cleared; £90 a month never clears it.
  it("finds the years the payment takes to clear the whole balance, balloon and all", () => {
    expect(clearsAfter(golf)).toBeCloseTo(4.86, 2);
    expect(clearsAfter(financed)).toBeCloseTo(3, 2);
    expect(clearsAfter({ ...golf, payment: 90 })).toBeNull();
  });
});

describe("isSound", () => {
  it("wants a name, and finance that owes and pays something at a rate no lower than nothing", () => {
    expect(isSound(golf)).toBe(true);
    expect(isSound(financed)).toBe(true);
    expect(isSound(outright)).toBe(true);
    expect(isSound({ ...golf, name: "  " })).toBe(false);
    expect(isSound({ ...golf, balance: 0 })).toBe(false);
    expect(isSound({ ...golf, payment: 0 })).toBe(false);
    expect(isSound({ ...golf, rate: -0.01 })).toBe(false);
  });

  // A PCP owes more than a balloon of something; a loan has none.
  it("wants a PCP's balloon to be something and below the balance, and a loan to have none", () => {
    expect(isSound({ ...golf, balloon: 0 })).toBe(false);
    expect(isSound({ ...golf, balloon: 14000 })).toBe(false);
    expect(isSound({ ...financed, balloon: 6000 })).toBe(false);
  });
});

describe("carOf", () => {
  // The loan's £14,000 owed comes back positive, its £6,000 balloon says
  // it is a PCP, and the car's rate comes back as the depreciation it
  // is; a loan with no balloon is a loan, and no loan is a car owned
  // outright.
  it("reads a car's values back off its records", () => {
    expect(carOf({ asset, loan: pcp })).toStrictEqual(golf);
    expect(carOf({ asset, loan })).toStrictEqual(financed);
    expect(carOf({ asset, loan: null })).toStrictEqual(outright);
  });

  it("reads a car that loses nothing as losing nothing, not a negative nothing", () => {
    expect(
      carOf({
        asset: { ...asset, growth: { kind: "fixed", rate: 0 } },
        loan: null,
      }).depreciation,
    ).toBe(0);
  });
});

describe("toRecords", () => {
  it("writes a car owned outright as a real asset losing value at its own rate", () => {
    expect(toRecords(outright, plan)).toStrictEqual({
      asset: {
        balance: 18000,
        balloon: 0,
        cadence: "year",
        cap: 0,
        contribution: 0,
        funding: "fixed",
        growth: "fixed",
        isAlwaysFunded: false,
        kind: "car",
        name: "Golf",
        owner: null,
        rate: -0.15,
      },
      loan: null,
    });
  });

  // Its payments' end is the finance's to say, worked out when the
  // household is read, so the line is saved from the plan's first year
  // and open-ended.
  it("writes a car on a PCP with the finance against it, left owing the balloon, and its payments from the plan's first year, their end left to the finance", () => {
    const { asset: written, loan } = toRecords(golf, plan);

    expect(written.name).toBe("Golf");
    expect(loan).toStrictEqual({
      account: {
        balance: -14000,
        balloon: 6000,
        cadence: "month",
        cap: 0,
        contribution: 290,
        funding: "fixed",
        growth: "fixed",
        isAlwaysFunded: false,
        kind: "debt",
        name: "Golf PCP",
        owner: null,
        rate: 0.079,
      },
      line: {
        amount: 290,
        cadence: "month",
        firstYear: 2026,
        growth: "nominal",
        kind: "debt",
        lastMonth: null,
        lastYear: null,
        name: "Golf PCP",
      },
    });
  });

  it("writes a car on a loan with no balloon, named for the loan", () => {
    const { loan } = toRecords(financed, plan);

    expect(loan?.account.balloon).toBe(0);
    expect(loan?.account.name).toBe("Golf loan");
  });

  it("writes a car that loses nothing at a rate of nothing, not a negative nothing", () => {
    expect(toRecords({ ...outright, depreciation: 0 }, plan).asset.rate).toBe(
      0,
    );
  });
});
