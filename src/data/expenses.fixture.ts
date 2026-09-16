import type { ExpenseLine } from "@/data/expenses";

// The reference kit's invented schedule: five expense lines, in the order
// the reference lists them, with the ids a store would have given them,
// laid over the plan the income fixture carries. For tests, since the
// screen reads the store. A tuple, so a test reading a line by its place
// gets a line.
export const expenseLines = [
  {
    amount: 3350,
    cadence: "month",
    firstYear: 2026,
    growth: "inflation",
    id: 1,
    kind: "core",
    lastYear: 2051,
    name: "Household",
  },
  {
    amount: 1240,
    cadence: "month",
    firstYear: 2031,
    growth: "inflation-plus-2",
    id: 2,
    kind: "time-bound",
    lastYear: 2039,
    name: "Childcare",
  },
  {
    amount: 3065,
    cadence: "month",
    firstYear: 2040,
    growth: "nominal",
    id: 3,
    kind: "debt",
    lastYear: 2064,
    name: "Mortgage payment",
  },
  {
    amount: 58000,
    cadence: "year",
    firstYear: 2052,
    growth: "inflation",
    id: 4,
    kind: "core",
    lastYear: null,
    name: "Retirement living",
  },
  {
    amount: 31000,
    cadence: "year",
    firstYear: 2076,
    growth: "inflation-plus-1",
    id: 5,
    kind: "time-bound",
    lastYear: null,
    name: "Care provision",
  },
] as const satisfies readonly ExpenseLine[];
