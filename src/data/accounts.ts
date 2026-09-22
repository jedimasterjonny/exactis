// An account is a balance the plan grows: a tax wrapper, a cash account, a
// real asset, or the loan against one. Balances are whole pounds, a debt's
// negative, formatted where they are rendered; a rate is a fraction, so
// 0.021 is 2.10%. The id is the account's identity, so an edit writes back
// to the account rather than to a place in a list, and two accounts may
// share a name. The store hands the ids out, and holds the order the
// accounts are listed in, which is the order they were added until it
// is changed. A loan secured on an asset carries that asset's id, so
// the two are read and edited as one; any other account carries none.
// A loan on a PCP carries the balloon its agreement leaves owing at the
// end, so the car it is on opens as the PCP it is; any other account
// carries none.
export interface Account {
  readonly balance: number;
  readonly balloon?: number;
  readonly contribution?: Contribution;
  readonly growth: Growth;
  readonly id: number;
  readonly kind: AccountKind;
  readonly name: string;
  readonly secures?: number;
}

// The account as its dialog holds it: the values, and the share of its
// base each salary feeding it sacrifices, by the line's id, so a share
// is edited from the pension's side as it is from the salary's and
// written with the account. An account nothing feeds carries none, and
// so does a new one, since nothing feeds an account the store has not
// given an id yet.
export interface AccountDraft extends AccountValues {
  readonly shares: readonly Share[];
}

export type AccountKind = (typeof accountKinds)[number];

// The account as a form or a table row holds it: flat, with every field
// present. A contribution of nothing is a zero rather than an absence, the
// cadence is kept beside it whether or not it applies, a cap of nothing
// is the account's own allowance, the rate sits beside the growth
// choice whether or not that is fixed, and a balloon of nothing is a
// loan with none, which is every account but a PCP's. So a value can be
// edited field by field and stored column by column, and becomes an
// account by the rules below.
export interface AccountValues {
  readonly balance: number;
  readonly balloon: number;
  readonly cadence: Cadence;
  readonly cap: number;
  readonly contribution: number;
  readonly funding: Funding;
  readonly growth: (typeof growthKinds)[number];
  readonly kind: AccountKind;
  readonly name: string;
  readonly rate: number;
}

export type Cadence = (typeof cadences)[number];

export type Funding = (typeof fundings)[number];

// Growth is the plan rate, set once on the assumptions screen and applied
// to every wrapper, or a fixed rate the account carries itself.
export type Growth =
  { readonly kind: "fixed"; readonly rate: number } | { readonly kind: "plan" };

// A salary's share of its base sacrificed into the account, by the
// line's id, as the account's dialog holds it beside the account.
export interface Share {
  readonly line: number;
  readonly sacrifice: number;
}

// What is paid into the account: a fixed sum at its cadence, or the spare
// money, what a month's income leaves after the expenses and every fixed
// contribution, up to a cap a year. The spare money goes to the accounts
// that take it in the order they are listed, each taking up to its cap
// and passing the rest on. A cap of null is the account's own allowance,
// which for cash is none.
type Contribution =
  | {
      readonly amount: number;
      readonly cadence: Cadence;
      readonly kind: "fixed";
    }
  | { readonly cap: null | number; readonly kind: "spare" };

// The choices as lists, so the store's columns take the same words the
// types do and cannot drift from them.
export const accountKinds = [
  "car",
  "cash",
  "debt",
  "house",
  "real-asset",
  "tax-deferred",
  "tax-free",
] as const;

export const cadences = ["month", "year"] as const;

export const fundings = ["fixed", "spare"] as const;

export const growthKinds = ["fixed", "plan"] as const;

// What each kind is called, on the ledger's badge and in the dialog's
// choice, so the two cannot drift from each other.
export const kindLabels: Record<AccountKind, string> = {
  car: "Car",
  cash: "Cash",
  debt: "Debt",
  house: "House",
  "real-asset": "Real asset",
  "tax-deferred": "Tax-deferred",
  "tax-free": "Tax-free",
};

// The most the kind may be paid a year, as the UK sets it: £20,000 into
// an ISA and £60,000 into a pension. Cash has no allowance, and a house,
// a car, a real asset or a debt is paid only a fixed sum, so none has
// one either.
export function allowanceOf(kind: AccountKind): null | number {
  switch (kind) {
    case "car":
    case "cash":
    case "debt":
    case "house":
    case "real-asset":
      return null;
    case "tax-deferred":
      return 60000;
    case "tax-free":
      return 20000;
  }
}

// A house, a car or another real asset is the side of the plan the
// progress points reconcile as total assets. A house is a real asset
// the house dialog writes and edits, with the mortgage against it, and
// a car one the car dialog writes and edits, with the finance on it.
// The loan against any of them is a debt, listed with the accounts,
// since it is paid as they are; the progress points reconcile it as an
// asset loan.
export function isAsset(account: { readonly kind: AccountKind }): boolean {
  return (
    account.kind === "car" ||
    account.kind === "house" ||
    account.kind === "real-asset"
  );
}

// A pension is the wrapper paid before tax, which is the one a salary
// may sacrifice into: the store, the action and the engine each hold a
// salary to feeding one and nothing else.
export function isPension(account: { readonly kind: AccountKind }): boolean {
  return account.kind === "tax-deferred";
}

// A wrapper or cash may be paid the spare money. An asset or a debt is
// paid a fixed sum or nothing: the spare money goes into savings.
export function takesSpare(account: { readonly kind: AccountKind }): boolean {
  return account.kind !== "debt" && !isAsset(account);
}

// A contribution of nothing is an absence on the account, as a balloon
// of nothing is, a cap of nothing is the account's own allowance, and a
// growth choice becomes the account's growth with the rate only where
// it applies.
export function toAccount(values: AccountValues, id: number): Account {
  const contribution = contributionOf(values);
  return {
    balance: values.balance,
    ...(values.balloon > 0 && { balloon: values.balloon }),
    ...(contribution !== undefined && { contribution }),
    growth:
      values.growth === "plan"
        ? { kind: "plan" }
        : { kind: "fixed", rate: values.rate },
    id,
    kind: values.kind,
    name: values.name,
  };
}

// The reverse: an absent contribution is a fixed sum of nothing a year,
// a spare one carries no sum, a fixed one no cap, a plan rate no rate,
// and an absent balloon is one of nothing.
export function toValues(account: Account): AccountValues {
  const { contribution } = account;
  return {
    balance: account.balance,
    balloon: account.balloon ?? 0,
    cadence: contribution?.kind === "fixed" ? contribution.cadence : "year",
    cap: contribution?.kind === "spare" ? (contribution.cap ?? 0) : 0,
    contribution: contribution?.kind === "fixed" ? contribution.amount : 0,
    funding: contribution?.kind ?? "fixed",
    growth: account.growth.kind,
    kind: account.kind,
    name: account.name,
    rate: account.growth.kind === "fixed" ? account.growth.rate : 0,
  };
}

function contributionOf(values: AccountValues): Contribution | undefined {
  switch (values.funding) {
    case "fixed":
      return values.contribution > 0
        ? {
            amount: values.contribution,
            cadence: values.cadence,
            kind: "fixed",
          }
        : undefined;
    case "spare":
      return { cap: values.cap > 0 ? values.cap : null, kind: "spare" };
  }
}
