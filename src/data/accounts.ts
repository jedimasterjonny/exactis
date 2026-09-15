// An account is a balance the plan grows: a tax wrapper, a cash account, a
// real asset, or the loan against one. Balances are whole pounds, a debt's
// negative, formatted where they are rendered; a rate is a fraction, so
// 0.021 is 2.10%. The id is the account's identity, so an edit writes back
// to the account rather than to a place in a list, and two accounts may
// share a name. Every row here is the reference kit's invented plan,
// standing in until there is an engine and a store to read from.
export interface Account {
  readonly balance: number;
  readonly contribution?: Contribution;
  readonly growth: Growth;
  readonly id: number;
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

// The five, in the order the reference lists them. The accounts tab shows
// the wrappers and the cash account, the assets tab the rest, and the kind
// decides which, so a new account files itself.
export const accounts: readonly Account[] = [
  {
    balance: 412880,
    contribution: { amount: 27195, cadence: "year" },
    growth: { kind: "plan" },
    id: 1,
    kind: "tax-deferred",
    name: "Workplace pension",
  },
  {
    balance: 286145,
    contribution: { amount: 20000, cadence: "year" },
    growth: { kind: "plan" },
    id: 2,
    kind: "tax-free",
    name: "Stocks & shares ISA",
  },
  {
    balance: 18300,
    growth: { kind: "fixed", rate: 0 },
    id: 3,
    kind: "cash",
    name: "Current account",
  },
  {
    balance: 416386,
    growth: { kind: "fixed", rate: 0.021 },
    id: 4,
    kind: "real-asset",
    name: "Home",
  },
  {
    balance: -182940,
    contribution: { amount: 2210, cadence: "month" },
    growth: { kind: "fixed", rate: 0.0515 },
    id: 5,
    kind: "debt",
    name: "Mortgage",
  },
];

// A real asset and the loan against it are the side of the plan the
// progress points reconcile as total assets and asset loans.
export function isAsset(account: Account): boolean {
  return account.kind === "debt" || account.kind === "real-asset";
}
