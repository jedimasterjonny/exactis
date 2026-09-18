import { describe, expect, it } from "vitest";

import { reasonOf } from "./errors";

describe("reasonOf", () => {
  it("reads the words an error carries, and stands in for anything else", () => {
    expect(reasonOf(new Error("A salary feeds a pension alone"))).toBe(
      "A salary feeds a pension alone",
    );
    expect(reasonOf("refused")).toBe("Something went wrong");
    expect(reasonOf(undefined)).toBe("Something went wrong");
  });
});
