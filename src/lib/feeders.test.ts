// @vitest-environment node
import { describe, expect, it } from "vitest";

import { incomeLines } from "@/data/income.fixture";

import { fedOf, feedersOf, feeding, listed } from "./feeders";

// The fixture's salary feeds the workplace pension, which is the first
// of the accounts fixture; the step-up feeds none until a test says so.
const [salary, stepUp] = incomeLines;

describe("fedOf", () => {
  // A tenth of the salary's £120,000 base with the employer's NI saved
  // on it, £13,800 a year, and the step-up's £1,000 a month at a
  // twentieth of its base, stated a year beside it.
  it("sums what every salary feeding the account lands in it a year, whatever its cadence", () => {
    expect(fedOf(1, incomeLines)).toBeCloseTo(13800, 8);
    expect(
      fedOf(1, [
        salary,
        {
          ...stepUp,
          amount: 20000,
          cadence: "month",
          feeds: 1,
          sacrifice: 0.05,
        },
      ]),
    ).toBeCloseTo(13800 + 13800, 8);
  });

  it("lands nothing in an account nothing feeds", () => {
    expect(fedOf(2, incomeLines)).toBe(0);
    expect(fedOf(1, [])).toBe(0);
  });
});

describe("feedersOf", () => {
  it("names every salary feeding the account", () => {
    expect(feedersOf(1, incomeLines)).toStrictEqual(["Salary"]);
    expect(
      feedersOf(1, [salary, { ...stepUp, feeds: 1, sacrifice: 0.05 }]),
    ).toStrictEqual(["Salary", "Salary step-up"]);
  });

  it("names none for an account nothing feeds", () => {
    expect(feedersOf(2, incomeLines)).toStrictEqual([]);
    expect(feedersOf(1, [])).toStrictEqual([]);
  });
});

describe("feeding", () => {
  it("lists the lines feeding the account, as they are", () => {
    expect(feeding(1, incomeLines)).toStrictEqual([salary]);
    expect(feeding(2, incomeLines)).toStrictEqual([]);
  });
});

describe("listed", () => {
  it("says the names as a sentence lists them", () => {
    expect(listed.format(["Salary"])).toBe("Salary");
    expect(listed.format(["Salary", "Salary step-up"])).toBe(
      "Salary and Salary step-up",
    );
  });
});
