// @vitest-environment node
import { describe, expect, it } from "vitest";

import { toRoman } from "./roman";

describe("toRoman", () => {
  it.each([
    [1, "I"],
    [2, "II"],
    [4, "IV"],
    [6, "VI"],
    [9, "IX"],
    [14, "XIV"],
    [40, "XL"],
    [90, "XC"],
    [400, "CD"],
    [1994, "MCMXCIV"],
    [3999, "MMMCMXCIX"],
  ])("writes %i as %s", (value, expected) => {
    expect(toRoman(value)).toBe(expected);
  });

  it("writes nothing for zero", () => {
    expect(toRoman(0)).toBe("");
  });
});
