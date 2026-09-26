// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { termOf } from "@/lib/loans";

import { ageIn, debtTermOf, endAge, planOf } from "./plan";

describe("ageIn", () => {
  it("reads the age the plan's owner reaches in a year, and in the plan's last", () => {
    const plan = planOf({ ends: 91, retires: 61 }, { month: 8, year: 2026 });

    expect(ageIn(2026, plan)).toBe(34);
    expect(endAge(plan)).toBe(91);
  });
});

describe("debtTermOf", () => {
  const plan = planOf({ ends: 91, retires: 61 }, { month: 8, year: 2026 });

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
      planOf({ ends: 91, retires: 61 }, { month: 8, year: 2026 }),
    ).toStrictEqual({
      born: 1992,
      from: 2026,
      month: 8,
      rate: 0.05,
      retires: 61,
      years: 57,
    });
  });

  // Born in 1992, a plan to 28 has run its course by 2026, and runs no
  // years forward rather than a count below nothing.
  it("runs no years forward once its age is reached", () => {
    expect(
      planOf({ ends: 28, retires: 28 }, { month: 8, year: 2026 }),
    ).toMatchObject({ from: 2026, years: 0 });
  });
});
