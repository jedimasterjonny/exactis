// @vitest-environment node
import { describe, expect, it } from "vitest";

import { accounts, sipp } from "@/data/accounts.fixture";

import {
  balanceOf,
  drawingTaxOf,
  equityOf,
  formatMonthly,
  sumOf,
} from "./ledger";

const [pension, , , home, mortgage] = accounts;

// The fixture's five accounts, the mortgage's balance taking away, hold
// £901,462 between them.
describe("balanceOf", () => {
  it("adds up what the accounts hold, a debt's balance taking away, and nothing for none", () => {
    expect(balanceOf(accounts)).toBe(901462);
    expect(balanceOf([])).toBe(0);
  });
});

// The fixture's £391,640 pension is £97,910 free of tax and £293,730
// at 20%, £58,746. One owner's £1,500,000 and £500,000 are counted
// together, as £2,000,000 against the one allowance, £268,275 free and
// £346,345 of tax where each alone would take a whole allowance and owe
// £300,000 between them; another owner's £100,000 owes its own £15,000.
// A pension with no owner is outside the plan, and its £100,000 owes
// £20,000, the whole of it taxed, as the engine counts it.
describe("drawingTaxOf", () => {
  it("taxes each owner's pensions together against their whole allowance, one with no owner in full, and nothing for none", () => {
    expect(drawingTaxOf(accounts)).toBe(58746);
    expect(
      drawingTaxOf([
        { ...pension, balance: 1500000 },
        { ...pension, balance: 500000, id: 20 },
        { ...pension, balance: 100000, id: 21, owner: 2 },
      ]),
    ).toBe(361345);
    expect(drawingTaxOf([{ ...sipp, balance: 100000 }])).toBe(20000);
    expect(drawingTaxOf([])).toBe(0);
  });
});

describe("equityOf", () => {
  it("takes what is owed off the value, and holds all of one owned outright", () => {
    expect(equityOf({ asset: home, loans: [mortgage] })).toBe(397512 - 176520);
    expect(equityOf({ asset: home, loans: [] })).toBe(397512);
    expect(
      equityOf({ asset: home, loans: [{ ...mortgage, balance: -500000 }] }),
    ).toBe(397512 - 500000);
  });
});

describe("sumOf", () => {
  it("sums a figure down a list, and a list of nothing to nothing", () => {
    expect(sumOf(accounts, ({ id }) => id)).toBe(6 + 2 + 3 + 4 + 5);
    expect(sumOf([], () => 1)).toBe(0);
  });
});

describe("formatMonthly", () => {
  it("writes a month's money to the pound, with a real minus", () => {
    expect(formatMonthly(1274.58)).toBe("£1,275 / mo");
    expect(formatMonthly(-2318)).toBe("−£2,318 / mo");
  });
});
