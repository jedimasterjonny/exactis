import type { Account, Move, Purchase } from "@/data/accounts";
import type { Marker } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { LineValues, Month } from "@/data/schedule";
import type { Secured, SecuredRecords } from "@/data/secured";
import type { LoanFigure } from "@/lib/figures";
import type { Owed, PlanMonth } from "@/lib/loans";

import { toValues } from "@/data/accounts";
import { endYear } from "@/data/plan";
import { owes, securedRecords } from "@/data/secured";
import { sumOf } from "@/lib/ledger";
import { runsIn } from "@/lib/lines";
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
// the house's worth now, the rate it grows at and the ceiling it grows
// no higher than, whole pounds of today's money and nothing for none,
// when it was bought and what it cost, and for a mortgaged house the
// sub-accounts the mortgage is held in, one at least, in the order they
// are listed. A house owned outright has none. A house moving carries
// the move, and one staying put none.
export interface HouseValues {
  readonly bought: Purchase;
  readonly ceiling: number;
  readonly growth: number;
  readonly move: MoveValues | null;
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

// A milestone a move may be at, as the house dialog offers it: one the
// household lists, by its id, with its name and the year it falls in.
export type MoveChoice = Omit<Marker, "id"> & { readonly id: number };

// A move as the dialog holds it: flat, with every field present. The
// milestone it is at, by its id, and the year that falls in; what the
// next house costs and the ceiling it is held to, whole pounds of
// today's money and nothing for none; and the share of the price the
// mortgage may borrow, nothing for a move borrowing nothing, at its
// rate over its term in whole years, which are kept beside a share of
// nothing whether or not they apply.
export interface MoveValues {
  readonly at: number;
  readonly ceiling: number;
  readonly loanToValue: number;
  readonly price: number;
  readonly rate: number;
  readonly term: number;
  readonly year: number;
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

// How items are drawn against debts: the debt each is against, if any,
// and what the items against one mortgage's sub-accounts are drawn as
// together.
interface Drawing<TItem> {
  readonly debtOf: (item: TItem) => number | undefined;
  readonly merged: (
    together: readonly [TItem, ...TItem[]],
    mortgage: Mortgage,
  ) => TItem;
}

// The move a house opens on once a milestone is chosen for it: the next
// house costing nothing yet, which holds the save until what it costs
// is typed, held to no ceiling and borrowing nothing, with the term a
// mortgage opens on, twenty-five years as a new sub-account's, standing
// by. The milestone and its year are the choice's to give.
export const openingMove = {
  ceiling: 0,
  loanToValue: 0,
  price: 0,
  rate: 0,
  term: 25,
} as const satisfies Omit<MoveValues, "at" | "year">;

// The choices as a list, so the action's schema and the dialog's select
// take the same words the type does and cannot drift from them.
export const statuses = ["mortgaged", "outright"] as const;

// The figure worked out from a sub-account's other two, over what it
// owes, as the loan maths works out any loan's.
export function derive(part: PartDraft, figure: LoanFigure): null | number {
  return figureOf(figure, owedOn(part), part);
}

// Items drawn against debts, as they are drawn: those against the
// sub-accounts of a mortgage held in more than one merged into one, in
// the place of the first, and every other as it is.
export function drawnAsMortgages<TItem>(
  items: readonly TItem[],
  accounts: readonly Account[],
  { debtOf, merged }: Drawing<TItem>,
): TItem[] {
  const mortgages = accounts
    .map((asset) =>
      mortgageOn({
        asset,
        loans: accounts.filter(({ secures }) => secures === asset.id),
      }),
    )
    .filter((mortgage) => mortgage !== null);
  const against = (item: TItem): Mortgage | undefined => {
    const debt = debtOf(item);
    return mortgages.find(({ ids }) => debt !== undefined && ids.has(debt));
  };
  return items.flatMap((item) => {
    const mortgage = against(item);
    if (mortgage === undefined) {
      return [item];
    }
    const together = items.filter((other) => against(other) === mortgage);
    return together[0] === item
      ? [merged([item, ...together.slice(1)], mortgage)]
      : [];
  });
}

// The values a house's records hold, for the dialog to open on: the
// house's balance is its value and its rate its growth, its limit its
// ceiling, nothing where it has none, its purchase is as kept, or the
// one a house opens on before it is typed, and each loan is a
// sub-account, its balance owed, so it comes back positive, its rate
// the sub-account's and its contribution the payment, a month as the
// records lay it. A house with no loan against it is owned outright and
// owes nothing. A move is read flat, a ceiling and a mortgage it does
// not carry as nothing, with the term a mortgage opens on beside them.
export function houseOf(
  { asset, loans }: Secured,
  plan: PlanMonth,
): HouseValues {
  const held = toValues(asset);
  return {
    bought: asset.bought ?? openingPurchase(plan),
    ceiling: asset.limit ?? 0,
    growth: held.rate,
    move: asset.move === undefined ? null : moveValuesOf(asset.move),
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
// button holds until it is one, and while a ceiling sits below what the
// house is worth, more likely a slip than a fall the engine would bring
// the house straight down to. A move buys a house for something, under
// any ceiling it carries for the same reason, and borrows only on a
// house mortgaged now, whose loan carries the mortgage on through it,
// over a whole number of years, one at least.
export function isSound(house: HouseValues): boolean {
  return (
    house.name.trim() !== "" &&
    house.bought.price > 0 &&
    (house.ceiling === 0 || house.ceiling >= house.value) &&
    (house.status === "outright" ||
      (house.parts.length > 0 && house.parts.every(owes))) &&
    (house.move === null || movesSoundly(house.move, house.status))
  );
}

// The lines paying a mortgage's sub-accounts as the one line they are
// drawn as from the month a plan starts in: under the mortgage's name,
// paying what those still paid then pay together, from the start of the
// first of them to the end of whichever runs longest, an open-ended one
// longest of all. A sub-account cleared before the plan is paid nothing
// in it, so its line counts for nothing, unless none is paid at all,
// when the mortgage is drawn from every line, as one held in a single
// sub-account cleared is drawn as its line.
export function mortgageLine<TLine extends LineValues>(
  lines: readonly [TLine, ...TLine[]],
  { name }: Mortgage,
  start: Month,
): TLine {
  const [paid, ...more] = lines.filter((line) => runsIn(line, start));
  const counted = paid === undefined ? lines : [paid, ...more];
  const [first] = counted;
  const { lastMonth, lastYear } = counted.reduce(
    (longest, line) =>
      longest.lastYear !== null &&
      runsIn(line, { month: longest.lastMonth ?? 11, year: longest.lastYear })
        ? line
        : longest,
    first,
  );
  return {
    ...first,
    amount: sumOf(counted, ({ amount }) => amount),
    lastMonth,
    lastYear,
    name,
  };
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

// The milestones a house may move at, from those the plan is laid out
// by, in their order: each the household lists reached at an age within
// the plan's years, since a move before them falls in no year the plan
// carries and one after them in none it reaches, so it would be kept
// and never made; and any a house moves at already, wherever it falls
// now, so the dialog opens on the move as kept. Retirement is no
// milestone the household lists.
export function moveChoices(
  markers: readonly Marker[],
  plan: Plan,
  accounts: readonly Account[],
): readonly MoveChoice[] {
  const isKept = (id: number): boolean =>
    accounts.some(({ move }) => move?.at === id);
  return markers.flatMap(({ id, name, year }) =>
    id !== "retirement" &&
    ((year >= plan.from && year <= endYear(plan)) || isKept(id))
      ? [{ id, name, year }]
      : [],
  );
}

// The purchase a house opens on before one is typed: the month the
// plan starts in, for nothing, which holds the save until what it cost
// is typed.
export function openingPurchase(plan: PlanMonth): Purchase {
  return { month: { month: plan.month, year: plan.from }, price: 0 };
}

// The records a house is written as: an asset of its own kind growing
// at its own fixed rate, held to its ceiling if it has one and carrying
// when it was bought and any move, and for a mortgaged house each
// sub-account and
// its payments, as every secured asset's loans are written, none
// leaving a balloon standing. Both are named for the house, and a
// mortgage in more than one sub-account names each by its place, so the
// month end can tell them apart.
export function toRecords(
  house: HouseValues,
  plan: { readonly from: number },
): SecuredRecords {
  return securedRecords(
    {
      bought: house.bought,
      kind: "house",
      ...(house.ceiling > 0 && { limit: house.ceiling }),
      ...(house.move !== null && { move: moveOf(house.move) }),
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

// A move as the records keep it: a ceiling of nothing is none, and a
// share of nothing borrows nothing, so carries no mortgage.
function moveOf({
  ceiling,
  loanToValue,
  rate,
  term,
  ...move
}: MoveValues): Move {
  return {
    ...move,
    ...(ceiling > 0 && { ceiling }),
    ...(loanToValue > 0 && { mortgage: { loanToValue, rate, term } }),
  };
}

// Whether a move is one the store would take of a house with the status
// given, as isSound says.
function movesSoundly(move: MoveValues, status: Status): boolean {
  return (
    move.price > 0 &&
    (move.ceiling === 0 || move.ceiling >= move.price) &&
    (move.loanToValue === 0 ||
      (status === "mortgaged" && Number.isInteger(move.term) && move.term >= 1))
  );
}

// The reverse: a move as the dialog opens on it, what it does not carry
// as nothing and a mortgage it does not take over the term one opens on.
function moveValuesOf({ ceiling = 0, mortgage, ...move }: Move): MoveValues {
  return {
    ...move,
    ceiling,
    loanToValue: mortgage?.loanToValue ?? 0,
    rate: mortgage?.rate ?? 0,
    term: mortgage?.term ?? openingMove.term,
  };
}

// What a mortgage's payments are over: the balance, which they clear,
// since a mortgage leaves no balloon standing.
function owedOn({ balance }: { readonly balance: number }): Owed {
  return { balance, balloon: 0 };
}
