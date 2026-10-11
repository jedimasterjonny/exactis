import type { Goal } from "@/data/goals";

// The goals the reference plan is read against, with the ids a store
// would have given them: the first million, in net worth, and financial
// independence, the savings less the debts twenty-five years of
// expenses and ten times what is owed. For tests. A tuple, so a test
// reading a goal by its place gets one.
export const goals = [
  {
    conditions: [{ measure: "worth", of: "pounds", times: 1000000 }],
    id: 1,
    name: "First million",
  },
  {
    conditions: [
      { measure: "liquid", of: "expenses", times: 25 },
      { measure: "liquid", of: "debt", times: 10 },
    ],
    id: 2,
    name: "Financial independence",
  },
] as const satisfies readonly Goal[];
