// An account is a balance the plan grows: a tax wrapper, a cash account, a
// real asset, or the loan against one. Balances are whole pounds, a debt's
// negative, formatted where they are rendered; a rate is a fraction, so
// 0.021 is 2.10%. The id is the account's identity, so an edit writes back
// to the account rather than to a place in a list, and two accounts may
// share a name. The store hands the ids out, in the order accounts were
// added, and that order is the order they are listed in.
export interface Account {
  readonly balance: number;
  readonly contribution?: Contribution;
  readonly growth: Growth;
  readonly id: number;
  readonly kind: AccountKind;
  readonly name: string;
}

export type AccountKind = (typeof accountKinds)[number];

// The account as a form or a table row holds it: flat, with every field
// present. A contribution of nothing is a zero rather than an absence, the
// cadence is kept beside it whether or not it applies, and the rate sits
// beside the growth choice whether or not that is fixed. So a value can
// be edited field by field and stored column by column, and becomes an
// account by the rules below.
export interface AccountValues {
  readonly balance: number;
  readonly cadence: Cadence;
  readonly contribution: number;
  readonly growth: (typeof growthKinds)[number];
  readonly kind: AccountKind;
  readonly name: string;
  readonly rate: number;
}

export type Cadence = (typeof cadences)[number];

export interface Contribution {
  readonly amount: number;
  readonly cadence: Cadence;
}

// Growth is the plan rate, set once on the assumptions screen and applied
// to every wrapper, or a fixed rate the account carries itself.
export type Growth =
  { readonly kind: "fixed"; readonly rate: number } | { readonly kind: "plan" };

// The three choices as lists, so the store's columns take the same words
// the types do and cannot drift from them.
export const accountKinds = [
  "cash",
  "debt",
  "real-asset",
  "tax-deferred",
  "tax-free",
] as const;

export const cadences = ["month", "year"] as const;

export const growthKinds = ["fixed", "plan"] as const;

// A real asset and the loan against it are the side of the plan the
// progress points reconcile as total assets and asset loans.
export function isAsset(account: Account): boolean {
  return account.kind === "debt" || account.kind === "real-asset";
}

// A contribution of nothing is an absence on the account, and a growth
// choice becomes the account's growth with the rate only where it applies.
export function toAccount(values: AccountValues, id: number): Account {
  return {
    balance: values.balance,
    ...(values.contribution > 0 && {
      contribution: { amount: values.contribution, cadence: values.cadence },
    }),
    growth:
      values.growth === "plan"
        ? { kind: "plan" }
        : { kind: "fixed", rate: values.rate },
    id,
    kind: values.kind,
    name: values.name,
  };
}

// The reverse: an absent contribution is nothing a year, and a plan rate
// carries no rate.
export function toValues(account: Account): AccountValues {
  return {
    balance: account.balance,
    cadence: account.contribution?.cadence ?? "year",
    contribution: account.contribution?.amount ?? 0,
    growth: account.growth.kind,
    kind: account.kind,
    name: account.name,
    rate: account.growth.kind === "fixed" ? account.growth.rate : 0,
  };
}
