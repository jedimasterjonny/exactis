// @vitest-environment node
import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";

import { balanceOf, equityOf, formatMonthly, sumOf } from "./ledger";

const [, , , home, mortgage] = accounts;

// The fixture's five accounts, the mortgage's balance taking away, hold
// £950,771 between them.
describe("balanceOf", () => {
  it("adds up what the accounts hold, a debt's balance taking away, and nothing for none", () => {
    expect(balanceOf(accounts)).toBe(950771);
    expect(balanceOf([])).toBe(0);
  });
});

describe("equityOf", () => {
  it("takes what is owed off the value, and holds all of one owned outright", () => {
    expect(equityOf({ asset: home, loan: mortgage })).toBe(416386 - 182940);
    expect(equityOf({ asset: home, loan: null })).toBe(416386);
    expect(
      equityOf({ asset: home, loan: { ...mortgage, balance: -500000 } }),
    ).toBe(416386 - 500000);
  });
});

describe("sumOf", () => {
  it("sums a figure down a list, and a list of nothing to nothing", () => {
    expect(sumOf(accounts, ({ id }) => id)).toBe(1 + 2 + 3 + 4 + 5);
    expect(sumOf([], () => 1)).toBe(0);
  });
});

describe("formatMonthly", () => {
  it("writes a month's money to the pound, with a real minus", () => {
    expect(formatMonthly(1389.58)).toBe("£1,390 / mo");
    expect(formatMonthly(-2243)).toBe("−£2,243 / mo");
  });
});
