// @vitest-environment node
import { describe, expect, it } from "vitest";

import { counted, formatCount } from "./count";

describe("formatCount", () => {
  it("sets a count's thousands apart", () => {
    expect(formatCount(1000)).toBe("1,000");
    expect(formatCount(575)).toBe("575");
  });
});

describe("counted", () => {
  it("writes one of a noun in the singular", () => {
    expect(counted(1, "account")).toBe("1 account");
    expect(counted(1, "income line")).toBe("1 income line");
  });

  it("writes every other count in the plural, none included", () => {
    expect(counted(0, "asset")).toBe("0 assets");
    expect(counted(4, "account")).toBe("4 accounts");
    expect(counted(3, "expense line")).toBe("3 expense lines");
  });
});
