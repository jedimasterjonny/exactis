// @vitest-environment node
import { describe, expect, it } from "vitest";

import { acceptedOf, Refusal, refused, saved } from "./answer";

describe("acceptedOf", () => {
  it("hands back what was saved, and throws a refusal in its own words", () => {
    expect(acceptedOf(saved({ id: 1, name: "Me" }))).toStrictEqual({
      id: 1,
      name: "Me",
    });
    expect(() =>
      acceptedOf(refused("An owner who holds an account stays")),
    ).toThrow(new Error("An owner who holds an account stays"));
  });
});

describe("Refusal", () => {
  it("is an error, carrying its words", () => {
    const refusal = new Refusal("A line pays a debt alone");

    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.message).toBe("A line pays a debt alone");
  });
});
