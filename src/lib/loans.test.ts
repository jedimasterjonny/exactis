import { describe, expect, it } from "vitest";

import type { Owed } from "./loans";

import { clearsIn, paymentOf, rateOf, termOf, termTo } from "./loans";

// What is owed, with no balloon unless one is given.
function owed(balance: number, balloon = 0): Owed {
  return { balance, balloon };
}

describe("paymentOf", () => {
  // £100,000 at 6% over 30 years is the textbook £599.55 a month.
  it("finds the annuity payment that clears the balance over the term", () => {
    expect(paymentOf(owed(100000), 0.06, 30)).toBeCloseTo(599.55, 2);
    expect(paymentOf(owed(341810), 0.0515, 22)).toBeCloseTo(2166.33, 2);
  });

  it("spreads the balance flat at no rate, and clears a term of nothing in one payment", () => {
    expect(paymentOf(owed(120000), 0, 10)).toBe(1000);
    expect(paymentOf(owed(1000), 0.12, 0)).toBeCloseTo(1010, 10);
  });

  // A term amortises over the payments its last one is counted to, so
  // the payment a typed term gives is the payment the month it is read
  // back as gives: 25.2 years is 303 payments and not 302, and 0.7
  // years is nine and not eight. A whole term is the months it always
  // was, and so is one a whisker over a whole number of them.
  it("amortises over the payments the term's last one is counted to", () => {
    const plan = { from: 2026, month: 8 };
    const home = owed(240000);

    expect(paymentOf(home, 0.05, 25.2)).toBe(
      paymentOf(home, 0.05, termTo(clearsIn(25.2, plan), plan)),
    );
    expect(paymentOf(home, 0.05, 0.7)).toBe(
      paymentOf(home, 0.05, termTo(clearsIn(0.7, plan), plan)),
    );
    expect(paymentOf(home, 0, 25.2)).toBeCloseTo(240000 / 303, 10);
    expect(paymentOf(home, 0, 0.7)).toBeCloseTo(240000 / 9, 10);
    expect(paymentOf(home, 0, 25)).toBeCloseTo(240000 / 300, 10);
    expect(paymentOf(home, 0, 25 + 1e-12)).toBeCloseTo(240000 / 300, 10);
  });

  // £20,000 at 6% paid down to an £8,000 balloon over four years is
  // £321.82 a month; with no rate the £12,000 difference spreads flat,
  // and a balloon the size of the balance leaves the interest alone to
  // pay.
  it("finds the payment that pays the balance down to a balloon over the term", () => {
    expect(paymentOf(owed(20000, 8000), 0.06, 4)).toBeCloseTo(321.82, 2);
    expect(paymentOf(owed(20000, 8000), 0, 4)).toBe(250);
    expect(paymentOf(owed(20000, 20000), 0.06, 4)).toBeCloseTo(100, 10);
  });
});

describe("termOf", () => {
  it("finds the years the payment takes to clear the balance at the rate", () => {
    expect(termOf(owed(341810), 2210, 0.0515)).toBeCloseTo(21.21, 2);
    expect(termOf(owed(100000), 599.55, 0.06)).toBeCloseTo(30, 3);
  });

  // A rate too small to move one in floating point would have the
  // formula divide nothing by nothing, so it is spread flat as well.
  it("spreads the balance flat at no rate, or one too small to compound", () => {
    expect(termOf(owed(120000), 1000, 0)).toBe(10);
    expect(termOf(owed(120000), 1000, 1e-18)).toBe(10);
  });

  it("clears nothing owed at once, and never clears with nothing paid or a payment the interest swallows", () => {
    expect(termOf(owed(0), 2210, 0.0515)).toBe(0);
    expect(termOf(owed(341810), 0, 0.0515)).toBeNull();
    expect(termOf(owed(100000), 500, 0.06)).toBeNull();
  });

  // The payment that pays down to the balloon over four years takes four
  // years to get there; the same payment carried on clears the whole
  // balance in 6.2 years. A balance already at the balloon takes no
  // time, and a payment the interest swallows never gets there.
  it("finds the years the payment takes to pay the balance down to a balloon", () => {
    const payment = paymentOf(owed(20000, 8000), 0.06, 4);

    expect(termOf(owed(20000, 8000), payment, 0.06)).toBeCloseTo(4, 8);
    expect(termOf(owed(20000), payment, 0.06)).toBeCloseTo(6.22, 2);
    expect(termOf(owed(20000, 8000), 250, 0)).toBe(4);
    expect(termOf(owed(8000, 8000), 300, 0.06)).toBe(0);
    expect(termOf(owed(20000, 8000), 100, 0.06)).toBeNull();
  });
});

