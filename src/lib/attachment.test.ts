// @vitest-environment node
import { describe, expect, it } from "vitest";

import { attachment } from "./attachment";

describe("attachment", () => {
  it("formats plain filenames as UTF-8 RFC 8187 attachments", () => {
    expect(attachment("northstar.portfolio")).toBe(
      "attachment; filename*=UTF-8''northstar.portfolio",
    );
  });

  it("percent-encodes spaces and RFC 8187 excluded punctuation", () => {
    expect(attachment("Sam's plan (v1)!*.portfolio")).toBe(
      "attachment; filename*=UTF-8''Sam%27s%20plan%20%28v1%29%21%2A.portfolio",
    );
  });

  it("percent-encodes non-ASCII UTF-8 characters", () => {
    expect(attachment("café-£.portfolio")).toBe(
      "attachment; filename*=UTF-8''caf%C3%A9-%C2%A3.portfolio",
    );
  });
});
