import type { IncomeLine } from "@/data/income";

// The names as a sentence lists them, "Salary and Salary step-up". It
// sits beside the feeders rather than with either caller, since the
// dialog naming the salaries that hold a treatment and the confirm
// naming the ones that stop say them the same way.
export const listed = new Intl.ListFormat("en-GB");

// The names of the salaries feeding the account with that id, and none
// for a new account, which has no id yet.
export function feedersOf(
  id: null | number,
  lines: readonly IncomeLine[],
): string[] {
  return lines.filter((line) => line.feeds === id).map((line) => line.name);
}
