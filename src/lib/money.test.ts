import { describe, expect, it } from "vitest";

import { formatGbp } from "./money";

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
