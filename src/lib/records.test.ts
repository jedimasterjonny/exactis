// @vitest-environment node
import { describe, expect, it } from "vitest";

import { found, removed, replaced, written } from "./records";

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

describe("removed", () => {
  it("takes the record with the id off, and refuses an id none has", () => {
    expect(removed(owners, 1, "owner")).toStrictEqual([
      { id: 3, name: "Partner" },
    ]);
    expect(() => removed(owners, 2, "owner")).toThrow("No owner has the id");
  });
});

describe("written", () => {
  it("adds a new record at the end under the next id, and counts on past it", () => {
    expect(
      written(owners, { at: null, next: 4, noun: "owner" }, (id, listed) => ({
        id,
        name: listed === undefined ? "Sam" : "listed",
      })),
    ).toStrictEqual({
      next: 5,
      records: [...owners, { id: 4, name: "Sam" }],
      written: { id: 4, name: "Sam" },
    });
  });

  // The record is built with the one it is written over, so it can keep
  // what that one holds; the next id is left as it was.
  it("writes over the record with the id, in its place, given the one listed", () => {
    expect(
      written(owners, { at: 3, next: 4, noun: "owner" }, (id, listed) => ({
        id,
        name: `${listed?.name ?? ""} Jo`,
      })),
    ).toStrictEqual({
      next: 4,
      records: [
        { id: 1, name: "Me" },
        { id: 3, name: "Partner Jo" },
      ],
      written: { id: 3, name: "Partner Jo" },
    });
    expect(() =>
      written(owners, { at: 2, next: 4, noun: "owner" }, (id) => ({
        id,
        name: "Jo",
      })),
    ).toThrow("No owner has the id");
  });
});
