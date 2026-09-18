import type { IncomeLine } from "@/data/income";
import type { Plan } from "@/engine/projection";

// The reference kit's invented schedule: four income lines, in the order
// the reference lists them, with the ids a store would have given them,
// the salary paid in parts that sum to the reference's figure, and the
// plan they are laid over, which runs from September 2026 to 2079 for
// someone born in 1990. For tests, since the screen reads the store. A
// tuple, so a test reading a line by its place gets a line.
export const incomeLines = [
  {
    amount: 120000,
    bonus: 15000,
    cadence: "year",
    firstYear: 2026,
    growth: "inflation-plus-1",
    id: 1,
    kind: "employment",
    lastMonth: null,
    lastYear: 2048,
    name: "Salary",
    rsu: 12000,
  },
  {
    amount: 168000,
    bonus: 0,
    cadence: "year",
    firstYear: 2031,
    growth: "inflation",
    id: 2,
    kind: "employment",
    lastMonth: null,
    lastYear: 2048,
    name: "Salary step-up",
    rsu: 0,
  },
  {
    amount: 2000,
    bonus: 0,
    cadence: "month",
    firstYear: 2049,
    growth: "nominal",
    id: 3,
    kind: "self-employment",
    lastMonth: null,
    lastYear: 2054,
    name: "Part-time consulting",
    rsu: 0,
  },
  {
    amount: 23400,
    bonus: 0,
    cadence: "year",
    firstYear: 2058,
    growth: "triple-lock",
    id: 4,
    kind: "pension",
    lastMonth: null,
    lastYear: null,
    name: "State pension",
    rsu: 0,
  },
] as const satisfies readonly IncomeLine[];

export const plan: Plan = {
  born: 1990,
  from: 2026,
  month: 8,
  rate: 0.05,
  years: 53,
};
