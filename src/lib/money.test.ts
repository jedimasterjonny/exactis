// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatGbp, formatPercent, negated } from "./money";

describe("formatGbp", () => {
  it("writes pounds with thousands separators and no pence", () => {
    expect(formatGbp(412880)).toBe("£412,880");
    expect(formatGbp(0)).toBe("£0");
  });

  it("rounds pence away and signs a loss with a real minus", () => {
    expect(formatGbp(1234.56)).toBe("£1,235");
    expect(formatGbp(-182940)).toBe("−£182,940");
  });
});

describe("formatPercent", () => {
  it("writes a fraction as a percentage to two places", () => {
    expect(formatPercent(0.021)).toBe("2.10%");
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatPercent(0.12345)).toBe("12.35%");
  });
});

describe("negated", () => {
  it("turns a figure's sign, and leaves nothing as nothing rather than minus nothing", () => {
    expect(negated(182940)).toBe(-182940);
    expect(negated(-2210)).toBe(2210);
    // toBe compares as Object.is does, which tells minus nothing apart.
    expect(negated(0)).toBe(0);
    expect(formatGbp(negated(0))).toBe("£0");
  });
});
