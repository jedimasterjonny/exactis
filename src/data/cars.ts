import type { AccountValues } from "@/data/accounts";
import type { Secured, SecuredRecords } from "@/data/secured";
import type { LoanFigure } from "@/lib/figures";
import type { Owed } from "@/lib/loans";

import { toValues } from "@/data/accounts";
import { owes, securedRecords } from "@/data/secured";
import { figureOf, termOf } from "@/lib/loans";
import { negated } from "@/lib/money";

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
    balance: owed === null ? 0 : negated(owed.balance),
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
// owes, as the loan maths works out any loan's.
export function derive(draft: CarDraft, figure: LoanFigure): null | number {
  return figureOf(figure, owedOn(draft), draft);
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

// The records a car is written as: an asset of its own kind losing
// value at its own fixed rate, and for a financed car the finance and
// its payments, as every secured asset's are written. The finance is
// left owing the balloon, and on a PCP its payments run past the
// agreement's end, since the balloon is refinanced on the same terms
// until the whole balance clears. Both are named for the car and the
// agreement it is on.
export function toRecords(
  car: CarValues,
  plan: { readonly from: number },
): SecuredRecords {
  return securedRecords(
    {
      kind: "car",
      name: car.name,
      rate: negated(car.depreciation),
      value: car.value,
    },
    car.agreement === "outright"
      ? null
      : {
          balance: car.balance,
          balloon: car.balloon,
          name: `${car.name} ${car.agreement === "pcp" ? "PCP" : "loan"}`,
          payment: car.payment,
          rate: car.rate,
        },
    plan,
  );
}

// What a loan's records say the agreement is: none is a car owned
// outright, a balloon is a PCP, and no balloon is a loan.
function agreementOf(owed: AccountValues | null): Agreement {
  if (owed === null) {
    return "outright";
  }
  return owed.balloon > 0 ? "pcp" : "loan";
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
