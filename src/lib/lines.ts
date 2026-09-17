import type { LineGrowth, LineValues } from "@/data/schedule";

// What each growth choice is called, on the rows and in the dialog that
// offers them: the amount rises with inflation, a point or two over it,
// the triple lock, or not at all.
export const growthLabels: Record<LineGrowth, string> = {
  inflation: "Inflation",
  "inflation-plus-1": "Inflation +1%",
  "inflation-plus-2": "Inflation +2%",
  nominal: "Nominal, fixed",
  "triple-lock": "Triple lock",
};

// A draft the store would take: named, and not ending before it starts.
// The save button holds until it is one.
export function isSound(draft: LineValues): boolean {
  return (
    draft.name.trim() !== "" &&
    (draft.lastYear === null || draft.lastYear >= draft.firstYear)
  );
}

// The years a saved line runs, for the toast that reports it.
export function spanOf(line: LineValues): string {
  const last = line.lastYear === null ? "end of plan" : String(line.lastYear);
  return `${String(line.firstYear)}–${last}`;
}
