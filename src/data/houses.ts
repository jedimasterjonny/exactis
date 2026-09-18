import type { Account, AccountValues } from "@/data/accounts";
import type { ExpenseLineValues } from "@/data/expenses";

import { toValues } from "@/data/accounts";

// A house as the store holds it: its own account, and the loan secured
// on it while it is mortgaged, which the ledger finds by the link the
// loan carries. The line of payments is not needed to open the house,
// since the payment is the loan's contribution as well.
export interface House {
  readonly asset: Account;
  readonly loan: Account | null;
}

// The house as the dialog holds it: the values, and the years the
// mortgage has left to run. The term is not saved, since the store reads
// it off the balance, the rate and the payment, but it is one of the
// three figures any two of which fix the third, so the dialog holds it
// beside them and lets whichever was typed last stand.
export interface HouseDraft extends HouseValues {
  readonly term: number;
}

// What the store writes for a house: the real asset, and for a mortgaged
// house the loan against it and the line of payments that clears it.
export interface HouseRecords {
  readonly asset: AccountValues;
  readonly mortgage: Mortgage | null;
}

// A house is a real asset and, while it is mortgaged, the loan against it
// and the payments that clear it: three records the store holds apart,
// written together from one dialog. The values are what the dialog takes:
// the house's worth now and the rate it grows at, and for a mortgaged
// house what is owed, whole pounds and positive, the rate it is charged
// at, a fraction as every rate is, and what is paid a month, whole
// pounds. A house owned outright owes and pays nothing.
export interface HouseValues {
  readonly balance: number;
  readonly growth: number;
  readonly name: string;
  readonly payment: number;
  readonly rate: number;
  readonly status: Status;
  readonly value: number;
}

// The three figures of a mortgage that fix each other, given what is
// owed: what is paid a month, the rate, and the years it takes to clear.
export type MortgageFigure = "payment" | "rate" | "term";

export type Status = (typeof statuses)[number];

// The loan and its payments, named for the house they are against.
interface Mortgage {
  readonly account: AccountValues;
  readonly line: ExpenseLineValues;
}

// The choices as a list, so the action's schema and the dialog's select
// take the same words the type does and cannot drift from them.
export const statuses = ["mortgaged", "outright"] as const;

// The figure worked out from the draft's other two: the payment to the
// pound, since a line is paid in whole pounds; the rate as found; the
// term to the month it lands in. Null where no figure fits, which the
// two that can say so say below.
export function derive(
  draft: HouseDraft,
  figure: MortgageFigure,
): null | number {
  switch (figure) {
    case "payment":
      return Math.round(paymentOf(draft.balance, draft.rate, draft.term));
    case "rate":
      return rateOf(draft.balance, draft.payment, draft.term);
    case "term":
      return termOf(draft.balance, draft.payment, draft.rate);
  }
}

// The values a house's records hold, for the dialog to open on: the
// house's balance is its value and its rate its growth, and the loan's
// balance is owed, so it comes back positive, its rate is the mortgage's
// and its contribution the payment, a month as the records lay it. A
// house with no loan against it is owned outright and owes nothing.
export function houseOf({ asset, loan }: House): HouseValues {
  const held = toValues(asset);
  const owed = loan === null ? null : toValues(loan);
  return {
    balance: owed === null ? 0 : -owed.balance,
    growth: held.rate,
    name: held.name,
    payment: owed === null ? 0 : owed.contribution,
    rate: owed === null ? 0 : owed.rate,
    status: owed === null ? "outright" : "mortgaged",
    value: held.balance,
  };
}

// A house the store would take: named, and if mortgaged owing something,
// paying something and charged a rate no lower than nothing. The save
// button holds until it is one.
export function isSound(house: HouseValues): boolean {
  return (
    house.name.trim() !== "" &&
    (house.status === "outright" ||
      (house.balance > 0 && house.payment > 0 && house.rate >= 0))
  );
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
// below nothing is a mortgage's, and exactly nothing when they meet it.
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

// The records a house is written as. The house is an asset of its own
// kind growing at its own fixed rate, since the plan rate is the
// wrappers'; it is paid nothing, so its cadence is the one a contribution
// of nothing reads back as. A mortgage is a debt owing the balance,
// charged the rate as its growth and paid the payment a month as its
// contribution, which is what the ledger shows against it, and its
// payments are a debt line of the same a month, fixed in nominal terms
// as a mortgage payment is, from the plan's first year to the year the
// last payment falls in, counted from the month the plan is read in, or
// open-ended when the payment never clears it. The engine counts the
// payment once, as the line, since it leaves the contribution of a loan
// a line pays out of the month's fixed sums. Both are named for the
// house.
export function toRecords(
  house: HouseValues,
  plan: { readonly from: number; readonly month: number },
): HouseRecords {
  const asset: AccountValues = {
    balance: house.value,
    cadence: "year",
    cap: 0,
    contribution: 0,
    funding: "fixed",
    growth: "fixed",
    kind: "house",
    name: house.name,
    rate: house.growth,
  };
  if (house.status === "outright") {
    return { asset, mortgage: null };
  }
  const name = `${house.name} mortgage`;
  const term = termOf(house.balance, house.payment, house.rate);
  return {
    asset,
    mortgage: {
      account: {
        balance: -house.balance,
        cadence: "month",
        cap: 0,
        contribution: house.payment,
        funding: "fixed",
        growth: "fixed",
        kind: "debt",
        name,
        rate: house.rate,
      },
      line: {
        amount: house.payment,
        cadence: "month",
        firstYear: plan.from,
        growth: "nominal",
        kind: "debt",
        lastYear: term === null ? null : clearsIn(term, plan),
        name,
      },
    },
  };
}

// The year the last payment falls in. The plan's month is a paying
// month, as the projection carries the first year from it, so the first
// payment lands in that month and the last one payments later, less
// one: the term's months, whole, since a part of a month is a payment.
// Counted in payments rather than time, since a term landing on a year
// end would otherwise be read as the year after it. The whisker below
// the count absorbs the floating point a worked-out term carries, so
// a term that is a whole number of months bar a rounding is one.
function clearsIn(
  term: number,
  plan: { readonly from: number; readonly month: number },
): number {
  const payments = Math.ceil(term * 12 - 1e-9);
  return plan.from + Math.floor((plan.month + payments - 1) / 12);
}

// The months a term runs, whole, and at least one: a term of nothing is
// cleared in a single payment.
function monthsIn(term: number): number {
  return Math.max(1, Math.round(term * 12));
}
