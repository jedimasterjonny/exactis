// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isSettled, settled, stood, thirdOf, typedOn } from "./figures";

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

// A secured asset's values as a dialog builds them: the loan's three
// saved figures, and a field of the asset's own that is none of them.
const values = { balance: 14000, name: "Golf", payment: 290, rate: 0.079 };

describe("settled", () => {
  it("owes, pays and charges nothing for an asset with no loan", () => {
    expect(
      settled(values, false, { figure: 300, worked: "payment" }),
    ).toStrictEqual({ balance: 0, name: "Golf", payment: 0, rate: 0 });
  });

  it("puts a worked-out payment or rate in place of the draft's own", () => {
    expect(
      settled(values, true, { figure: 300, worked: "payment" }),
    ).toStrictEqual({ ...values, payment: 300 });
    expect(
      settled(values, true, { figure: 0.05, worked: "rate" }),
    ).toStrictEqual({ ...values, rate: 0.05 });
  });

  it("leaves the draft's figures for a worked-out term, or one with no answer", () => {
    expect(settled(values, true, { figure: 4, worked: "term" })).toStrictEqual(
      values,
    );
    expect(
      settled(values, true, { figure: null, worked: "rate" }),
    ).toStrictEqual(values);
  });
});

describe("isSettled", () => {
  it("holds a loan whose rate could not be worked out, and nothing else", () => {
    expect(isSettled(true, { figure: null, worked: "rate" })).toBe(false);
    expect(isSettled(true, { figure: null, worked: "term" })).toBe(true);
    expect(isSettled(true, { figure: 0.05, worked: "rate" })).toBe(true);
    expect(isSettled(false, { figure: null, worked: "rate" })).toBe(true);
  });
});

describe("typedOn", () => {
  it("stands the payment and the rate a loan keeps, else the rate and the term", () => {
    expect(typedOn(true)).toStrictEqual(["payment", "rate"]);
    expect(typedOn(false)).toStrictEqual(["rate", "term"]);
  });
});
