// The three figures of a loan that fix each other, given what is owed:
// what is paid a month, the rate, and the years the payments take to
// reach the balloon a PCP leaves standing, or to clear a balance that
// leaves none.
export type LoanFigure = "payment" | "rate" | "term";

// The two figures typed last, the latest first, which stand while the
// third is worked out from them.
export type Stood = readonly [LoanFigure, LoanFigure];

// The three figures, so a patch can be asked which one it carries.
const figures: readonly LoanFigure[] = ["payment", "rate", "term"];

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
