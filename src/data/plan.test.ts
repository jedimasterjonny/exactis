// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { allInStocks, openingRates, planRate } from "@/data/rates";
import { allocation, rates } from "@/data/rates.fixture";
import { termOf } from "@/lib/loans";

import {
  ageIn,
  debtTermOf,
  endAge,
  inflationIn,
  marginOf,
  planOf,
  pricesIn,
  risenBy,
  risenWith,
} from "./plan";

// The rates a household opens with, 5% for stocks and bonds alike and
// the Bank's 2% target, and everything in stocks.
const opening = { allocation: allInStocks, rates: openingRates };

describe("ageIn", () => {
  it("reads the age the plan's owner reaches in a year, and in the plan's last", () => {
    const plan = planOf(
      { ends: 89, retires: 59 },
      { month: 8, year: 2026 },
      opening,
    );

    expect(ageIn(2026, plan)).toBe(36);
    expect(endAge(plan)).toBe(89);
  });
});

describe("debtTermOf", () => {
  const plan = planOf(
    { ends: 89, retires: 59 },
    { month: 8, year: 2026 },
    opening,
  );

  // A PCP owing £14,000, £6,000 of it the balloon, at its own 7.9%.
  const finance: Account = {
    balance: -14000,
    balloon: 6000,
    growth: { kind: "fixed", rate: 0.079 },
    id: 7,
    kind: "debt",
    name: "Golf PCP",
  };

  // A loan owing the same on the plan's 5%, with no balloon to leave.
  const loan: Account = {
    balance: -14000,
    growth: { kind: "plan" },
    id: 8,
    kind: "debt",
    name: "Car loan",
  };

  it("pays a debt down to its balloon at its own rate, or the plan's", () => {
    expect(debtTermOf(finance, 290, plan)).toBe(
      termOf({ balance: 14000, balloon: 6000 }, 290, 0.079),
    );
    expect(debtTermOf(loan, 290, plan)).toBe(
      termOf({ balance: 14000, balloon: 0 }, 290, 0.05),
    );
  });

  it("never pays off a debt whose interest swallows the payment", () => {
    expect(debtTermOf(finance, 50, plan)).toBeNull();
  });
});

describe("planOf", () => {
  // Four fifths at stocks' 7.95% and a fifth at bonds' 4.45%, with the
  // 2.95% typed for inflation.
  it("runs from the month given to the ages given, on the rates given as the savings are split", () => {
    expect(
      planOf(
        { ends: 89, retires: 59 },
        { month: 8, year: 2026 },
        { allocation, rates },
      ),
    ).toStrictEqual({
      born: 1990,
      from: 2026,
      inflation: 0.0295,
      month: 8,
      rate: planRate(rates, allocation),
      retires: 59,
      years: 53,
    });
  });

  // Born in 1990, a plan to 30 has run its course by 2026, and runs no
  // years forward rather than a count below nothing.
  it("runs no years forward once its age is reached", () => {
    expect(
      planOf({ ends: 30, retires: 30 }, { month: 8, year: 2026 }, opening),
    ).toMatchObject({ from: 2026, years: 0 });
  });
});

describe("marginOf", () => {
  // A line rises nothing over prices with inflation, a point or two
  // over them for the choices that say so, and does not rise with them
  // at all fixed in nominal terms.
  it("reads each growth choice as its margin over prices", () => {
    expect(marginOf({ growth: "inflation" })).toBe(0);
    expect(marginOf({ growth: "inflation-plus-1" })).toBeCloseTo(0.01, 15);
    expect(marginOf({ growth: "inflation-plus-2" })).toBeCloseTo(0.02, 15);
    expect(marginOf({ growth: "nominal" })).toBeNull();
  });

  it("does not rise a line paying a loan with prices, whatever it says", () => {
    expect(marginOf({ growth: "inflation-plus-2", pays: 5 })).toBeNull();
  });
});

