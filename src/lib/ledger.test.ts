import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";

import {
  fixedMonthly,
  formatContribution,
  formatGrowth,
  formatMonthly,
} from "./ledger";

const [pension, isa, cash, , mortgage] = accounts;

describe("fixedMonthly", () => {
  it("takes a fixed sum a month at either cadence, and nothing for the spare money or none", () => {
    expect(fixedMonthly(pension)).toBe(27195 / 12);
    expect(fixedMonthly(mortgage)).toBe(2210);
    expect(
      fixedMonthly({ ...isa, contribution: { cap: null, kind: "spare" } }),
    ).toBe(0);
    expect(fixedMonthly(cash)).toBe(0);
  });
});

describe("formatContribution", () => {
  // A year's sum is written as a twelfth of it, to the pound.
  it("writes a fixed sum a month whatever its cadence, and a flat dash for none", () => {
    expect(formatContribution(pension)).toBe("£2,266 / mo");
    expect(formatContribution(mortgage)).toBe("£2,210 / mo");
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
    expect(formatMonthly(1389.58)).toBe("£1,390 / mo");
    expect(formatMonthly(-2243)).toBe("−£2,243 / mo");
  });
});

describe("formatGrowth", () => {
  it("writes a fixed rate as a percentage, and the plan's by name", () => {
    expect(formatGrowth({ kind: "fixed", rate: 0.0515 })).toBe("5.15%");
    expect(formatGrowth({ kind: "fixed", rate: 0 })).toBe("0.00%");
    expect(formatGrowth({ kind: "plan" })).toBe("Plan rate");
  });
});
