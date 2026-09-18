import { describe, expect, it } from "vitest";

import { clearsIn, paymentOf, rateOf, termOf } from "./loans";

describe("paymentOf", () => {
  // £100,000 at 6% over 30 years is the textbook £599.55 a month.
  it("finds the annuity payment that clears the balance over the term", () => {
    expect(paymentOf(100000, 0.06, 30)).toBeCloseTo(599.55, 2);
    expect(paymentOf(341810, 0.0515, 22)).toBeCloseTo(2166.33, 2);
  });

  it("spreads the balance flat at no rate, and clears a term of nothing in one payment", () => {
    expect(paymentOf(120000, 0, 10)).toBe(1000);
    expect(paymentOf(1000, 0.12, 0)).toBeCloseTo(1010, 10);
  });
});

describe("termOf", () => {
  it("finds the years the payment takes to clear the balance at the rate", () => {
    expect(termOf(341810, 2210, 0.0515)).toBeCloseTo(21.21, 2);
    expect(termOf(100000, 599.55, 0.06)).toBeCloseTo(30, 3);
  });

  // A rate too small to move one in floating point would have the
  // formula divide nothing by nothing, so it is spread flat as well.
  it("spreads the balance flat at no rate, or one too small to compound", () => {
    expect(termOf(120000, 1000, 0)).toBe(10);
    expect(termOf(120000, 1000, 1e-18)).toBe(10);
  });

  it("clears nothing owed at once, and never clears with nothing paid or a payment the interest swallows", () => {
    expect(termOf(0, 2210, 0.0515)).toBe(0);
    expect(termOf(341810, 0, 0.0515)).toBeNull();
    expect(termOf(100000, 500, 0.06)).toBeNull();
  });
});

describe("rateOf", () => {
  it("finds the rate at which the payment clears the balance over the term", () => {
    expect(rateOf(100000, 599.55, 30)).toBeCloseTo(0.06, 5);
    expect(rateOf(341810, 2210, 22)).toBeCloseTo(0.0537, 4);
  });

  // £990 a month clears £1,000 in a year only at nearly twelve hundred per
  // cent, above the first ceiling tried, so the ceiling is raised until
  // it is enough.
  it("finds a rate above the first ceiling by raising it", () => {
    const rate = rateOf(1000, 990, 1);

    expect(rate).not.toBeNull();
    expect(rate).toBeGreaterThan(1);
    expect(paymentOf(1000, rate ?? 0, 1)).toBeCloseTo(990, 6);
  });

  it("finds no rate when the payments fall short of the balance, and none at all when they meet it", () => {
    expect(rateOf(120000, 999, 10)).toBeNull();
    expect(rateOf(120000, 1000, 10)).toBe(0);
    expect(rateOf(0, 2210, 22)).toBe(0);
  });
});

describe("clearsIn", () => {
  // The plan's month is a paying month. 114 payments from January end in
  // June 2035 and from September, with eight months of the year gone, in
  // February 2036. The 120th falls in December 2035 from January and
  // November 2036 from December, and the 124th in December 2036 from
  // September: a term landing on a year end stays in the year it lands
  // in rather than running into the next. A single payment made in
  // December falls in the year it is made.
  it("finds the year the last payment falls in, counted from the month the plan is read in", () => {
    expect(clearsIn(9.5, { from: 2026, month: 0 })).toBe(2035);
    expect(clearsIn(9.5, { from: 2026, month: 8 })).toBe(2036);
    expect(clearsIn(10, { from: 2026, month: 0 })).toBe(2035);
    expect(clearsIn(10, { from: 2026, month: 11 })).toBe(2036);
    expect(clearsIn(124 / 12, { from: 2026, month: 8 })).toBe(2036);
    expect(clearsIn(1 / 12, { from: 2026, month: 11 })).toBe(2026);
  });

  // A term worked out from a loan's figures carries floating point, so
  // one a whisker over a whole number of months is that many payments.
  it("absorbs the floating point a worked-out term carries", () => {
    expect(clearsIn(10 + 1e-12, { from: 2026, month: 0 })).toBe(2035);
  });
});
