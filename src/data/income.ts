import type { LineValues } from "@/data/schedule";

// An income line is money coming in over a run of years: a salary, a
// pension, a side line. It holds what every line holds, and an employment
// line carries a bonus and RSUs on top of its base, each nothing when
// there is none and both nothing on any other kind of line; the three
// are paid together but held apart, since a pension contribution is a
// share of the base alone. Lines overlap freely: a step-up is a second
// line starting mid-way, not an edit to the first. The kind says what the
// money is, for the badge now and for tax later. The id is the line's
// identity, handed out by the store in the order lines were added, which
// is the order they are listed in.
export interface IncomeLine extends IncomeLineValues {
  readonly id: number;
}

// The line as a form or a row holds it, which is the line less its id:
// every field present, and no last year for a line that runs to the end
// of the plan.
export interface IncomeLineValues extends LineValues {
  readonly bonus: number;
  readonly kind: IncomeKind;
  readonly rsu: number;
}

type IncomeKind = (typeof incomeKinds)[number];

// The kinds as a list, so the store's column takes the same words the
// type does and cannot drift from them.
export const incomeKinds = [
  "employment",
  "other",
  "pension",
  "self-employment",
] as const;
