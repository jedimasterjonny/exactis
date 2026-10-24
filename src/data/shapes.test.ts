// @vitest-environment node
import { describe, expect, it } from "vitest";

import { sipp } from "@/data/accounts.fixture";
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

  // The first shape dropped a pension in a month short of it unless it
  // was marked always funded, and the second keeps every pension paid
  // unless it is marked droppable: the old mark comes off a pension that
  // had it, one without it is as it was, and neither is marked
  // droppable, while the rest of the household is left as found.
  it("takes the mark of a pension always funded off every account kept in the first shape, and marks none droppable", () => {
    const [pension, ...others] = kept.accounts;
    const first = {
      ...kept,
      accounts: [{ ...pension, isAlwaysFunded: true }, sipp, ...others],
    };

    expect(upcast(first)).toStrictEqual({
      ...kept,
      accounts: [pension, sipp, ...others],
    });
    expect(upcast({ ...first, shape: 2 })).toStrictEqual(first);
  });

  // The second shape lists no children, so the third reads it as it is;
  // the step is there so that a build of the second refuses the third.
  it("carries a household kept in the second shape to the third as it is", () => {
    expect(upcast({ ...kept, shape: 2 })).toStrictEqual(kept);
  });

  // A step carries what it finds and leaves what it does not: an entry
  // that is no account, and a household with no list of accounts, are
  // left for the household's own rules to refuse.
  it("carries what is no list of accounts, and no account, as it is found", () => {
    expect(upcast({ next: 2 })).toStrictEqual({ next: 2 });
    expect(upcast({ accounts: "none" })).toStrictEqual({ accounts: "none" });
    expect(upcast({ accounts: [1, null, "none"] })).toStrictEqual({
      accounts: [1, null, "none"],
    });
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
