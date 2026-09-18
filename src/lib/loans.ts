// What a loan's payments are over: the balance owed, whole pounds and
// positive, and the balloon they leave standing at the end of the term,
// which is nothing for a loan they clear and the final payment a PCP
// puts off to its end.
export interface Owed {
  readonly balance: number;
  readonly balloon: number;
}

// The years a plan's payments are counted from: its first year, and the
// month of it the plan is read in, January being nought.
interface PlanMonth {
  readonly from: number;
  readonly month: number;
}

// The year the last payment falls in. The plan's month is a paying
// month, as the projection carries the first year from it, so the first
// payment lands in that month and the last one payments later, less
// one: the term's months, whole, since a part of a month is a payment,
// and at least one, since a term of nothing is cleared in a single
// payment, as the months a term runs are counted. Counted in payments
// rather than time, since a term landing on a year end would otherwise
// be read as the year after it. The whisker below the count absorbs the
// floating point a worked-out term carries, so a term that is a whole
// number of months bar a rounding is one.
export function clearsIn(term: number, plan: PlanMonth): number {
  const payments = Math.max(1, Math.ceil(term * 12 - 1e-9));
  return plan.from + Math.floor((plan.month + payments - 1) / 12);
}

// What pays the balance down to the balloon over the term at the rate,
// a month, and clears it when there is no balloon: the annuity payment,
// with interest compounding monthly at a twelfth of the rate, on the
// balance less the balloon discounted back over the term, since the
// balloon is the part of the balance the payments leave standing at the
// end; or the difference spread flat when there is no rate.
export function paymentOf(
  { balance, balloon }: Owed,
  rate: number,
  term: number,
): number {
  const months = monthsIn(term);
  const monthly = rate / 12;
  if (monthly === 0) {
    return (balance - balloon) / months;
  }
  const discount = (1 + monthly) ** -months;
  return ((balance - balloon * discount) * monthly) / (1 - discount);
}

// The rate at which the payment pays the balance down to the balloon
// over the term, found by bisection since the annuity formula does not
// invert: the payment rises with the rate, so the rate is closed in on
// from nothing and from a ceiling raised until the payment at it is
// enough. Nothing at all when the payments spread flat fall short of
// what is to be paid down, since no rate below nothing is a loan's, and
// exactly nothing when they meet it. A balance at or below the balloon
// is paid down at any rate, so at none.
export function rateOf(
  owed: Owed,
  payment: number,
  term: number,
): null | number {
  const { balance, balloon } = owed;
  if (balance <= balloon) {
    return 0;
  }
  const flat = (balance - balloon) / monthsIn(term);
  if (payment < flat) {
    return null;
  }
  if (payment === flat) {
    return 0;
  }
  let low = 0;
  let high = 1;
  while (paymentOf(owed, high, term) < payment) {
    high *= 2;
  }
  for (let step = 0; step < 64; step += 1) {
    const mid = (low + high) / 2;
    if (paymentOf(owed, mid, term) < payment) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

// The years the payment takes to pay the balance down to the balloon at
// the rate, and to clear it when there is no balloon: the months the
// annuity runs, which the formula gives fractionally, over twelve. A
// balance at or below the balloon takes no time; nothing paid, or a
// payment the month's interest swallows, gets there never, which is
// null. A rate of nothing spreads the difference flat, since the
// formula divides by the log of one, and so does a rate too small to
// move one in floating point, since the formula would then divide
// nothing by nothing.
export function termOf(
  { balance, balloon }: Owed,
  payment: number,
  rate: number,
): null | number {
  if (balance <= balloon) {
    return 0;
  }
  if (payment <= 0) {
    return null;
  }
  const monthly = rate / 12;
  if (1 + monthly === 1) {
    return (balance - balloon) / payment / 12;
  }
  const interest = balance * monthly;
  if (payment <= interest) {
    return null;
  }
  return (
    Math.log((payment - balloon * monthly) / (payment - interest)) /
    Math.log(1 + monthly) /
    12
  );
}

// The months a term runs, whole, and at least one: a term of nothing is
// cleared in a single payment.
function monthsIn(term: number): number {
  return Math.max(1, Math.round(term * 12));
}
