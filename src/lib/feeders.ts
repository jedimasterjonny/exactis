import type { IncomeLine } from "@/data/income";

import { contributionOf } from "@/data/income";
import { yearly } from "@/lib/cadence";

// The names as a sentence lists them, "Salary and Salary step-up". It
// sits beside the feeders rather than with either caller, since the
// dialog naming the salaries that hold a treatment and the confirm
// naming the ones that stop say them the same way.
export const listed = new Intl.ListFormat("en-GB");

// What lands in the account with that id a year from every salary
// among the lines feeding it: each salary's sacrifice with the
// employer's NI saved on it, as the engine feeds it, stated a year
// whatever the salary's cadence, so the ledger can put one figure
// beside the account's own. The lines are the caller's to choose: the
// ledger hands the table the ones running in the month the plan is
// read in, so a salary that has ended, or is yet to start, lands
// nothing on the row. Nothing for an account nothing feeds.
export function fedOf(id: number, lines: readonly IncomeLine[]): number {
  return feeding(id, lines).reduce(
    (sum, line) => sum + yearly(contributionOf(line), line.cadence),
    0,
  );
}

// The names of the salaries feeding the account with that id. The id is
// an account's own and never null: a line feeding no pension holds null
// where an id would be, so a null asked for here would name every line
// that feeds none rather than none at all. A caller holding an account
// that has no id yet answers for itself.
export function feedersOf(id: number, lines: readonly IncomeLine[]): string[] {
  return feeding(id, lines).map((line) => line.name);
}

// The salaries feeding the account with that id, as the lines they
// are, for the dialog that edits their shares beside the account. The
// caveat above holds: the id is an account's own and never null.
export function feeding(
  id: number,
  lines: readonly IncomeLine[],
): IncomeLine[] {
  return lines.filter((line) => line.feeds === id);
}
