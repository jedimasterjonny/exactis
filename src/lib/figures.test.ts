// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isSettled, kept, settled, workedOn } from "./figures";

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

describe("kept", () => {
  it("patches the draft with the figure worked out, and nothing where none fit", () => {
    expect(kept({ figure: 290, worked: "payment" })).toStrictEqual({
      payment: 290,
    });
    expect(kept({ figure: 0.079, worked: "rate" })).toStrictEqual({
      rate: 0.079,
    });
    expect(kept({ figure: 3, worked: "term" })).toStrictEqual({ term: 3 });
    expect(kept({ figure: null, worked: "rate" })).toStrictEqual({});
  });
});

describe("workedOn", () => {
  it("works out the term of a loan the store keeps, else the payment", () => {
    expect(workedOn(true)).toBe("term");
    expect(workedOn(false)).toBe("payment");
  });
});
