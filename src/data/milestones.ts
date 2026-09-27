import type { Plan } from "@/data/plan";
import type { LineValues, Tie } from "@/data/schedule";

import { retirementYear } from "@/data/plan";

// A milestone as the plan lays it out: one the household lists, or
// retirement. Retirement is no record. It is the year the plan's owner
// retires in, read off the age the dashboard sets, so it is always
// there, moves as that age does, and has nothing to delete. It is told
// from the rest by an id no record can have, since a record's is a
// number, and its id is what a line tied to it holds.
export interface Marker {
  readonly id: Tie;
  readonly name: string;
  readonly year: number;
}

// A milestone is a year the plan turns on, named: the children leaving
// home, a move, the last of a mortgage. It is the first year of whatever
// it marks, so a line tied to start at it starts in its year and a line
// tied to end at it runs to the year before, and two lines tied to it,
// one each way, hand over there with no year left unpaid or paid twice.
// The id is its identity, handed out by the store as every record's is.
export interface Milestone extends MilestoneValues {
  readonly id: number;
}

// The milestone as its row edits it, which is the milestone less its id.
export interface MilestoneValues {
  readonly name: string;
  readonly year: number;
}

// Whether either end of the line is tied to the milestone.
export function isTiedTo(line: LineValues, tie: Tie): boolean {
  return line.startsAt === tie || line.endsAt === tie;
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

// A line as its ties make it: an end tied to a milestone read off it,
// the first year the milestone's own and the last the year before it,
// run whole, and an end tied to none as it is. An end tied to a
// milestone the household does not list is left as it is, for the
// household to refuse. The household is read through this, and the
// dashboard runs it again as the retirement age is dragged, so a line
// moves wherever its milestone does.
export function timed<TLine extends LineValues>(
  line: TLine,
  milestones: readonly Milestone[],
  plan: Plan,
): TLine {
  const first =
    line.startsAt === null
      ? undefined
      : yearOf(line.startsAt, milestones, plan);
  const last =
    line.endsAt === null ? undefined : yearOf(line.endsAt, milestones, plan);
  return {
    ...line,
    ...(first !== undefined && { firstYear: first }),
    ...(last !== undefined && { lastMonth: null, lastYear: last - 1 }),
  };
}

// A line with its ties to the milestone cut, each end tied to it fixed
// in the year it falls in now, so a milestone deleted leaves the lines
// tied to it where they were rather than moving them. An end tied to
// anything else stays tied.
export function untied<TLine extends LineValues>(
  line: TLine,
  milestone: Milestone,
): TLine {
  return {
    ...line,
    ...(line.startsAt === milestone.id && {
      firstYear: milestone.year,
      startsAt: null,
    }),
    ...(line.endsAt === milestone.id && {
      endsAt: null,
      lastMonth: null,
      lastYear: milestone.year - 1,
    }),
  };
}

// The year a tie falls in: retirement's, or the listed milestone's, or
// none for a milestone the household does not list.
function yearOf(
  tie: Tie,
  milestones: readonly Milestone[],
  plan: Plan,
): number | undefined {
  return tie === "retirement"
    ? retirementYear(plan)
    : milestones.find(({ id }) => id === tie)?.year;
}
