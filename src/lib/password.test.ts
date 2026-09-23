// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifies the password a hash was made from and no other", () => {
    const hash = hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^[\da-f]{32}:[\da-f]{128}$/);
    expect(hashPassword("correct horse battery staple")).not.toBe(hash);
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("correct horse battery stable", hash)).toBe(false);
  });

  it("refuses a hash that is not salt and key", () => {
    const message =
      "The password hash is not salt:key as bun run hash-password writes it";

    expect(() => verifyPassword("anything", "not-a-hash")).toThrow(message);
    expect(() => verifyPassword("anything", "abcd:0123")).toThrow(message);
  });
});
