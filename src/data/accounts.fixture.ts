import type { Account } from "@/data/accounts";

// The reference kit's invented plan: five accounts, in the order the
// reference lists them, with the ids a store would have given them, the
// two wrappers belonging to the owners fixture's one owner. For
// tests, since the screens read the store now and the engine is still to
// come. A tuple, so a test reading one by its place gets an account.
export const accounts = [
  {
    balance: 412880,
    contribution: { amount: 27195, cadence: "year", kind: "fixed" },
    growth: { kind: "plan" },
    id: 1,
    kind: "tax-deferred",
    name: "Workplace pension",
    owner: 1,
  },
  {
    balance: 286145,
    contribution: { amount: 20000, cadence: "year", kind: "fixed" },
    growth: { kind: "plan" },
    id: 2,
    kind: "tax-free",
    name: "Stocks & shares ISA",
    owner: 1,
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
    contribution: { amount: 2210, cadence: "month", kind: "fixed" },
    growth: { kind: "fixed", rate: 0.0515 },
    id: 5,
    kind: "debt",
    name: "Mortgage",
  },
] as const satisfies readonly Account[];
