// @vitest-environment node
import { describe, expect, it } from "vitest";

import { planOf } from "./plan";

describe("planOf", () => {
  it("runs from the month given to the ages given", () => {
    expect(
      planOf({ ends: 91, retires: 61 }, { month: 8, year: 2026 }),
    ).toStrictEqual({
      born: 1992,
      from: 2026,
      month: 8,
      rate: 0.05,
      retires: 61,
      years: 57,
    });
  });

  // Born in 1992, a plan to 28 has run its course by 2026, and runs no
  // years forward rather than a count below nothing.
  it("runs no years forward once its age is reached", () => {
    expect(
      planOf({ ends: 28, retires: 28 }, { month: 8, year: 2026 }),
    ).toMatchObject({ from: 2026, years: 0 });
  });
});
