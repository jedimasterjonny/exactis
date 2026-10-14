import type { Purchase } from "@/data/accounts";
import type { Secured, SecuredRecords } from "@/data/secured";
import type { LoanFigure } from "@/lib/figures";
import type { Owed, PlanMonth } from "@/lib/loans";

import { toValues } from "@/data/accounts";
import { owes, securedRecords } from "@/data/secured";
import { figureOf } from "@/lib/loans";
import { negated } from "@/lib/money";

// The house as the dialog holds it: the values, with each sub-account
// as the dialog holds it, and whatever more the dialog holds of one.
export interface HouseDraft<TPart extends PartDraft = PartDraft> extends Omit<
  HouseValues,
  "parts"
> {
  readonly parts: readonly TPart[];
}

// A house is a real asset and, while it is mortgaged, the loans against
// it and the payments that clear them: records the store holds apart,
// written together from one dialog. The values are what the dialog takes:
// the house's worth now and the rate it grows at, when it was bought
// and what it cost, and for a mortgaged house the sub-accounts the
// mortgage is held in, one at least, in the order they are listed. A
// house owned outright has none.
export interface HouseValues {
  readonly bought: Purchase;
  readonly growth: number;
  readonly name: string;
  readonly parts: readonly Part[];
  readonly status: Status;
  readonly value: number;
}

// A mortgage held in more than one sub-account, as it is drawn wherever
// its sub-accounts are drawn as one: its name, and the ids of the loans
// its sub-accounts are.
export interface Mortgage {
  readonly ids: ReadonlySet<number>;
  readonly name: string;
}

// A sub-account of a mortgage, which a lender may hold a mortgage in
// several of, each owing its own balance at its own rate: what is owed,
// whole pounds and positive, the rate it is charged at, a fraction as
// every rate is, and what is paid a month, whole pounds. Each is a loan
// of its own to the store, paid down at its own rate and cleared in its
// own time.
export interface Part {
  readonly balance: number;
  readonly payment: number;
  readonly rate: number;
}

// A sub-account as the dialog holds it: the values, the years it has
// left to run, and a key of its own, so its fields stay its own as the
// ones before it go. The term is not saved, since the store reads it
// off the balance, the rate and the payment, but it is one of the three
// figures any two of which fix the third, so the dialog holds it beside
// them and lets whichever was typed last stand.
export interface PartDraft extends Part {
  readonly key: number;
  readonly term: number;
}

export type Status = (typeof statuses)[number];

// The choices as a list, so the action's schema and the dialog's select
// take the same words the type does and cannot drift from them.
export const statuses = ["mortgaged", "outright"] as const;

// The figure worked out from a sub-account's other two, over what it
// owes, as the loan maths works out any loan's.
export function derive(part: PartDraft, figure: LoanFigure): null | number {
  return figureOf(figure, owedOn(part), part);
}

// The values a house's records hold, for the dialog to open on: the
// house's balance is its value and its rate its growth, its purchase
// is as kept, or the one a house opens on before it is typed, and each
// loan is a sub-account, its balance owed, so it comes back positive,
// its rate the sub-account's and its contribution the payment, a month
// as the records lay it. A house with no loan against it is owned
// outright and owes nothing.
export function houseOf(
  { asset, loans }: Secured,
  plan: PlanMonth,
): HouseValues {
  const held = toValues(asset);
  return {
    bought: asset.bought ?? openingPurchase(plan),
    growth: held.rate,
    name: held.name,
    parts: loans
      .map(toValues)
      .map((owed) => ({
        balance: negated(owed.balance),
        payment: owed.contribution,
        rate: owed.rate,
      })),
    status: loans.length === 0 ? "outright" : "mortgaged",
    value: held.balance,
  };
}

// A house the store would take: named, bought for something, and if
// mortgaged held in a sub-account at least, each owing something,
// paying something and charged a rate no lower than nothing. The save
// button holds until it is one.
export function isSound(house: HouseValues): boolean {
  return (
    house.name.trim() !== "" &&
    house.bought.price > 0 &&
    (house.status === "outright" ||
      (house.parts.length > 0 && house.parts.every(owes)))
  );
}

// The one mortgage the loans secured on an asset are drawn as, which
// they are for a house carrying more than one, so every screen drawing
// them as one reads the one rule; or none, for one loan alone, which is
// drawn as the loan it is.
export function mortgageOn({ asset, loans }: Secured): Mortgage | null {
  return asset.kind === "house" && loans.length > 1
    ? { ids: new Set(loans.map(({ id }) => id)), name: mortgageOf(asset.name) }
    : null;
}

// The purchase a house opens on before one is typed: the month the
// plan starts in, for nothing, which holds the save until what it cost
// is typed.
export function openingPurchase(plan: PlanMonth): Purchase {
  return { month: { month: plan.month, year: plan.from }, price: 0 };
}

// The records a house is written as: an asset of its own kind growing
// at its own fixed rate, carrying when it was bought, and for a
// mortgaged house each sub-account and its payments, as every secured
// asset's loans are written, none leaving a balloon standing. Both are
// named for the house, and a mortgage in more than one sub-account
// names each by its place, so the month end can tell them apart.
export function toRecords(
  house: HouseValues,
  plan: { readonly from: number },
): SecuredRecords {
  return securedRecords(
    {
      bought: house.bought,
      kind: "house",
      name: house.name,
      rate: house.growth,
      value: house.value,
    },
    house.status === "outright"
      ? []
      : house.parts.map((part, place) => ({
          ...part,
          balloon: 0,
          name:
            house.parts.length === 1
              ? mortgageOf(house.name)
              : `${mortgageOf(house.name)} ${String(place + 1)}`,
        })),
    plan,
  );
}

// What a house's mortgage is called, whole: the name its one
// sub-account takes, and the one a mortgage in several is drawn under
// wherever its sub-accounts are drawn as one.
function mortgageOf(house: string): string {
  return `${house} mortgage`;
}

// What a mortgage's payments are over: the balance, which they clear,
// since a mortgage leaves no balloon standing.
function owedOn({ balance }: { readonly balance: number }): Owed {
  return { balance, balloon: 0 };
}
