// The years a plan's payments are counted from: its first year, and the
// month of it the plan is read in, January being nought.
interface PlanMonth {
  readonly from: number;
  readonly month: number;
}

// The year the last payment falls in. The plan's month is a paying
// month, as the projection carries the first year from it, so the first
// payment lands in that month and the last one payments later, less
// one: the term's months, whole, since a part of a month is a payment.
// Counted in payments rather than time, since a term landing on a year
// end would otherwise be read as the year after it. The whisker below
// the count absorbs the floating point a worked-out term carries, so
// a term that is a whole number of months bar a rounding is one.
export function clearsIn(term: number, plan: PlanMonth): number {
  const payments = Math.ceil(term * 12 - 1e-9);
  return plan.from + Math.floor((plan.month + payments - 1) / 12);
}

// What clears the balance over the term at the rate, a month: the
// annuity payment, with interest compounding monthly at a twelfth of the
// rate, or the balance spread flat when there is none.
export function paymentOf(balance: number, rate: number, term: number): number {
  const months = monthsIn(term);
  const monthly = rate / 12;
  return monthly === 0
    ? balance / months
    : (balance * monthly) / (1 - (1 + monthly) ** -months);
}

// The rate at which the payment clears the balance over the term, found
// by bisection since the annuity formula does not invert: the payment
// rises with the rate, so the rate is closed in on from nothing and from
// a ceiling raised until the payment at it is enough. Nothing at all
// when the payments spread flat fall short of the balance, since no rate
// below nothing is a loan's, and exactly nothing when they meet it.
// Nothing owed is cleared at any rate, so at none.
export function rateOf(
  balance: number,
  payment: number,
  term: number,
): null | number {
  if (balance <= 0) {
    return 0;
  }
  const flat = balance / monthsIn(term);
  if (payment < flat) {
    return null;
  }
  if (payment === flat) {
    return 0;
  }
  let low = 0;
  let high = 1;
  while (paymentOf(balance, high, term) < payment) {
    high *= 2;
  }
  for (let step = 0; step < 64; step += 1) {
    const mid = (low + high) / 2;
    if (paymentOf(balance, mid, term) < payment) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

// The years the payment takes to clear the balance at the rate: the
// months the annuity runs, which the formula gives fractionally, over
// twelve. Nothing owed takes no time; nothing paid, or a payment the
// month's interest swallows, clears it never, which is null. A rate of
// nothing spreads the balance flat, since the formula divides by the
// log of one, and so does a rate too small to move one in floating
// point, since the formula would then divide nothing by nothing.
export function termOf(
  balance: number,
  payment: number,
  rate: number,
): null | number {
  if (balance <= 0) {
    return 0;
  }
  if (payment <= 0) {
    return null;
  }
  const monthly = rate / 12;
  if (1 + monthly === 1) {
    return balance / payment / 12;
  }
  const interest = balance * monthly;
  if (payment <= interest) {
    return null;
  }
  return -Math.log(1 - interest / payment) / Math.log(1 + monthly) / 12;
}

// The months a term runs, whole, and at least one: a term of nothing is
// cleared in a single payment.
function monthsIn(term: number): number {
  return Math.max(1, Math.round(term * 12));
}
