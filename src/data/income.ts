import type { LineValues } from "@/data/schedule";

export type IncomeKind = (typeof incomeKinds)[number];

// An income line is money coming in over a run of years: a salary, a
// pension, a side line. It holds what every line holds, and an employment
// line carries a bonus and RSUs on top of its base, each nothing when
// there is none and both nothing on any other kind of line; the three
// are paid together, at the line's one cadence, but held apart, since
// a pension contribution is a share of the base alone. An employment
// line paid through a salary sacrifice names the pension its sacrifice
// goes into, by the account's id, and the share of the base it gives up,
// a fraction as every rate is; a line with no pension names none and
// gives up nothing, as every other kind of line does. Lines overlap
// freely: a step-up is a second line starting mid-way, not an edit to
// the first, and both may feed the one pension. The kind says what the
// money is, for the badge now and for tax later. The id is the line's
// identity, handed out by the store in the order lines were added, which
// is the order they are listed in.
export interface IncomeLine extends IncomeLineValues {
  readonly id: number;
}

// The line as a form or a row holds it, which is the line less its id:
// every field present, no last year for a line that runs to the end of
// the plan and no pension for a line with none.
export interface IncomeLineValues extends LineValues {
  readonly bonus: number;
  readonly feeds: null | number;
  readonly kind: IncomeKind;
  readonly rsu: number;
  readonly sacrifice: number;
}

// The kinds as a list, so the store's column takes the same words the
// type does and cannot drift from them.
export const incomeKinds = [
  "employment",
  "other",
  "pension",
  "self-employment",
] as const;

// The employer's National Insurance on pay, fifteen per cent from April
// 2025, which a salary sacrifice saves the employer on what is given up
// and which a scheme that reclaims it pays into the pension with the
// sacrifice. The employee's own saving waits on the tax the plan does
// not take yet.
const employerNi = 0.15;

// What lands in the pension a line feeds, at the line's cadence: the
// sacrifice, and the employer's NI saved on it, passed on in full.
export function contributionOf(line: IncomeLineValues): number {
  return sacrificeOf(line) * (1 + employerNi);
}

// What a line gives up into its pension at its cadence: the share of
// its base alone, since the bonus and RSUs are outside the sacrifice,
// and nothing for a line that gives up none.
export function sacrificeOf(line: IncomeLineValues): number {
  return line.amount * line.sacrifice;
}

// What a line earns at its cadence: the amount, with an employment
// line's bonus and RSUs on top, before any sacrifice comes off it. The
// parts are summed here and nowhere else, so the one place that knows
// which part is which is the one that reads them apart.
export function totalOf(line: IncomeLineValues): number {
  return line.amount + line.bonus + line.rsu;
}
