// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  acceptedOf,
  answerOf,
  Refusal,
  refusalOf,
  refused,
  saved,
} from "./answer";

describe("answerOf", () => {
  it("hands back what the call gives as saved, a refusal it throws in its own words, and fails on anything else", () => {
    expect(answerOf(() => 7)).toStrictEqual(saved(7));
    expect(
      answerOf(() => {
        throw new Refusal("A line pays a debt alone");
      }),
    ).toStrictEqual(refused("A line pays a debt alone"));
    expect(() =>
      answerOf(() => {
        throw new Error("boom");
      }),
    ).toThrow(new Error("boom"));
  });
});

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

describe("refusalOf", () => {
  it("refuses in the words of every rule broken, each said once", () => {
    const error = new z.ZodError([
      { code: "custom", input: null, message: "A name is words", path: [0] },
      { code: "custom", input: null, message: "A sum is whole", path: [1] },
      { code: "custom", input: null, message: "A name is words", path: [2] },
    ]);

    expect(refusalOf(error)).toStrictEqual(
      new Refusal("A name is words; A sum is whole"),
    );
  });
});
