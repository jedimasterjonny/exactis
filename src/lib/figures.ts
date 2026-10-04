// The three figures of a loan that fix each other, given what is owed:
// what is paid a month, the rate, and the years the payments take to
// reach the balloon a PCP leaves standing, or to clear a balance that
// leaves none.
export type LoanFigure = "payment" | "rate" | "term";

// The figure a dialog works out from the other two, and what it came
// to, or null where no figure fits.
export interface WorkedOut {
  readonly figure: null | number;
  readonly worked: LoanFigure;
}

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

// The figure worked out as a patch of the draft, for a dialog to keep
// as typed when another figure is chosen to be worked out instead, so
// the field it was shown in keeps showing it; or none where no figure
// fit, which leaves the draft's own.
export function kept({
  figure,
  worked,
}: WorkedOut): Partial<Record<LoanFigure, number>> {
  if (figure === null) {
    return {};
  }
  switch (worked) {
    case "payment":
      return { payment: figure };
    case "rate":
      return { rate: figure };
    case "term":
      return { term: figure };
  }
}

// Whether a patch of a secured asset's draft moves what its loan's
// figures are worked out from: what is owed, the balloon, any of the
// three figures, or whether there is a loan at all and of what kind.
export function movesLoan(patch: object): boolean {
  return [
    "agreement",
    "balance",
    "balloon",
    "payment",
    "rate",
    "status",
    "term",
  ].some((key) => key in patch);
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

// The figure a secured asset's dialog opens working out: the term, from
// the payment and the rate the store keeps of a loan, or for an asset
// with none the payment, which follows from the rate and the term.
export function workedOn(hasLoan: boolean): LoanFigure {
  return hasLoan ? "term" : "payment";
}
