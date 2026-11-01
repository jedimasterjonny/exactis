// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { keptIn } from "./maps";

describe("keptIn", () => {
  // A key the map holds nothing for is worked out once and kept; read
  // again it is handed back as kept, without working it out, and a weak
  // map keyed by an object reads alike.
  it("works a value out once and hands back what is kept after", () => {
    const map = new Map<string, number>();
    const make = vi.fn(() => 7);

    expect(keptIn(map, "a", make)).toBe(7);
    expect(keptIn(map, "a", make)).toBe(7);
    expect(make).toHaveBeenCalledTimes(1);
    expect([...map]).toStrictEqual([["a", 7]]);

    const key = {};
    const weak = new WeakMap<object, readonly number[]>();
    const made = keptIn(weak, key, () => [1, 2]);

    expect(keptIn(weak, key, () => [3])).toBe(made);
  });
});
