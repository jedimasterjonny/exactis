import type { IncomeLine } from "@/data/income";

// The names as a sentence lists them, "Salary and Salary step-up". It
// sits beside the feeders rather than with either caller, since the
// dialog naming the salaries that hold a treatment and the confirm
// naming the ones that stop say them the same way.
export const listed = new Intl.ListFormat("en-GB");

// The names of the salaries feeding the account with that id. The id is
// an account's own and never null: a line feeding no pension holds null
// where an id would be, so a null asked for here would name every line
// that feeds none rather than none at all. A caller holding an account
// that has no id yet answers for itself.
export function feedersOf(id: number, lines: readonly IncomeLine[]): string[] {
  return lines.filter((line) => line.feeds === id).map((line) => line.name);
}