describe("inflationIn", () => {
  // A path from 2026 holds 2026 and 2027; the plan's 2% is taken before
  // it, past it, and for every year of a plan with none.
  it("reads a year's inflation off the path where it holds one, and the plan's own otherwise", () => {
    const plan = {
      from: 2026,
      inflation: 0.02,
      path: { inflation: [0.1, 0.2], rate: [0, 0] },
    };

    expect(inflationIn(plan, 2026)).toBeCloseTo(0.1, 15);
    expect(inflationIn(plan, 2027)).toBeCloseTo(0.2, 15);
    expect(inflationIn(plan, 2025)).toBeCloseTo(0.02, 15);
    expect(inflationIn(plan, 2028)).toBeCloseTo(0.02, 15);
    expect(inflationIn({ from: 2026, inflation: 0.02 }, 2026)).toBeCloseTo(
      0.02,
      15,
    );
  });
});

describe("pricesIn", () => {
  // At 10% from September 2026, prices stand where they are that month,
  // today's money, and have risen by a tenth the September after.
  it("reads how far prices have risen at the plan's inflation since the plan's first month", () => {
    const plan = { from: 2026, inflation: 0.1, month: 8 };

    expect(pricesIn(plan, { month: 8, year: 2026 })).toBe(1);
    expect(pricesIn(plan, { month: 8, year: 2027 })).toBeCloseTo(1.1, 12);
  });

  // Along a path of 10% in 2026 and 20% in 2027, by September 2027
  // prices have risen four months of the one and eight of the other.
  it("reads how far prices have risen along the plan's path", () => {
    const plan = {
      from: 2026,
      inflation: 0.02,
      month: 8,
      path: { inflation: [0.1, 0.2], rate: [0, 0] },
    };

    expect(pricesIn(plan, { month: 8, year: 2027 })).toBeCloseTo(
      1.1 ** (4 / 12) * 1.2 ** (8 / 12),
      12,
    );
  });
});

describe("risenBy", () => {
  // From September 2026, a rate has risen nothing that month, a whole
  // year's by the September after and half as much again, compounded,
  // six months on from that.
  it("compounds a rate a month at a time from the month the plan starts in", () => {
    const start = { from: 2026, month: 8 };

    expect(risenBy(0.1, start, { month: 8, year: 2026 })).toBe(1);
    expect(risenBy(0.1, start, { month: 8, year: 2027 })).toBeCloseTo(1.1, 12);
    expect(risenBy(0.1, start, { month: 2, year: 2028 })).toBeCloseTo(
      1.1 ** 1.5,
      12,
    );
  });
});

describe("risenWith", () => {
  // At 2% and a point over it, a sum has risen 3% a year on.
  it("compounds the plan's inflation and the margin together for a plan at its own rates", () => {
    const plan = { from: 2026, inflation: 0.02, month: 8 };

    expect(risenWith(0.01, plan, { month: 8, year: 2027 })).toBeCloseTo(
      1.03,
      12,
    );
  });

  // From September 2026 along 10% in 2026 and 20% in 2027, with a point
  // over each: nothing that month, four months at 11% by the new year,
  // eight more at 21% by the September after, and the whole of 2027 and
  // eight months of the plan's 2% and the point, past the path, by
  // September 2028.
  it("compounds each year's inflation along the plan's path, the margin over each, and the plan's own past it", () => {
    const plan = {
      from: 2026,
      inflation: 0.02,
      month: 8,
      path: { inflation: [0.1, 0.2], rate: [0, 0] },
    };

    expect(risenWith(0.01, plan, { month: 8, year: 2026 })).toBe(1);
    expect(risenWith(0.01, plan, { month: 0, year: 2027 })).toBeCloseTo(
      1.11 ** (4 / 12),
      12,
    );
    expect(risenWith(0.01, plan, { month: 8, year: 2027 })).toBeCloseTo(
      1.11 ** (4 / 12) * 1.21 ** (8 / 12),
      12,
    );
    expect(risenWith(0.01, plan, { month: 8, year: 2028 })).toBeCloseTo(
      1.11 ** (4 / 12) * 1.21 * 1.03 ** (8 / 12),
      12,
    );
  });
});
