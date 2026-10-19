// @vitest-environment node
import { describe, expect, it } from "vitest";

import { kept } from "@/data/household.fixture";

import { currentShape, stamped, upcast } from "./shapes";

describe("shapes", () => {
  it("stamps a household with the shape it is kept in", () => {
    expect(stamped(kept)).toStrictEqual({ ...kept, shape: currentShape });
  });

  it("reads a household kept before shapes were numbered as the first, as it is", () => {
    expect(upcast(kept)).toStrictEqual(kept);
  });

  it("reads a household kept in this app's shape, with the stamp taken off", () => {
    expect(upcast(stamped(kept))).toStrictEqual(kept);
  });

  // Two steps, each leaving a mark, so a household is seen to run
  // through those from its own shape on and no others.
  it("carries a household through every step from the shape it was kept in", () => {
    const chain = [
      (document: Record<string, unknown>): Record<string, unknown> => ({
        ...document,
        first: true,
      }),
      (document: Record<string, unknown>): Record<string, unknown> => ({
        ...document,
        second: true,
      }),
    ];

    expect(upcast({ next: 2 }, chain)).toStrictEqual({
      first: true,
      next: 2,
      second: true,
    });
    expect(upcast({ next: 2, shape: 2 }, chain)).toStrictEqual({
      next: 2,
      second: true,
    });
    expect(upcast({ next: 2, shape: 3 }, chain)).toStrictEqual({ next: 2 });
  });

  it("refuses a household a newer app kept", () => {
    expect(() => upcast({ ...kept, shape: currentShape + 1 })).toThrow(
      "This household was saved by a newer app than this one",
    );
  });

  it("refuses a stamp that is no shape", () => {
    expect(() => upcast({ ...kept, shape: 0 })).toThrow(
      "Too small: expected number to be >0",
    );
    expect(() => upcast({ ...kept, shape: 1.5 })).toThrow(
      "Invalid input: expected int, received number",
    );
  });

  it("passes what is no object through as it is", () => {
    expect(upcast(undefined)).toBeUndefined();
    expect(upcast(null)).toBeNull();
    expect(upcast([])).toStrictEqual([]);
  });
});
