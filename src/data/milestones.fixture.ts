import type { Milestone } from "@/data/milestones";

// The milestones the reference plan turns on besides retirement, with
// the ids a store would have given them: the children leaving home the
// year after the childcare ends, at 48, and a downsize past retirement,
// at 67, each reached at an age; and two reached when conditions hold,
// the first million, in net worth, and financial independence, the
// savings less the debts twenty-five years of expenses and ten times
// what is owed. For tests. A tuple, so a test reading a milestone by
// its place gets one.
export const milestones = [
  {
    conditions: [{ measure: "age", of: "years", times: 48 }],
    id: 7,
    name: "Kids leave home",
  },
  {
    conditions: [{ measure: "age", of: "years", times: 67 }],
    id: 8,
    name: "Downsize",
  },
  {
    conditions: [{ measure: "worth", of: "pounds", times: 1000000 }],
    id: 9,
    name: "First million",
  },
  {
    conditions: [
      { measure: "liquid", of: "expenses", times: 25 },
      { measure: "liquid", of: "debt", times: 10 },
    ],
    id: 10,
    name: "Financial independence",
  },
] as const satisfies readonly Milestone[];
