// The three figures of a loan that fix each other, given what is owed:
// what is paid a month, the rate, and the years the payments take to
// reach the balloon a PCP leaves standing, or to clear a balance that
// leaves none.
export type LoanFigure = "payment" | "rate" | "term";

// The two figures typed last, the latest first, which stand while the
// third is worked out from them.
export type Stood = readonly [LoanFigure, LoanFigure];

// The figure a dialog works out from the other two, and what it came
// to, or null where no figure fits.
export interface WorkedOut {
  readonly figure: null | number;
  readonly worked: LoanFigure;
}

// The three figures, so a patch can be asked which one it carries.
const figures: readonly LoanFigure[] = ["payment", "rate", "term"];

// Whether a secured asset's draft can be saved, as far as its loan's
// figures go: an asset with no loan has none to hold it, and a rate
// that could not be worked out holds it, since a rate is what the loan
// is saved on. A term that could not is no bar, since a loan the
// payment never clears is paid to the end of the plan and the store
// reads that off the figures it keeps.
export function isSettled(
  hasLoan: boolean,
  { figure, worked }: WorkedOut,
): boolean {
  return !hasLoan || worked !== "rate" || figure !== null;
}

// A secured asset's values as its draft saves them: nothing owed, paid
// or charged for an asset with no loan, whatever the hidden fields
// hold; and otherwise the figure worked out in place of the draft's own
// where there is one to put there. A worked-out term goes nowhere,
// since the store reads it off the other figures, and a figure that
// could not be worked out leaves the draft's, which the held save never
// sends.
export function settled<
  TValues extends {
    readonly balance: number;
    readonly payment: number;
    readonly rate: number;
  },
>(values: TValues, hasLoan: boolean, { figure, worked }: WorkedOut): TValues {
  if (!hasLoan) {
    return { ...values, balance: 0, payment: 0, rate: 0 };
  }
  if (worked === "term" || figure === null) {
    return values;
  }
  return worked === "payment"
    ? { ...values, payment: figure }
    : { ...values, rate: figure };
}

// The two that stand once a patch lands: the figure it carries first,
// and whichever of the two that stood is not it, so the one worked out
// is always the one left alone longest. A patch carrying none of the
// three leaves the two as they were.
export function stood(
  typed: Stood,
  patch: Partial<Record<LoanFigure, number>>,
): Stood {
  const figure = figures.find((candidate) => candidate in patch);
  if (figure === undefined) {
    return typed;
  }
  const [first, second] = typed;
  return [figure, first === figure ? second : first];
}

// The figure the two given leave out.
export function thirdOf(one: LoanFigure, other: LoanFigure): LoanFigure {
  switch (one) {
    case "payment":
      return other === "rate" ? "term" : "rate";
    case "rate":
      return other === "payment" ? "term" : "payment";
    case "term":
      return other === "payment" ? "rate" : "payment";
  }
}

// The two figures that stand as a secured asset's dialog opens: the
// payment and the rate the store keeps of a loan, the term being worked
// out from them, or for an asset with none the rate and the term, so
// the payment follows from the first two typed.
export function typedOn(hasLoan: boolean): Stood {
  return hasLoan ? ["payment", "rate"] : ["rate", "term"];
}
