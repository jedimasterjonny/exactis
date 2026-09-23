// @vitest-environment node
import { describe, expect, it } from "vitest";

import { stood, thirdOf } from "./figures";

// A draft of the shape each dialog holds: the three figures, and a
// field of its own that is none of them.
interface Draft {
  readonly balloon: number;
  readonly payment: number;
  readonly rate: number;
  readonly term: number;
}

// The patch a dialog sends when a field that is none of the three is
// typed.
const balloon: Partial<Draft> = { balloon: 6000 };

describe("stood", () => {
  it("puts the figure a patch carries first and pushes the other out", () => {
    expect(stood(["rate", "term"], { payment: 290 })).toStrictEqual([
      "payment",
      "rate",
    ]);
    expect(stood(["payment", "rate"], { term: 3 })).toStrictEqual([
      "term",
      "payment",
    ]);
  });

  it("leaves the pair as it is when the patch carries the figure already first", () => {
    expect(stood(["payment", "rate"], { payment: 300 })).toStrictEqual([
      "payment",
      "rate",
    ]);
  });

  it("leaves the two that stand when the patch carries none of the three", () => {
    expect(stood(["rate", "term"], balloon)).toStrictEqual(["rate", "term"]);
  });
});

describe("thirdOf", () => {
  it("names the figure the two given leave out, in either order", () => {
    expect(thirdOf("payment", "rate")).toBe("term");
    expect(thirdOf("rate", "payment")).toBe("term");
    expect(thirdOf("payment", "term")).toBe("rate");
    expect(thirdOf("term", "payment")).toBe("rate");
    expect(thirdOf("rate", "term")).toBe("payment");
    expect(thirdOf("term", "rate")).toBe("payment");
  });
});
