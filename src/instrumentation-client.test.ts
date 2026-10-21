// @vitest-environment node
import { describe, expect, it } from "vitest";
import { config } from "zod";

import "./instrumentation-client";

describe("client instrumentation", () => {
  it("builds zod's parsers without eval", () => {
    expect(config().jitless).toBe(true);
  });
});
