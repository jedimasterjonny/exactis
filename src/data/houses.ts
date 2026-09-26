import type { Secured, SecuredRecords } from "@/data/secured";
import type { LoanFigure } from "@/lib/figures";
import type { Owed } from "@/lib/loans";

import { toValues } from "@/data/accounts";
import { owes, securedRecords } from "@/data/secured";
import { figureOf } from "@/lib/loans";
import { negated } from "@/lib/money";

// The house as the dialog holds it: the values, and the years the
// mortgage has left to run. The term is not saved, since the store reads
// it off the balance, the rate and the payment, but it is one of the
// three figures any two of which fix the third, so the dialog holds it
// beside them and lets whichever was typed last stand.
export interface HouseDraft extends HouseValues {
  readonly term: number;
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

export type Status = (typeof statuses)[number];

// The choices as a list, so the action's schema and the dialog's select
// take the same words the type does and cannot drift from them.
export const statuses = ["mortgaged", "outright"] as const;

// The figure worked out from the draft's other two, over what the draft
// owes, as the loan maths works out any loan's.
export function derive(draft: HouseDraft, figure: LoanFigure): null | number {
  return figureOf(figure, owedOn(draft), draft);
}

// The values a house's records hold, for the dialog to open on: the
// house's balance is its value and its rate its growth, and the loan's
// balance is owed, so it comes back positive, its rate is the mortgage's
// and its contribution the payment, a month as the records lay it. A
// house with no loan against it is owned outright and owes nothing.
export function houseOf({ asset, loan }: Secured): HouseValues {
  const held = toValues(asset);
  const owed = loan === null ? null : toValues(loan);
  return {
    balance: owed === null ? 0 : negated(owed.balance),
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
    house.name.trim() !== "" && (house.status === "outright" || owes(house))
  );
}

// The records a house is written as: an asset of its own kind growing
// at its own fixed rate, and for a mortgaged house the mortgage and its
// payments, as every secured asset's are written, the mortgage leaving
// no balloon standing. Both are named for the house.
export function toRecords(
  house: HouseValues,
  plan: { readonly from: number },
): SecuredRecords {
  return securedRecords(
    { kind: "house", name: house.name, rate: house.growth, value: house.value },
    house.status === "outright"
      ? null
      : {
          balance: house.balance,
          balloon: 0,
          name: `${house.name} mortgage`,
          payment: house.payment,
          rate: house.rate,
        },
    plan,
  );
}

// What a mortgage's payments are over: the balance, which they clear,
// since a mortgage leaves no balloon standing.
function owedOn({ balance }: { readonly balance: number }): Owed {
  return { balance, balloon: 0 };
}
