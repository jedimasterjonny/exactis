// @vitest-environment node
import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { incomeLines } from "@/data/income.fixture";

import {
  equityOf,
  fixedMonthly,
  formatContribution,
  formatGrowth,
  formatMonthly,
  paidMonthly,
} from "./ledger";

const [pension, isa, cash, home, mortgage] = accounts;

describe("equityOf", () => {
  it("takes what is owed off the value, and holds all of one owned outright", () => {
    expect(equityOf({ asset: home, loan: mortgage })).toBe(397512 - 176520);
    expect(equityOf({ asset: home, loan: null })).toBe(397512);
    expect(
      equityOf({ asset: home, loan: { ...mortgage, balance: -500000 } }),
    ).toBe(397512 - 500000);
  });
});

describe("fixedMonthly", () => {
  it("takes a fixed sum a month at either cadence, and nothing for the spare money or none", () => {
    expect(fixedMonthly(pension)).toBe(28512 / 12);
    expect(fixedMonthly(mortgage)).toBe(2180);
    expect(
      fixedMonthly({ ...isa, contribution: { cap: null, kind: "spare" } }),
    ).toBe(0);
    expect(fixedMonthly(cash)).toBe(0);
  });
});

// The fixture's salary sacrifices £16,560 a year into the pension, with
// the employer's NI saved, on top of the pension's own £28,512.
describe("paidMonthly", () => {
  it("adds what the salaries sacrifice a month to an account's own fixed sum", () => {
    const [salary] = incomeLines;

    expect(paidMonthly(pension, [salary])).toBeCloseTo((28512 + 16560) / 12);
    expect(paidMonthly(pension, [])).toBe(28512 / 12);
    expect(paidMonthly(isa, [salary])).toBeCloseTo(20000 / 12);
    expect(
      paidMonthly({ ...cash, contribution: { cap: null, kind: "spare" } }, []),
    ).toBe(0);
  });
});

describe("formatContribution", () => {
  // A year's sum is written as a twelfth of it, to the pound.
  it("writes a fixed sum a month whatever its cadence, and a flat dash for none", () => {
    expect(formatContribution(pension)).toBe("£2,376 / mo");
    expect(formatContribution(mortgage)).toBe("£2,180 / mo");
    expect(formatContribution(cash)).toBe("—");
  });

  // A cap of nothing is the account's own allowance, which cash has
  // none of.
  it("writes the most the spare money takes a year, its allowance when uncapped", () => {
    expect(
      formatContribution({
        ...pension,
        contribution: { cap: null, kind: "spare" },
      }),
    ).toBe("Spare, to £60,000 / yr");
    expect(
      formatContribution({
        ...isa,
        contribution: { cap: 4000, kind: "spare" },
      }),
    ).toBe("Spare, to £4,000 / yr");
    expect(
      formatContribution({
        ...cash,
        contribution: { cap: null, kind: "spare" },
      }),
    ).toBe("Spare, uncapped");
  });
});

describe("formatMonthly", () => {
  it("writes a month's money to the pound, with a real minus", () => {
    expect(formatMonthly(1274.58)).toBe("£1,275 / mo");
    expect(formatMonthly(-2318)).toBe("−£2,318 / mo");
  });
});

describe("formatGrowth", () => {
  it("writes a fixed rate as a percentage, and the plan's by name", () => {
    expect(formatGrowth({ kind: "fixed", rate: 0.0485 })).toBe("4.85%");
    expect(formatGrowth({ kind: "fixed", rate: 0 })).toBe("0.00%");
    expect(formatGrowth({ kind: "plan" })).toBe("Plan rate");
  });
});
