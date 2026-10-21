// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

// Each derivation takes a good part of a second, so the ones a test needs
// run side by side.
describe("password", () => {
  it("verifies the password a hash was made from and no other", async () => {
    const [hash, again] = await Promise.all([
      hashPassword("correct horse battery staple"),
      hashPassword("correct horse battery staple"),
    ]);

    expect(hash).toMatch(/^scrypt:N=131072,r=8,p=1:[\da-f]{32}:[\da-f]{128}$/);
    expect(again).not.toBe(hash);
    await expect(
      Promise.all([
        verifyPassword("correct horse battery staple", hash),
        verifyPassword("correct horse battery stable", hash),
      ]),
    ).resolves.toStrictEqual([true, false]);
  });

  it("takes a hash with a line break or a space after it as the hash", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(
      Promise.all([
        verifyPassword("correct horse battery staple", `${hash}\n`),
        verifyPassword("correct horse battery staple", `${hash} `),
      ]),
    ).resolves.toStrictEqual([true, true]);
  });

  it("refuses by name a hash it did not write, at another cost or with a part that is not hex", async () => {
    const salt = "0".repeat(32);
    const key = "0".repeat(128);
    const message =
      "The password hash is not one bun run hash-password writes. Make it again with that.";

    await expect(verifyPassword("anything", "not-a-hash")).rejects.toThrow(
      message,
    );
    await expect(verifyPassword("anything", `${salt}:${key}`)).rejects.toThrow(
      message,
    );
    await expect(
      verifyPassword("anything", `scrypt:N=16384,r=8,p=1:${salt}:${key}`),
    ).rejects.toThrow(message);
    await expect(
      verifyPassword(
        "anything",
        `scrypt:N=131072,r=8,p=1:${"z".repeat(32)}:${key}`,
      ),
    ).rejects.toThrow(message);
    await expect(
      verifyPassword("anything", `scrypt:N=131072,r=8,p=1:${salt}:abcd`),
    ).rejects.toThrow(message);
  });
});