describe("rateOf", () => {
  it("finds the rate at which the payment clears the balance over the term", () => {
    expect(rateOf(owed(100000), 599.55, 30)).toBeCloseTo(0.06, 5);
    expect(rateOf(owed(341810), 2210, 22)).toBeCloseTo(0.0537, 4);
  });

  // £990 a month clears £1,000 in a year only at nearly twelve hundred per
  // cent, above the first ceiling tried, so the ceiling is raised until
  // it is enough.
  it("finds a rate above the first ceiling by raising it", () => {
    const rate = rateOf(owed(1000), 990, 1);

    expect(rate).not.toBeNull();
    expect(rate).toBeGreaterThan(1);
    expect(paymentOf(owed(1000), rate ?? 0, 1)).toBeCloseTo(990, 6);
  });

  it("finds no rate when the payments fall short of the balance, and none at all when they meet it", () => {
    expect(rateOf(owed(120000), 999, 10)).toBeNull();
    expect(rateOf(owed(120000), 1000, 10)).toBe(0);
    expect(rateOf(owed(0), 2210, 22)).toBe(0);
  });

  // The rate the payment pays down to the balloon at is the one the
  // payment was found at; £249 a month falls short of the £12,000 to pay
  // down over four years, £250 meets it exactly, and a balance already at
  // the balloon is paid down at no rate.
  it("finds the rate at which the payment pays the balance down to a balloon", () => {
    const pcp = owed(20000, 8000);

    expect(rateOf(pcp, paymentOf(pcp, 0.06, 4), 4)).toBeCloseTo(0.06, 8);
    expect(rateOf(owed(20000, 8000), 249, 4)).toBeNull();
    expect(rateOf(owed(20000, 8000), 250, 4)).toBe(0);
    expect(rateOf(owed(8000, 8000), 300, 4)).toBe(0);
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
  it("finds the month the last payment falls in, counted from the month the plan is read in", () => {
    expect(clearsIn(9.5, { from: 2026, month: 0 })).toStrictEqual({
      month: 5,
      year: 2035,
    });
    expect(clearsIn(9.5, { from: 2026, month: 8 })).toStrictEqual({
      month: 1,
      year: 2036,
    });
    expect(clearsIn(10, { from: 2026, month: 0 })).toStrictEqual({
      month: 11,
      year: 2035,
    });
    expect(clearsIn(10, { from: 2026, month: 11 })).toStrictEqual({
      month: 10,
      year: 2036,
    });
    expect(clearsIn(124 / 12, { from: 2026, month: 8 })).toStrictEqual({
      month: 11,
      year: 2036,
    });
    expect(clearsIn(1 / 12, { from: 2026, month: 11 })).toStrictEqual({
      month: 11,
      year: 2026,
    });
  });

  // A term of nothing, or one too short to be a month, is one payment,
  // made in the plan's month; it never steps back before it.
  it("counts a term of nothing as a single payment in the plan's month", () => {
    expect(clearsIn(0, { from: 2026, month: 0 })).toStrictEqual({
      month: 0,
      year: 2026,
    });
    expect(clearsIn(1e-12, { from: 2026, month: 8 })).toStrictEqual({
      month: 8,
      year: 2026,
    });
  });

  // A term worked out from a loan's figures carries floating point, so
  // one a whisker over a whole number of months is that many payments.
  it("absorbs the floating point a worked-out term carries", () => {
    expect(clearsIn(10 + 1e-12, { from: 2026, month: 0 })).toStrictEqual({
      month: 11,
      year: 2035,
    });
  });
});

describe("termTo", () => {
  // June 2035 is the 114th payment from January 2026 and February 2036
  // the 114th from September; December 2036 is the 124th from
  // September. A term is what clearsIn reads back as the month, so the
  // two invert each other over every month of a decade.
  it("finds the term whose last payment falls in the month, counted from the month the plan is read in", () => {
    expect(
      termTo({ month: 5, year: 2035 }, { from: 2026, month: 0 }),
    ).toBeCloseTo(114 / 12, 10);
    expect(
      termTo({ month: 1, year: 2036 }, { from: 2026, month: 8 }),
    ).toBeCloseTo(114 / 12, 10);
    expect(
      termTo({ month: 11, year: 2036 }, { from: 2026, month: 8 }),
    ).toBeCloseTo(124 / 12, 10);
    const plan = { from: 2026, month: 8 };
    for (let payments = 1; payments <= 120; payments += 1) {
      const end = clearsIn(payments / 12, plan);
      expect(clearsIn(termTo(end, plan), plan)).toStrictEqual(end);
    }
  });

  // The plan's month is the first payment, and a month before it, in
  // the year or the year before, is read as it.
  it("counts the plan's month, and any month before it, as a single payment", () => {
    expect(
      termTo({ month: 8, year: 2026 }, { from: 2026, month: 8 }),
    ).toBeCloseTo(1 / 12, 10);
    expect(
      termTo({ month: 2, year: 2026 }, { from: 2026, month: 8 }),
    ).toBeCloseTo(1 / 12, 10);
    expect(
      termTo({ month: 11, year: 2025 }, { from: 2026, month: 8 }),
    ).toBeCloseTo(1 / 12, 10);
  });
});
