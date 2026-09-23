// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { readEnv } from "./env";

describe("readEnv", () => {
  it("reads a variable that is set", () => {
    vi.stubEnv("EXACTIS_PROBE", "set");

    expect(readEnv("EXACTIS_PROBE")).toBe("set");
  });

  it("fails by name on one that is missing or empty", () => {
    vi.stubEnv("EXACTIS_PROBE", "");

    expect(() => readEnv("EXACTIS_PROBE")).toThrow("EXACTIS_PROBE is not set");
    expect(() => readEnv("EXACTIS_ABSENT")).toThrow(
      "EXACTIS_ABSENT is not set",
    );
  });
});
