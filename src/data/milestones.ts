import type { Plan } from "@/data/plan";

import { retirementYear } from "@/data/plan";

// A milestone as the plan lays it out: one the household lists, or
// retirement. Retirement is no record. It is the year the plan's owner
// retires in, read off the age the dashboard sets, so it is always
// there, moves as that age does, and has nothing to delete. It is told
// from the rest by an id no record can have, since a record's is a
// number.
export interface Marker {
  readonly id: "retirement" | number;
  readonly name: string;
  readonly year: number;
}

// A milestone is a year the plan turns on, named: the children leaving
// home, a move, the last of a mortgage. It is the first year of whatever
// it marks. The id is its identity, handed out by the store as every
// record's is.
export interface Milestone {
  readonly id: number;
  readonly name: string;
  readonly year: number;
}

// The milestones the plan is laid out by, in the order their years come
// in: retirement, in the year the plan's owner retires in, and those the
// household lists. Two in the one year keep the order they are given
// in, retirement first.
export function markersOf(
  milestones: readonly Milestone[],
  plan: Plan,
): readonly Marker[] {
  const retirement: Marker = {
    id: "retirement",
    name: "Retirement",
    year: retirementYear(plan),
  };
  return [retirement, ...milestones].sort(
    (first, second) => first.year - second.year,
  );
}
