import type { LineGrowth, LineValues, Month } from "@/data/schedule";

import { monthName } from "@/lib/months";

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

// Where a line ends, for the rows and the toast: its last year, with
// the month before it when it ends part way through, "Nov 2047", and
// nothing for a line that runs to the end of the plan, which the caller
// names in its own words.
export function endOf(line: LineValues): null | string {
  if (line.lastYear === null) {
    return null;
  }
  const year = String(line.lastYear);
  return line.lastMonth === null
    ? year
    : `${monthName(line.lastMonth, "short")} ${year}`;
}

// A draft the store would take: named, and not ending before it starts.
// The save button holds until it is one.
export function isSound(draft: LineValues): boolean {
  return (
    draft.name.trim() !== "" &&
    (draft.lastYear === null || draft.lastYear >= draft.firstYear)
  );
}

// Whether a line is paid in the month: from its first year to its last,
// or on for good when it has none, and in its last year to the month it
// ends in, or through the whole of it when it has none. The engine reads
// a plan a month at a time by it, and the accounts screen asks it which
// salaries feed a pension in the month the plan starts in.
export function runsIn(line: LineValues, at: Month): boolean {
  if (line.firstYear > at.year) {
    return false;
  }
  if (line.lastYear === null || at.year < line.lastYear) {
    return true;
  }
  return (
    at.year === line.lastYear &&
    (line.lastMonth === null || at.month <= line.lastMonth)
  );
}

// The years a saved line runs, for the toast that reports it.
export function spanOf(line: LineValues): string {
  return `${String(line.firstYear)}–${endOf(line) ?? "end of plan"}`;
}
