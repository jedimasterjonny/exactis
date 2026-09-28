// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";
import { termOf } from "@/lib/loans";

import { ageIn, debtTermOf, endAge, planOf } from "./plan";

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
