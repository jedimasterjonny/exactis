import type { Account } from "@/data/accounts";

// The reference kit's invented plan: five accounts, in the order the
// reference lists them, with the ids a store would have given them. For
// tests, since the screens read the store now and the engine is still to
// come. A tuple, so a test reading one by its place gets an account.
export const accounts = [
  {
    balance: 391640,
    contribution: { amount: 28512, cadence: "year" },
    growth: { kind: "plan" },
    id: 1,
    kind: "tax-deferred",
    name: "Workplace pension",
  },
  {
    balance: 271930,
    contribution: { amount: 20000, cadence: "year" },
    growth: { kind: "plan" },
    id: 2,
    kind: "tax-free",
    name: "Stocks & shares ISA",
  },
  {
    balance: 16900,
    growth: { kind: "fixed", rate: 0 },
    id: 3,
    kind: "cash",
    name: "Current account",
  },
  {
    balance: 397512,
    growth: { kind: "fixed", rate: 0.021 },
    id: 4,
    kind: "real-asset",
    name: "Home",
  },
  {
    balance: -176520,
    contribution: { amount: 2180, cadence: "month" },
    growth: { kind: "fixed", rate: 0.0485 },
    id: 5,
    kind: "debt",
    name: "Mortgage",
  },
] as const satisfies readonly Account[];
