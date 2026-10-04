import type { LineGrowth, LineValues, Month } from "@/data/schedule";

import { isOnOrBefore, monthName } from "@/lib/months";

// What each growth choice is called, on the rows and in the dialog that
// offers them: the amount rises with inflation, a point or two over it,
// or not at all, in words that say what happens to the figure rather
// than naming the basis it is held on, since a line "nominal, fixed"
// read under a figure that shrinks in today's money year on year.
export const growthLabels: Record<LineGrowth, string> = {
  inflation: "Rises with inflation",
  "inflation-plus-1": "Rises 1% over inflation",
  "inflation-plus-2": "Rises 2% over inflation",
  nominal: "Fixed in pounds",
};

// Where a line ends: its last year, with the month before it when it
// ends part way through, "Nov 2047", and nothing for a line that runs to
// the end of the plan.
export function endOf(line: LineValues): null | string {
  if (line.lastYear === null) {
    return null;
  }
  const year = String(line.lastYear);
  return line.lastMonth === null
    ? year
    : `${monthName(line.lastMonth, "short")} ${year}`;
}

// Whether a line ends no earlier than it starts, a line with no last
// year running to the end of the plan. The save holds a line to it, and
// the save button waits on it, so the two ask the one question.
export function endsAfterItStarts(line: {
  readonly firstYear: number;
  readonly lastYear: null | number;
}): boolean {
  return line.lastYear === null || line.lastYear >= line.firstYear;
}

// A draft the store would take: named, and not ending before it starts.
// The save button holds until it is one.
export function isSound(draft: LineValues): boolean {
  return draft.name.trim() !== "" && endsAfterItStarts(draft);
}

// Whether a line is paid in the month: from its first year to its last,
// or on for good when it has none, and in its last year to the month it
// ends in, or through the whole of it when it has none. The engine reads
// a plan a month at a time by it, and the accounts screen asks it which
// salaries feed a pension in the month the plan starts in.
export function runsIn(line: LineValues, at: Month): boolean {
  return (
    line.firstYear <= at.year &&
    (line.lastYear === null ||
      isOnOrBefore(at, { month: line.lastMonth ?? 11, year: line.lastYear }))
  );
}

// The years a line runs, one way wherever they are written, on its row,
// in a month's ledger and in the toast that reports it: "2026–2046", to
// the month when it ends part way through a year, "2026–Jul 2047", or
// "2048 on" for a line running to the end of the plan.
export function spanOf(line: LineValues): string {
  const end = endOf(line);
  return end === null
    ? `${String(line.firstYear)} on`
    : `${String(line.firstYear)}–${end}`;
}
