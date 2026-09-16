import type { IncomeLine } from "@/data/income";
import type { Plan } from "@/engine/projection";

// The reference kit's invented schedule: four income lines, in the order
// the reference lists them, with the ids a store would have given them,
// the salary paid in parts that sum to the reference's figure, and the
// plan they are laid over, which runs from 2026 to 2083 for someone born
// in 1992. For tests, since the screen reads the store. A
// tuple, so a test reading a line by its place gets a line.
export const incomeLines = [
  {
    amount: 120000,
    bonus: 16500,
    cadence: "year",
    firstYear: 2026,
    growth: "inflation-plus-1",
    id: 1,
    kind: "employment",
    lastYear: 2052,
    name: "Salary",
    rsu: 7500,
  },
  {
    amount: 174000,
    bonus: 0,
    cadence: "year",
    firstYear: 2035,
    growth: "inflation",
    id: 2,
    kind: "employment",
    lastYear: 2052,
    name: "Salary step-up",
    rsu: 0,
  },
  {
    amount: 2000,
    bonus: 0,
    cadence: "month",
    firstYear: 2053,
    growth: "nominal",
    id: 3,
    kind: "self-employment",
    lastYear: 2058,
    name: "Part-time consulting",
    rsu: 0,
  },
  {
    amount: 23400,
    bonus: 0,
    cadence: "year",
    firstYear: 2060,
    growth: "triple-lock",
    id: 4,
    kind: "pension",
    lastYear: null,
    name: "State pension",
    rsu: 0,
  },
] as const satisfies readonly IncomeLine[];

export const plan: Plan = { born: 1992, from: 2026, rate: 0.05, years: 57 };
