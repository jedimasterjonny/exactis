import type { Month } from "@/data/schedule";

// What a loan's payments are over: the balance owed, whole pounds and
// positive, and the balloon they leave standing at the end of the term,
// which is nothing for a loan they clear and the final payment a PCP
// puts off to its end.
export interface Owed {
  readonly balance: number;
  readonly balloon: number;
}

// The years a plan's payments are counted from: its first year, and the
// month of it the plan starts in, January being nought.
export interface PlanMonth {
  readonly from: number;
  readonly month: number;
}

// The month the last payment falls in. The plan's month is a paying
// month, as the projection carries the first year from it, so the first
// payment lands in that month and the last one the term's months later,
// less one, counted as the months a term runs are. Counted in payments
// rather than time, since a term landing on a year end would otherwise
// be read as the year after it.
export function clearsIn(term: number, plan: PlanMonth): Month {
  const last = plan.month + monthsIn(term) - 1;
  return { month: last % 12, year: plan.from + Math.floor(last / 12) };
}

// What pays the balance down to the balloon over the term at the rate,
// a month, and clears it when there is no balloon: the annuity payment,
// with interest compounding monthly at a twelfth of the rate, on the
// balance less the balloon discounted back over the term, since the
// balloon is the part of the balance the payments leave standing at the
// end; or the difference spread flat when there is no rate, and when
// there is one too small to move one in floating point, since the
// discount is then exactly one and the formula would divide by nothing.
export function paymentOf(
  { balance, balloon }: Owed,
  rate: number,
  term: number,
): number {
  const months = monthsIn(term);
  const monthly = rate / 12;
  if (1 + monthly === 1) {
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
// exactly nothing when they meet it. Nothing at all for a payment that
// is not a number either, since it neither falls short of the flat
// payments nor meets them and the bisection would otherwise close on a
// rate of all but nothing, and nothing at all for a term that is no
// number or no length: the flat payments are worked out over the term,
// so a term of no number makes them none and the same bisection closes
// on the same all but nothing, and a term without end asks at what rate
// a payment never stops, which the interest alone answers. A dialog
// with an empty term field types both, and a rate is what a house is
// saved on, so a nonsense figure reading as a rate is worse than none.
// A balance at or below the balloon is paid down at any rate, so at
// none.
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
  if (!Number.isFinite(term) || Number.isNaN(payment) || payment < flat) {
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

// The term whose last payment falls in the month: the payments from the
// plan's month to it, both counted, over twelve, which is what clearsIn
// reads back as that month. At least one payment, since the plan's
// month is the first paying month and a month before it is read as it:
// a term never steps back before the plan.
export function termTo(end: Month, plan: PlanMonth): number {
  const payments = (end.year - plan.from) * 12 + end.month - plan.month + 1;
  return Math.max(1, payments) / 12;
}

// The months a term runs: whole and rounded up, since a part of a month
// is a payment, and at least one, since a term of nothing is cleared in
// a single payment. The whisker below the count absorbs the floating
// point a worked-out term carries, so a term that is a whole number of
// months bar a rounding is that many. What the term amortises over and
// what clearsIn counts to the last payment are the one count, so a term
// typed as years and the month it is read back as never disagree.
function monthsIn(term: number): number {
  return Math.max(1, Math.ceil(term * 12 - 1e-9));
}
