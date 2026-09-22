import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";

import { formatContribution, formatGrowth } from "./ledger";

const [pension, isa, cash, , mortgage] = accounts;

describe("formatContribution", () => {
  it("writes a fixed sum at its cadence, and a flat dash for none", () => {
    expect(formatContribution(pension)).toBe("£27,195 / yr");
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

describe("formatGrowth", () => {
  it("writes a fixed rate as a percentage, and the plan's by name", () => {
    expect(formatGrowth({ kind: "fixed", rate: 0.0515 })).toBe("5.15%");
    expect(formatGrowth({ kind: "fixed", rate: 0 })).toBe("0.00%");
    expect(formatGrowth({ kind: "plan" })).toBe("Plan rate");
  });
});
