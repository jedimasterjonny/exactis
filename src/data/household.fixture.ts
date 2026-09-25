import type { Kept } from "@/data/household";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";

// The reference kit's invented plan as the store keeps it: the fixtures'
// records, a plan to 89 whose owner retires at 59, and the next id past
// every one of theirs. For tests.
export const kept: Kept = {
  accounts,
  ages: { ends: 89, retires: 59 },
  next: 6,
  owners,
  schedule: { expenses: expenseLines, income: incomeLines },
};
