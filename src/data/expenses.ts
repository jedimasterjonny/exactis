import type { LineValues } from "@/data/schedule";

// An expense line is money going out over a run of years: the household's
// spending, a child's nursery, a loan's payments, a late-life allowance.
// It holds what every line holds, and its kind says what the money is:
// the core spending that runs for good, a time-bound cost that does not,
// a debt's payments, or other. Lines overlap freely, as income lines do:
// retirement living is a line that starts where household spending
// stops, not an edit to it. The id is the line's identity, handed out by
// the store in the order lines were added, which is the order they are
// listed in.
export interface ExpenseLine extends ExpenseLineValues {
  readonly id: number;
}

// The line as a form or a row holds it, which is the line less its id:
// every field present, and no last year for a line that runs to the end
// of the plan.
export interface ExpenseLineValues extends LineValues {
  readonly kind: ExpenseKind;
}

type ExpenseKind = (typeof expenseKinds)[number];

// The kinds as a list, so the store's column takes the same words the
// type does and cannot drift from them.
export const expenseKinds = ["core", "debt", "other", "time-bound"] as const;
