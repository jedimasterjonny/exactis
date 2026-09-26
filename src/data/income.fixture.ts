import type { IncomeLine } from "@/data/income";
import type { Plan } from "@/data/plan";

// The reference kit's invented schedule: four income lines, in the order
// the reference lists them, with the ids a store would have given them,
// the salary paid in parts that sum to the reference's figure and
// sacrificing 12% of its base into the reference's workplace
// pension, which is the first of the accounts fixture, and the plan they
// are laid over, which runs from September 2026 to 2083 for someone born
// in 1992. For tests, since the screen reads the store. A
// tuple, so a test reading a line by its place gets a line.
export const incomeLines = [
  {
    amount: 120000,
    bonus: 16500,
    cadence: "year",
    feeds: 1,
    firstYear: 2026,
    growth: "inflation-plus-1",
    id: 1,
    kind: "employment",
    lastMonth: null,
    lastYear: 2052,
    name: "Salary",
    rsu: 7500,
    sacrifice: 0.12,
  },
  {
    amount: 174000,
    bonus: 0,
    cadence: "year",
    feeds: null,
    firstYear: 2035,
    growth: "inflation",
    id: 2,
    kind: "employment",
    lastMonth: null,
    lastYear: 2052,
    name: "Salary step-up",
    rsu: 0,
    sacrifice: 0,
  },
  {
    amount: 2000,
    bonus: 0,
    cadence: "month",
    feeds: null,
    firstYear: 2053,
    growth: "nominal",
    id: 3,
    kind: "self-employment",
    lastMonth: null,
    lastYear: 2058,
    name: "Part-time consulting",
    rsu: 0,
    sacrifice: 0,
  },
  {
    amount: 23400,
    bonus: 0,
    cadence: "year",
    feeds: null,
    firstYear: 2060,
    growth: "triple-lock",
    id: 4,
    kind: "pension",
    lastMonth: null,
    lastYear: null,
    name: "State pension",
    rsu: 0,
    sacrifice: 0,
  },
] as const satisfies readonly IncomeLine[];

export const plan: Plan = {
  born: 1992,
  from: 2026,
  month: 8,
  rate: 0.05,
  retires: 92,
  years: 57,
};

// The plan with its owner retiring at 61, as the reference household's
// ages have it, where the plan above has them retire at 92.
export const retiring: Plan = { ...plan, retires: 61 };
