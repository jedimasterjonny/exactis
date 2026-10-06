import type { Outcome } from "@/engine/futures";

// The outcomes a future that lasted is graded into, the best first, and
// those a future that fell short is, the nearest miss first: the order
// the chance of success lists them in and draws them along its bar, so
// the two arms meet where lasting turns to falling short.
export const lastingOutcomes = [
  "surplus",
  "comfortable",
  "barely",
] as const satisfies readonly Outcome[];

export const shortOutcomes = [
  "almost",
  "middle",
  "early",
] as const satisfies readonly Outcome[];

// What each outcome is called, wherever it is named.
export const outcomeNames: Readonly<Record<Outcome, string>> = {
  almost: "Almost made it",
  barely: "Barely made it",
  comfortable: "Comfortable",
  early: "Fell short early",
  middle: "Fell short in the middle",
  surplus: "Large surplus",
};

// The tone each outcome is drawn in, as the whole class, since Tailwind
// reads class names whole and one built from pieces is never generated.
export const outcomeTones: Readonly<Record<Outcome, string>> = {
  almost: "bg-outcome-almost",
  barely: "bg-outcome-barely",
  comfortable: "bg-outcome-comfortable",
  early: "bg-outcome-early",
  middle: "bg-outcome-middle",
  surplus: "bg-outcome-surplus",
};
