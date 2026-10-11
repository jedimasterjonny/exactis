import { formatGbp } from "@/lib/money";

// One condition of a goal: a measure of a year of the plan is at least
// so many times a basis, which is a pound, so the multiple is a sum, or
// another measure, so twenty-five years of expenses is twenty-five
// times a year's expenses.
export interface Condition {
  readonly measure: Measure;
  readonly of: Basis;
  readonly times: number;
}

// A goal is a milestone the plan reaches rather than one it is laid
// out by: a name, and the conditions that hold once it is reached. It
// is reached in whichever year of a future its conditions first all
// hold, so it has no year of its own and no line can be tied to it;
// the chance of success reads the year off each future and says by
// when how many reach it. The id is its identity, handed out by the
// store as every record's is.
export interface Goal extends GoalValues {
  readonly id: number;
}

// The goal as its dialog edits it, which is the goal less its id.
export interface GoalValues {
  readonly conditions: readonly Condition[];
  readonly name: string;
}

// A year of a future as a goal measures it: the age the plan's owner
// reaches in it, and every sum in today's money: what the plan is
// worth entering the year, every account less every debt; what it is
// worth less the property and vehicles, which is the savings less
// every debt, the mortgage among them, as a liquid net worth is read;
// what a year of its expense lines comes to as the year opens; and
// what it owes, every debt summed, as a sum owed rather than a balance
// below nothing.
export type Measured = Readonly<Record<Measure, number>>;

type Basis = (typeof bases)[number];

type Measure = (typeof measures)[number];

// The sums a year is measured in, in the order a choice offers them.
export const sums = ["worth", "liquid", "expenses", "debt"] as const;

// The measures as a list, so the store's column takes the same words
// the type does: the age reached in the year, and the sums.
export const measures = ["age", ...sums] as const;

// What a measure may be held to: a pound or a year, which are units of
// their own, or any sum. An age is held to years and nothing else is,
// which the model holds.
export const bases = ["pounds", "years", ...sums] as const;

export const measureNames: Readonly<Record<Measure, string>> = {
  age: "Age",
  debt: "Debt",
  expenses: "A year's expenses",
  liquid: "Liquid net worth",
  worth: "Net worth",
};

// What each basis is called after the multiple, "25 years of expenses",
// "10 times the debt" or "48 years"; pounds are formatted as a sum
// instead.
export const basisNames: Readonly<Record<Basis, string>> = {
  debt: "times the debt",
  expenses: "years of expenses",
  liquid: "times liquid net worth",
  pounds: "pounds",
  worth: "times net worth",
  years: "years",
};

// A multiple, to two places where it needs them: "25", "2.5".
const multiple = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

// A condition in words, "Net worth ≥ £1,000,000", "Liquid net worth ≥
// 25 years of expenses" or "Age ≥ 48 years", as a row and a toast say
// it.
export function conditionOf({ measure, of, times }: Condition): string {
  const held =
    of === "pounds"
      ? formatGbp(times)
      : `${multiple.format(times)} ${basisNames[of]}`;
  return `${measureNames[measure]} ≥ ${held}`;
}

// Whether a goal is reached in a year measured so: every condition
// holds, a pound and a year each counting once. A goal with no
// condition is reached at once, which the model refuses to keep.
export function isReached(
  { conditions }: Pick<GoalValues, "conditions">,
  measured: Measured,
): boolean {
  return conditions.every(
    ({ measure, of, times }) =>
      measured[measure] >=
      times * (of === "pounds" || of === "years" ? 1 : measured[of]),
  );
}
