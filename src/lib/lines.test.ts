import { describe, expect, it } from "vitest";

import type { LineValues } from "@/data/schedule";

import { isSound, spanOf } from "./lines";

const salary: LineValues = {
  amount: 1000,
  cadence: "year",
  firstYear: 2030,
  growth: "inflation",
  lastMonth: null,
  lastYear: null,
  name: "Salary",
};

describe("isSound", () => {
  it("takes a named line that does not end before it starts", () => {
    expect(isSound(salary)).toBe(true);
    expect(isSound({ ...salary, lastYear: 2030 })).toBe(true);
    expect(isSound({ ...salary, name: "  " })).toBe(false);
    expect(isSound({ ...salary, lastYear: 2029 })).toBe(false);
  });
});

describe("spanOf", () => {
  it("writes the years a line runs, an open-ended one to the end of the plan", () => {
    expect(spanOf(salary)).toBe("2030–end of plan");
    expect(spanOf({ ...salary, lastYear: 2040 })).toBe("2030–2040");
  });
});
