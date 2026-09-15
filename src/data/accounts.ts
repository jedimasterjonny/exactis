// An account is a balance the plan grows: a tax wrapper, a cash account, a
// real asset, or the loan against one. Balances are whole pounds, a debt's
// negative, formatted where they are rendered; a rate is a fraction, so
// 0.021 is 2.10%. Every row here is the reference kit's invented plan,
// standing in until there is an engine and a store to read from.
export interface Account {
  readonly balance: number;
  readonly contribution?: Contribution;
  readonly growth: Growth;
  readonly kind: AccountKind;
  readonly name: string;
}

export type AccountKind =
  "cash" | "debt" | "real-asset" | "tax-deferred" | "tax-free";

export type Cadence = "month" | "year";

export interface Contribution {
  readonly amount: number;
  readonly cadence: Cadence;
}

// Growth is the plan rate, set once on the assumptions screen and applied
// to every wrapper, or a fixed rate the account carries itself.
export type Growth =
  { readonly kind: "fixed"; readonly rate: number } | { readonly kind: "plan" };

// The wrappers and the cash account: what the accounts tab lists.
export const accounts: readonly Account[] = [
  {
    balance: 412880,
    contribution: { amount: 27195, cadence: "year" },
    growth: { kind: "plan" },
    kind: "tax-deferred",
    name: "Workplace pension",
  },
  {
    balance: 286145,
    contribution: { amount: 20000, cadence: "year" },
    growth: { kind: "plan" },
    kind: "tax-free",
    name: "Stocks & shares ISA",
  },
  {
    balance: 18300,
    growth: { kind: "fixed", rate: 0 },
    kind: "cash",
    name: "Current account",
  },
];

// The real assets and the loans against them: what the assets tab lists,
// and the side of the plan the progress points reconcile as total assets
// and asset loans.
export const assets: readonly Account[] = [
  {
    balance: 416386,
    growth: { kind: "fixed", rate: 0.021 },
    kind: "real-asset",
    name: "Home",
  },
  {
    balance: -182940,
    contribution: { amount: 2210, cadence: "month" },
    growth: { kind: "fixed", rate: 0.0515 },
    kind: "debt",
    name: "Mortgage",
  },
];
