import { describe, expect, it } from "vitest";

import { totalOf } from "./income";
import { incomeLines } from "./income.fixture";

const [salary, , , statePension] = incomeLines;

describe("totalOf", () => {
  it("sums an employment line's base, bonus and RSUs, and leaves another line's amount as it is", () => {
    expect(totalOf(salary)).toBe(147000);
    expect(totalOf(statePension)).toBe(23400);
  });
});
