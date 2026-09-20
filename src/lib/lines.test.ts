import { describe, expect, it } from "vitest";

import type { LineValues } from "@/data/schedule";

import { endOf, isSound, runsIn, spanOf } from "./lines";

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

describe("endOf", () => {
  it("names the last year, with the month when the line ends part way through it, and nothing for an open end", () => {
    expect(endOf(salary)).toBeNull();
    expect(endOf({ ...salary, lastYear: 2040 })).toBe("2040");
    expect(endOf({ ...salary, lastMonth: 10, lastYear: 2040 })).toBe(
      "Nov 2040",
    );
  });
});

describe("spanOf", () => {
  it("writes the years a line runs, an open-ended one to the end of the plan", () => {
    expect(spanOf(salary)).toBe("2030–end of plan");
    expect(spanOf({ ...salary, lastYear: 2040 })).toBe("2030–2040");
    expect(spanOf({ ...salary, lastMonth: 2, lastYear: 2040 })).toBe(
      "2030–Mar 2040",
    );
  });
});

describe("runsIn", () => {
  const ending = { ...salary, lastMonth: 5, lastYear: 2035 };

  it("runs a line from its first year to its last, or on for good", () => {
    expect(runsIn(salary, { month: 11, year: 2029 })).toBe(false);
    expect(runsIn(salary, { month: 0, year: 2030 })).toBe(true);
    expect(runsIn(salary, { month: 0, year: 2079 })).toBe(true);
    expect(
      runsIn({ ...salary, lastYear: 2035 }, { month: 11, year: 2035 }),
    ).toBe(true);
    expect(
      runsIn({ ...salary, lastYear: 2035 }, { month: 0, year: 2036 }),
    ).toBe(false);
  });

  it("runs a line in its last year to the month it ends in", () => {
    expect(runsIn(ending, { month: 5, year: 2035 })).toBe(true);
    expect(runsIn(ending, { month: 6, year: 2035 })).toBe(false);
    expect(runsIn(ending, { month: 11, year: 2034 })).toBe(true);
  });
});
