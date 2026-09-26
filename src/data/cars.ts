import type { AccountValues } from "@/data/accounts";
import type { Secured, SecuredRecords } from "@/data/secured";
import type { LoanFigure } from "@/lib/figures";
import type { Owed } from "@/lib/loans";

import { toValues } from "@/data/accounts";
import { paymentOf, rateOf, termOf } from "@/lib/loans";

export type Agreement = (typeof agreements)[number];

// The car as the dialog holds it: the values, and the years the
// agreement has left to run. The term is not saved, since the store
// reads it off the balance, the balloon, the rate and the payment, but
// it is one of the three figures any two of which fix the third, so the
// dialog holds it beside them and lets whichever was typed last stand.
export interface CarDraft extends CarValues {
  readonly term: number;
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
export function carOf({ asset, loan }: Secured): CarValues {
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
export function derive(draft: CarDraft, figure: LoanFigure): null | number {
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
// first year and open-ended as saved: when its payments end is the
// loan's to say, worked out from the finance whenever the household is
// read, so it moves with the month the balances are as of, and on a PCP
// runs past the agreement's end, since the balloon is refinanced on the
// same terms until the whole balance clears. The engine counts the
// payment once, as the line, since it leaves
// the contribution of a loan a line pays out of the month's fixed sums.
// Both are named for the car and the agreement it is on.
export function toRecords(
  car: CarValues,
  plan: { readonly from: number },
): SecuredRecords {
  const asset: AccountValues = {
    balance: car.value,
    balloon: 0,
    cadence: "year",
    cap: 0,
    contribution: 0,
    funding: "fixed",
    growth: "fixed",
    isAlwaysFunded: false,
    kind: "car",
    name: car.name,
    owner: null,
    rate: negated(car.depreciation),
  };
  if (car.agreement === "outright") {
    return { asset, loan: null };
  }
  const name = `${car.name} ${car.agreement === "pcp" ? "PCP" : "loan"}`;
  return {
    asset,
    loan: {
      account: {
        balance: -car.balance,
        balloon: car.balloon,
        cadence: "month",
        cap: 0,
        contribution: car.payment,
        funding: "fixed",
        growth: "fixed",
        isAlwaysFunded: false,
        kind: "debt",
        name,
        owner: null,
        rate: car.rate,
      },
      line: {
        amount: car.payment,
        cadence: "month",
        firstYear: plan.from,
        growth: "nominal",
        kind: "debt",
        lastMonth: null,
        lastYear: null,
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
