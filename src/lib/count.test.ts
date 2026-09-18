import { describe, expect, it } from "vitest";

import { counted } from "./count";

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
