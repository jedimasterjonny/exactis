import type { IncomeLine } from "@/data/income";
import type { Plan } from "@/data/plan";

import { working } from "@/data/owners.fixture";
import { retiringAt } from "@/data/plan";

// The reference kit's invented schedule: four income lines, in the order
// the reference lists them, with the ids a store would have given them,
// each the first owner's, the salary paid in parts that sum to the
// reference's figure and sacrificing 12% of its base into the
// reference's workplace pension, which is the first of the accounts
// fixture, and the plan they are laid over, which runs from September
// 2026 to 2083 for that owner, born in 1992 and retiring at 92, past
// its end, with prices held level, so every line pays what it states in
// every year. For tests, since the screen reads the store. A
// tuple, so a test reading a line by its place gets a line.
export const incomeLines = [
  {
    amount: 120000,
    bonus: 16500,
    cadence: "year",
    endsAfter: 0,
    endsAt: null,
    feeds: 1,
    firstYear: 2026,
    growth: "inflation-plus-1",
    id: 1,
    kind: "employment",
    lastMonth: null,
    lastYear: 2052,
    match: 0,
    name: "Salary",
    owner: 1,
    rsu: 7500,
    sacrifice: 0.12,
    startsAt: null,
  },
  {
    amount: 174000,
    bonus: 0,
    cadence: "year",
    endsAfter: 0,
    endsAt: null,
    feeds: null,
    firstYear: 2035,
    growth: "inflation",
    id: 2,
    kind: "employment",
    lastMonth: null,
    lastYear: 2052,
    match: 0,
    name: "Salary step-up",
    owner: 1,
    rsu: 0,
    sacrifice: 0,
    startsAt: null,
  },
  {
    amount: 2000,
    bonus: 0,
    cadence: "month",
    endsAfter: 0,
    endsAt: null,
    feeds: null,
    firstYear: 2053,
    growth: "nominal",
    id: 3,
    kind: "self-employment",
    lastMonth: null,
    lastYear: 2058,
    match: 0,
    name: "Part-time consulting",
    owner: 1,
    rsu: 0,
    sacrifice: 0,
    startsAt: null,
  },
  {
    amount: 23400,
    bonus: 0,
    cadence: "year",
    endsAfter: 0,
    endsAt: null,
    feeds: null,
    firstYear: 2060,
    growth: "inflation",
    id: 4,
    kind: "pension",
    lastMonth: null,
    lastYear: null,
    match: 0,
    name: "State pension",
    owner: 1,
    rsu: 0,
    sacrifice: 0,
    startsAt: null,
  },
] as const satisfies readonly IncomeLine[];

export const plan: Plan = {
  born: 1992,
  from: 2026,
  inflation: 0,
  month: 8,
  owners: [working],
  rate: 0.05,
  retires: 92,
  years: 57,
};

// The plan with its owner retiring at 61, as the reference household's
// ages have it, where the plan above has them retire at 92.
export const retiring: Plan = retiringAt(plan, 61);
