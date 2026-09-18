// An account is a balance the plan grows: a tax wrapper, a cash account, a
// real asset, or the loan against one. Balances are whole pounds, a debt's
// negative, formatted where they are rendered; a rate is a fraction, so
// 0.021 is 2.10%. The id is the account's identity, so an edit writes back
// to the account rather than to a place in a list, and two accounts may
// share a name. The store hands the ids out, and holds the order the
// accounts are listed in, which is the order they were added until it
// is changed.
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
// cadence is kept beside it whether or not it applies, a cap of nothing
// is the account's own allowance, and the rate sits beside the growth
// choice whether or not that is fixed. So a value can be edited field by
// field and stored column by column, and becomes an account by the rules
// below.
export interface AccountValues {
  readonly balance: number;
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
  "cash",
  "debt",
  "real-asset",
  "tax-deferred",
  "tax-free",
] as const;

export const cadences = ["month", "year"] as const;

export const fundings = ["fixed", "spare"] as const;

export const growthKinds = ["fixed", "plan"] as const;

// The most the kind may be paid a year, as the UK sets it: £20,000 into
// an ISA and £60,000 into a pension. Cash has no allowance, and a real
// asset or a debt is paid only a fixed sum, so neither has one either.
export function allowanceOf(kind: AccountKind): null | number {
  switch (kind) {
    case "cash":
    case "debt":
    case "real-asset":
      return null;
    case "tax-deferred":
      return 60000;
    case "tax-free":
      return 20000;
  }
}

// A real asset is the side of the plan the progress points reconcile as
// total assets. The loan against one is a debt, listed with the accounts,
// since it is paid as they are; the progress points reconcile it as an
// asset loan.
export function isAsset(account: { readonly kind: AccountKind }): boolean {
  return account.kind === "real-asset";
}

// A wrapper or cash may be paid the spare money. A real asset or a debt
// is paid a fixed sum or nothing: the spare money goes into savings.
export function takesSpare(account: { readonly kind: AccountKind }): boolean {
  return account.kind !== "debt" && account.kind !== "real-asset";
}

// A contribution of nothing is an absence on the account, a cap of
// nothing is the account's own allowance, and a growth choice becomes
// the account's growth with the rate only where it applies.
export function toAccount(values: AccountValues, id: number): Account {
  const contribution = contributionOf(values);
  return {
    balance: values.balance,
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
// a spare one carries no sum, a fixed one no cap, and a plan rate no
// rate.
export function toValues(account: Account): AccountValues {
  const { contribution } = account;
  return {
    balance: account.balance,
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
