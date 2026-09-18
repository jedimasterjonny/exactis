import { describe, expect, it } from "vitest";

import { contributionOf, sacrificeOf, totalOf } from "./income";
import { incomeLines } from "./income.fixture";

const [salary, stepUp, , statePension] = incomeLines;

describe("totalOf", () => {
  it("sums an employment line's base, bonus and RSUs, and leaves another line's amount as it is", () => {
    expect(totalOf(salary)).toBe(147000);
    expect(totalOf(statePension)).toBe(23400);
  });
});

describe("sacrificeOf", () => {
  // A tenth of the £120,000 base, and none of the bonus or the RSUs.
  it("takes the share of the base alone, and nothing from a line giving up none", () => {
    expect(sacrificeOf(salary)).toBe(12000);
    expect(sacrificeOf(stepUp)).toBe(0);
    expect(sacrificeOf(statePension)).toBe(0);
  });
});

describe("contributionOf", () => {
  // The £12,000 sacrificed and the employer's fifteen per cent NI saved
  // on it, £1,800, land together.
  it("pays the sacrifice into the pension with the employer's NI saved on it", () => {
    expect(contributionOf(salary)).toBeCloseTo(13800, 8);
    expect(contributionOf(stepUp)).toBe(0);
  });
});
