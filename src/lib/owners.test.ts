// @vitest-environment node
import { describe, expect, it } from "vitest";

import { owners, sam } from "@/data/owners.fixture";

import { firstOwnerOf } from "./owners";

describe("firstOwnerOf", () => {
  it("reads the first listed owner's id, and refuses a list with none in the rule's words", () => {
    expect(firstOwnerOf([sam, ...owners])).toBe(2);
    expect(() => firstOwnerOf([])).toThrow("A plan is somebody's");
  });
});
