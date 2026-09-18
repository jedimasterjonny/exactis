import { describe, expect, it } from "vitest";

import { incomeLines } from "@/data/income.fixture";

import { feedersOf, listed } from "./feeders";

// The fixture's salary feeds the workplace pension, which is the first
// of the accounts fixture; the step-up feeds none until a test says so.
const [salary, stepUp] = incomeLines;

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

describe("listed", () => {
  it("says the names as a sentence lists them", () => {
    expect(listed.format(["Salary"])).toBe("Salary");
    expect(listed.format(["Salary", "Salary step-up"])).toBe(
      "Salary and Salary step-up",
    );
  });
});
