// @vitest-environment node
import { describe, expect, it } from "vitest";

import { schoolLeavingAge } from "./children";

describe("schoolLeavingAge", () => {
  // Born in March 2015, Year 13 ends in the summer of 2033, at 18 by the
  // year born; in October 2016, in 2035, at 19; in February 2021, in
  // 2039, at 18.
  it("is 18 for a child born from January to August and 19 for one born from September to December", () => {
    expect(schoolLeavingAge({ month: 2, year: 2015 })).toBe(18);
    expect(schoolLeavingAge({ month: 9, year: 2016 })).toBe(19);
    expect(schoolLeavingAge({ month: 1, year: 2021 })).toBe(18);
  });

  // The school year runs from the first of September to the last of
  // August, so the two months either side of it fall in different years.
  it("turns on September, from the first of it, leaving one born in August a year ahead", () => {
    expect(schoolLeavingAge({ month: 7, year: 2019 })).toBe(18);
    expect(schoolLeavingAge({ month: 8, year: 2019 })).toBe(19);
    expect(schoolLeavingAge({ month: 0, year: 2019 })).toBe(18);
    expect(schoolLeavingAge({ month: 11, year: 2019 })).toBe(19);
  });
});
