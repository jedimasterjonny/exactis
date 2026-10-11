import type { Kept } from "@/data/household";

import { accounts } from "@/data/accounts.fixture";
import { cma, mappings } from "@/data/cma.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { goals } from "@/data/goals.fixture";
import { nothingKeptIn } from "@/data/household";
import { incomeLines } from "@/data/income.fixture";
import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";
import { milestones } from "@/data/milestones.fixture";
import { owners } from "@/data/owners.fixture";
import { points } from "@/data/progress.fixture";
import { allInStocks } from "@/data/rates";
import { targets } from "@/data/targets.fixture";

// The reference kit's invented plan as the store keeps it: the fixtures'
// records, the goals it is read against, balances as of September 2026
// and the six months of progress
// points before it, the house price index pulled on the day the
// household is read, scaled from an October 2021 purchase and running to
// July 2026, a plan to 91 whose owner
// retires at 61, the curve its card reads, the August 2026 CMA with no
// vintage before it, the rates it ran on before
// there were rates to type, 5% for stocks and bonds alike and the
// curve's inflation, live, with everything in stocks, 0.20% of fees and
// a 2% yield to deduct from a CMA's returns, the reference target
// allocation with its categories mapped onto August's classes, and the
// next id past every one of theirs. For tests.
export const kept: Kept = {
  accounts,
  ages: { ends: 91, retires: 61 },
  allocation: allInStocks,
  asOf: { month: 8, year: 2026 },
  cma: { latest: cma, previous: null },
  curve,
  deductions: { dividends: 0.02, fees: 0.002 },
  goals,
  housePrices: {
    from: { month: 9, year: 2021 },
    pulledOn: "2026-09-15",
    to: { month: 6, year: 2026 },
  },
  mappings,
  milestones,
  next: 6,
  owners,
  points,
  rates: {
    bonds: 0.05,
    dividends: 0,
    inflation: inflationOf(curve).rate,
    stocks: 0.05,
  },
  rateSet: "custom",
  schedule: { expenses: expenseLines, income: incomeLines },
  targets,
};

// The household before anything is saved, its balances as of the same
// month as the reference's.
export const blank: Kept = nothingKeptIn(kept.asOf);

// The day the household is read on, in the month its balances are as
// of, when the plan's owner, born in 1992, is 34.
export const today = new Date("2026-09-15T12:00:00Z");
