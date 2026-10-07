import type { Month } from "@/data/schedule";
import type { LoanFigure } from "@/lib/figures";

import { monthsBetween } from "@/lib/months";

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

// The three figures of a loan that fix each other, as a dialog holds
// them: what is paid a month, the rate, and the years left to run.
interface Figures {
  readonly payment: number;
  readonly rate: number;
  readonly term: number;
}

// The month the last payment falls in. The plan's month is a paying
// month, as the projection carries the first year from it, so the first
// payment lands in that month and the last one the term's months later,
// less one, counted as the months a term runs are. Counted in payments
// rather than time, since a term landing on a year end would otherwise
// be read as the year after it.
export function clearsIn(term: number, plan: PlanMonth): Month {
  return lastOf(monthsIn(term), plan);
}

// The figure worked out from the other two, over what is owed: the
// payment to the pound, since a line is paid in whole pounds; the rate
// as found; the term to the month it lands in. Null where no figure
// fits, which the two that can say so say below. A house and a car
// work their finance out the same way, and differ only in what is owed.
export function figureOf(
  figure: LoanFigure,
  owed: Owed,
  { payment, rate, term }: Figures,
): null | number {
  switch (figure) {
    case "payment":
      return Math.round(paymentOf(owed, rate, term));
    case "rate":
      return rateOf(owed, payment, term);
    case "term":
      return termOf(owed, payment, rate);
  }
}

// The month a loan the plan carries is paid through: the month its last
// payment falls in, as clearsIn counts it, or the month before the
// plan's first for a loan owing nothing its payments are for, a term of
// nothing. A dialog reads a term of nothing as a single payment, as
// clearsIn does, but a loan already paid down has no payment left to
// make, and one charged to the plan's first month would land on nothing.
export function paidUntil(term: number, plan: PlanMonth): Month {
  return lastOf(term > 0 ? monthsIn(term) : 0, plan);
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
  const payments =
    monthsBetween({ month: plan.month, year: plan.from }, end) + 1;
  return Math.max(1, payments) / 12;
}

// The month the payments given end in, counted from the plan's month as
// the first of them, or the month before it for none.
function lastOf(payments: number, plan: PlanMonth): Month {
  const last = plan.month + payments - 1;
  return { month: (last + 12) % 12, year: plan.from + Math.floor(last / 12) };
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
