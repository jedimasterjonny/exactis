import type { Account, AccountValues } from "@/data/accounts";
import type { ExpenseLineValues } from "@/data/expenses";
import type { Owed } from "@/lib/loans";

import { toValues } from "@/data/accounts";
import { clearsIn, paymentOf, rateOf, termOf } from "@/lib/loans";

export type Agreement = (typeof agreements)[number];

// A car as the store holds it: its own account, and the loan secured on
// it while it is financed, which the ledger finds by the link the loan
// carries. The line of payments is not needed to open the car, since
// the payment is the loan's contribution as well.
export interface Car {
  readonly asset: Account;
  readonly loan: Account | null;
}

// The car as the dialog holds it: the values, and the years the
// agreement has left to run. The term is not saved, since the store
// reads it off the balance, the balloon, the rate and the payment, but
// it is one of the three figures any two of which fix the third, so the
// dialog holds it beside them and lets whichever was typed last stand.
export interface CarDraft extends CarValues {
  readonly term: number;
}

// What the store writes for a car: the real asset, and for a financed
// car the loan against it and the line of payments that clears it.
export interface CarRecords {
  readonly asset: AccountValues;
  readonly finance: Finance | null;
}

// A car is a real asset and, while it is financed, the loan against it
// and the payments on it: three records the store holds apart, written
// together from one dialog. The values are what the dialog takes: the
// car's worth now and the rate it loses value at, a fraction a year as
// every rate is, and for a financed car what is owed, whole pounds and
// positive, the rate it is charged at, what is paid a month, whole
// pounds, and on a PCP the balloon, the final payment the agreement puts
// off to its end, which a loan leaves at nothing. A car owned outright
// owes and pays nothing.
export interface CarValues {
  readonly agreement: Agreement;
  readonly balance: number;
  readonly balloon: number;
  readonly depreciation: number;
  readonly name: string;
  readonly payment: number;
  readonly rate: number;
  readonly value: number;
}

// The three figures of the finance that fix each other, given what is
// owed and the balloon: what is paid a month, the rate, and the years
// the agreement takes to reach the balloon.
export type FinanceFigure = "payment" | "rate" | "term";

// The loan and its payments, named for the car they are on.
interface Finance {
  readonly account: AccountValues;
  readonly line: ExpenseLineValues;
}

// The choices as a list, so the action's schema and the dialog's select
// take the same words the type does and cannot drift from them.
export const agreements = ["pcp", "loan", "outright"] as const;

// The values a car's records hold, for the dialog to open on: the car's
// balance is its value and its rate, negated, its depreciation, and the
// loan's balance is owed, so it comes back positive, its rate is the
// finance's, its contribution the payment, a month as the records lay
// it, and its balloon the agreement's, which says whether the agreement
// is a PCP or a loan. A car with no loan against it is owned outright
// and owes nothing.
export function carOf({ asset, loan }: Car): CarValues {
  const held = toValues(asset);
  const owed = loan === null ? null : toValues(loan);
  return {
    agreement: agreementOf(owed),
    balance: owed === null ? 0 : -owed.balance,
    balloon: owed === null ? 0 : owed.balloon,
    depreciation: negated(held.rate),
    name: held.name,
    payment: owed === null ? 0 : owed.contribution,
    rate: owed === null ? 0 : owed.rate,
    value: held.balance,
  };
}

// The years the payments run in all: the balloon is refinanced on the
// same terms when the agreement ends, so the same payment at the same
// rate carries on until the whole balance is cleared, which is the term
// of the balance with no balloon. Null when the payment never clears
// it, as the term says.
export function clearsAfter(car: CarValues): null | number {
  return termOf({ balance: car.balance, balloon: 0 }, car.payment, car.rate);
}

