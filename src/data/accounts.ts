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

// The five, in the order the reference lists them. The accounts tab shows
// the wrappers and the cash account, the assets tab the rest, and the kind
// decides which, so a new account files itself.
export const accounts: readonly Account[] = [
  {
    balance: 391640,
    contribution: { amount: 28512, cadence: "year" },
    growth: { kind: "plan" },
    kind: "tax-deferred",
    name: "Workplace pension",
  },
  {
    balance: 271930,
    contribution: { amount: 20000, cadence: "year" },
    growth: { kind: "plan" },
    kind: "tax-free",
    name: "Stocks & shares ISA",
  },
  {
    balance: 16900,
    growth: { kind: "fixed", rate: 0 },
    kind: "cash",
    name: "Current account",
  },
  {
    balance: 397512,
    growth: { kind: "fixed", rate: 0.021 },
    kind: "real-asset",
    name: "Home",
  },
  {
    balance: -176520,
    contribution: { amount: 2180, cadence: "month" },
    growth: { kind: "fixed", rate: 0.0485 },
    kind: "debt",
    name: "Mortgage",
  },
];

// A real asset and the loan against it are the side of the plan the
// progress points reconcile as total assets and asset loans.
export function isAsset(account: Account): boolean {
  return account.kind === "debt" || account.kind === "real-asset";
}
