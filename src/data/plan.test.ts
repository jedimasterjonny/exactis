// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";
import { termOf } from "@/lib/loans";

import {
  ageIn,
  debtTermOf,
  endAge,
  growthFrom,
  planOf,
  pricesIn,
  risenBy,
} from "./plan";

describe("ageIn", () => {
  it("reads the age the plan's owner reaches in a year, and in the plan's last", () => {
    const plan = planOf(
      { ends: 89, retires: 59 },
      { month: 8, year: 2026 },
      null,
    );

    expect(ageIn(2026, plan)).toBe(36);
    expect(endAge(plan)).toBe(89);
  });
});

describe("debtTermOf", () => {
  const plan = planOf(
    { ends: 89, retires: 59 },
    { month: 8, year: 2026 },
    null,
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
  it("runs from the month given to the ages given", () => {
    expect(
      planOf({ ends: 89, retires: 59 }, { month: 8, year: 2026 }, curve),
    ).toStrictEqual({
      born: 1990,
      from: 2026,
      inflation: inflationOf(curve).rate,
      month: 8,
      rate: 0.05,
      retires: 59,
      years: 53,
    });
  });

  it("takes the Bank's 2% target for inflation before a curve is pulled", () => {
    expect(
      planOf({ ends: 89, retires: 59 }, { month: 8, year: 2026 }, null),
    ).toMatchObject({ inflation: 0.02 });
  });

  // Born in 1990, a plan to 30 has run its course by 2026, and runs no
  // years forward rather than a count below nothing.
  it("runs no years forward once its age is reached", () => {
    expect(
      planOf({ ends: 30, retires: 30 }, { month: 8, year: 2026 }, null),
    ).toMatchObject({ from: 2026, years: 0 });
  });
});

describe("growthFrom", () => {
  // At 3% a year, a line rises 3% with inflation, 4% or 5% a point or
  // two over it, and not at all fixed in nominal terms.
  it("reads each growth choice against the plan's inflation", () => {
    const plan = {
      ...planOf({ ends: 89, retires: 59 }, { month: 8, year: 2026 }, null),
      inflation: 0.03,
    };

    expect(growthFrom({ growth: "inflation" }, plan)).toBeCloseTo(0.03, 15);
    expect(growthFrom({ growth: "inflation-plus-1" }, plan)).toBeCloseTo(
      0.04,
      15,
    );
    expect(growthFrom({ growth: "inflation-plus-2" }, plan)).toBeCloseTo(
      0.05,
      15,
    );
    expect(growthFrom({ growth: "nominal" }, plan)).toBe(0);
  });

  it("grows a line paying a loan at nothing, whatever it says", () => {
    const plan = {
      ...planOf({ ends: 89, retires: 59 }, { month: 8, year: 2026 }, null),
      inflation: 0.03,
    };

    expect(growthFrom({ growth: "inflation-plus-2", pays: 5 }, plan)).toBe(0);
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
