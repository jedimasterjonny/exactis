// @vitest-environment node
import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";

import { fixedMonthly } from "./cadence";

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
