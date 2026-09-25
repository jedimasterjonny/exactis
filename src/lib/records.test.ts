// @vitest-environment node
import { describe, expect, it } from "vitest";

import { found, replaced } from "./records";

const owners = [
  { id: 1, name: "Me" },
  { id: 3, name: "Partner" },
];

describe("found", () => {
  it("finds the record with the id, and refuses an id none has, naming what", () => {
    expect(found(owners, 3, "owner")).toBe(owners[1]);
    expect(() => found(owners, 2, "owner")).toThrow("No owner has the id");
  });
});

describe("replaced", () => {
  it("writes the record over the one with its id, in its place", () => {
    expect(replaced(owners, { id: 1, name: "Jo" })).toStrictEqual([
      { id: 1, name: "Jo" },
      { id: 3, name: "Partner" },
    ]);
  });
});
