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
  unworded,
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

describe("unworded", () => {
  // An invented record: a kind among two, a list of names, and a sum
  // held to two written rules.
  const record = z.object({
    kind: z.enum(["one", "other"]),
    names: z.array(z.string()),
    sum: z
      .number()
      .nonnegative("A sum is never below nothing")
      .refine((sum) => sum % 2 === 0, "A sum is even"),
  });

  // The refusal of a value of the record, parsed with the map.
  function refusalFor(value: unknown): string | undefined {
    const { error } = record.safeParse(value, { error: unworded });
    return error === undefined ? undefined : refusalOf(error).message;
  }

  it("words every broken rule no schema words itself, said once, and leaves a written rule its own words", () => {
    expect(refusalFor({ kind: "one", names: [], sum: 2 })).toBeUndefined();
    expect(refusalFor({ kind: "neither", sum: "two" })).toBe(
      "Some of it is missing, or not as this app keeps it",
    );
    expect(refusalFor({ kind: "one", names: [], sum: -3 })).toBe(
      "A sum is never below nothing; A sum is even",
    );
    expect(refusalFor({ names: [7], sum: -2 })).toBe(
      "Some of it is missing, or not as this app keeps it; A sum is never below nothing",
    );
  });
});