// The figure worked out from the draft's other two, over what the draft
// owes: the payment to the pound, since a line is paid in whole pounds;
// the rate as found; the term to the month it lands in. Null where no
// figure fits, which the two that can say so say in the loan maths.
export function derive(draft: CarDraft, figure: FinanceFigure): null | number {
  const owed = owedOn(draft);
  switch (figure) {
    case "payment":
      return Math.round(paymentOf(owed, draft.rate, draft.term));
    case "rate":
      return rateOf(owed, draft.payment, draft.term);
    case "term":
      return termOf(owed, draft.payment, draft.rate);
  }
}

// A car the store would take: named, and if financed owing something,
// paying something and charged a rate no lower than nothing; a PCP
// owing more than a balloon of something, since an agreement that has
// reached its balloon is refinanced as a loan, and a loan no balloon at
// all. The save button holds until it is one.
export function isSound(car: CarValues): boolean {
  if (car.name.trim() === "") {
    return false;
  }
  switch (car.agreement) {
    case "loan":
      return owes(car) && car.balloon === 0;
    case "outright":
      return true;
    case "pcp":
      return owes(car) && car.balloon > 0 && car.balloon < car.balance;
  }
}

// The records a car is written as. The car is an asset of its own kind
// losing value at its own fixed rate, since the plan rate is the
// wrappers'; it is paid nothing, so its cadence is the one a
// contribution of nothing reads back as. The finance is a debt owing the
// balance, charged the rate as its growth, paid the payment a month as
// its contribution, which is what the ledger shows against it, and left
// owing the balloon, and its payments are a debt line of the same a
// month, fixed in nominal terms as a finance payment is, from the plan's
// first year to the year the last payment falls in, counted from the
// month the plan is read in. On a PCP the balloon is refinanced on the
// same terms when the agreement ends, so the payments carry on past it
// until the whole balance clears, and the line runs to that year rather
// than the agreement's; it is open-ended when the payment never clears
// it. The engine counts the payment once, as the line, since it leaves
// the contribution of a loan a line pays out of the month's fixed sums.
// Both are named for the car and the agreement it is on.
export function toRecords(
  car: CarValues,
  plan: { readonly from: number; readonly month: number },
): CarRecords {
  const asset: AccountValues = {
    balance: car.value,
    balloon: 0,
    cadence: "year",
    cap: 0,
    contribution: 0,
    funding: "fixed",
    growth: "fixed",
    kind: "car",
    name: car.name,
    rate: negated(car.depreciation),
  };
  if (car.agreement === "outright") {
    return { asset, finance: null };
  }
  const name = `${car.name} ${car.agreement === "pcp" ? "PCP" : "loan"}`;
  const term = clearsAfter(car);
  return {
    asset,
    finance: {
      account: {
        balance: -car.balance,
        balloon: car.balloon,
        cadence: "month",
        cap: 0,
        contribution: car.payment,
        funding: "fixed",
        growth: "fixed",
        kind: "debt",
        name,
        rate: car.rate,
      },
      line: {
        amount: car.payment,
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

// What a loan's records say the agreement is: none is a car owned
// outright, a balloon is a PCP, and no balloon is a loan.
function agreementOf(owed: AccountValues | null): Agreement {
  if (owed === null) {
    return "outright";
  }
  return owed.balloon > 0 ? "pcp" : "loan";
}

// The figure with its sign turned, and nothing left as nothing rather
// than as a negative nothing, which Intl would write with a sign.
function negated(figure: number): number {
  return figure === 0 ? 0 : -figure;
}

// What the finance's payments are over: the balance, down to the balloon
// on a PCP and to nothing on a loan, whatever a balloon field hidden by
// the agreement still holds.
function owedOn(car: CarValues): Owed {
  return {
    balance: car.balance,
    balloon: car.agreement === "pcp" ? car.balloon : 0,
  };
}

// Whether a financed car owes something, pays something and is charged
// a rate no lower than nothing.
function owes(car: CarValues): boolean {
  return car.balance > 0 && car.payment > 0 && car.rate >= 0;
}
