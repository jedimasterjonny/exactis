import { describe, expect, it } from "vitest";

import { monthName } from "./months";

describe("monthName", () => {
  it("names a month in full or in three letters, January being nought", () => {
    expect(monthName(0, "long")).toBe("January");
    expect(monthName(8, "long")).toBe("September");
    expect(monthName(10, "short")).toBe("Nov");
    expect(monthName(11, "short")).toBe("Dec");
  });
});
