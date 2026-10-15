import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";
import type { LineValues, Tie } from "@/data/schedule";

import { retirementYear, yearAt } from "@/data/plan";
import { rules } from "@/data/rules";
import { formatGbp } from "@/lib/money";

// One condition of a milestone: a measure of a year of the plan is at
// least so many times a basis, which is a pound or a year, so the
// multiple is a sum or an age, or another measure, so twenty-five years
// of expenses is twenty-five times a year's expenses.
export interface Condition {
  readonly measure: Measure;
  readonly of: Basis;
  readonly times: number;
}

// A milestone as the plan lays it out: one the household lists that is
// reached at an age, or retirement. Retirement is no record. It is the
// year the plan's owner retires in, read off the age the dashboard
// sets, so it is always there, moves as that age does, and has nothing
// to delete. It is told from the rest by an id no record can have,
// since a record's is a number, and its id is what a line tied to it
// holds.
export interface Marker {
  readonly id: Tie;
  readonly name: string;
  readonly year: number;
}

// A year of a future as a milestone measures it: the age the plan's
// owner reaches in it, and every sum in today's money: what the plan
// is worth entering the year, every account less every debt; what it
// is worth less the property and vehicles, which is the savings less
// every debt, the mortgage among them, as a liquid net worth is read;
// what a year of its expense lines comes to as the year opens; and
// what it owes, every debt summed, as a sum owed rather than a balance
// below nothing.
export type Measured = Readonly<Record<Measure, number>>;

// A milestone is a year the plan turns on, named: the children leaving
// home, a move, the last of a mortgage, the first million. It is
// reached in whichever year its conditions first all hold. One reached
// at an age, whose one condition is on the age, falls in a year the
// plan can say, born plus the age, and it is the first year of
// whatever it marks, so a line tied to start at it starts in its year
// and a line tied to end at it runs to the year before, and two lines
// tied to it, one each way, hand over there with no year left unpaid
// or paid twice. One reached when conditions on the sums hold falls in
// a year only a future can say, so the chance of success reads the
// year off each future and says by when how many reach it, and no
// line can be tied to it, since when it is reached depends on the
// lines. The id is its identity, handed out by the store as every
// record's is.
export interface Milestone extends MilestoneValues {
  readonly id: number;
}

// The milestone as its dialog edits it, which is the milestone less its
// id.
export interface MilestoneValues {
  readonly conditions: readonly Condition[];
  readonly name: string;
}

type Basis = (typeof bases)[number];

type Measure = (typeof measures)[number];

// The sums a year is measured in, in the order a choice offers them.
export const sums = ["worth", "liquid", "expenses", "debt"] as const;

// The measures as a list, so the store's column takes the same words
// the type does: the age reached in the year, and the sums.
export const measures = ["age", ...sums] as const;

// What a measure may be held to: a pound or a year, which are units of
// their own, or any sum. An age is held to years and nothing else is,
// which the model holds.
export const bases = ["pounds", "years", ...sums] as const;

export const measureNames: Readonly<Record<Measure, string>> = {
  age: "Age",
  debt: "Debt",
  expenses: "A year's expenses",
  liquid: "Liquid net worth",
  worth: "Net worth",
};

// What each basis is called after the multiple, "25 years of expenses",
// "10 times the debt" or "46 years"; pounds are formatted as a sum
// instead.
export const basisNames: Readonly<Record<Basis, string>> = {
  debt: "times the debt",
  expenses: "years of expenses",
  liquid: "times liquid net worth",
  pounds: "pounds",
  worth: "times net worth",
  years: "years",
};

// A multiple, to two places where it needs them: "25", "2.5".
const multiple = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

// The age a milestone reached at an age is reached at: the years of its
// one condition, which is on the age, and which the model holds is its
// only one. A milestone reached when conditions on the sums hold has
// none.
export function ageOf({
  conditions,
}: Pick<MilestoneValues, "conditions">): number | undefined {
  const [only, ...rest] = conditions;
  return rest.length === 0 && only?.measure === "age" ? only.times : undefined;
}

// The conditions of a milestone reached at an age: the one, on the
// age.
export function atAge(age: number): readonly Condition[] {
  return [{ measure: "age", of: "years", times: age }];
}

// A condition in words, "Net worth ≥ £1,000,000", "Liquid net worth ≥
// 25 years of expenses" or "Age ≥ 46 years", as a row and a toast say
// it.
export function conditionOf({ measure, of, times }: Condition): string {
  const held =
    of === "pounds"
      ? formatGbp(times)
      : `${multiple.format(times)} ${basisNames[of]}`;
  return `${measureNames[measure]} ≥ ${held}`;
}

// Whether a milestone is reached in a year measured so: every condition
// holds, a pound and a year each counting once. A milestone with no
// condition is reached at once, which the model refuses to keep.
export function isReached(
  { conditions }: Pick<MilestoneValues, "conditions">,
  measured: Measured,
): boolean {
  return conditions.every(
    ({ measure, of, times }) =>
      measured[measure] >=
      times * (of === "pounds" || of === "years" ? 1 : measured[of]),
  );
}

// Whether either end of the line is tied to the milestone.
export function isTiedTo(line: LineValues, tie: Tie): boolean {
  return line.startsAt === tie || line.endsAt === tie;
}

// The milestones the plan is laid out by, in the order their years come
// in: retirement, in the year the plan's owner retires in, and those the
// household lists that are reached at an age, each in the year the age
// is reached. One reached when conditions hold falls in no year the
// plan can say, so it is not among them. Two in the one year keep the
// order they are given in, retirement first.
export function markersOf(
  milestones: readonly Milestone[],
  plan: Plan,
): readonly Marker[] {
  const retirement: Marker = {
    id: "retirement",
    name: "Retirement",
    year: retirementYear(plan),
  };
  const fixed = milestones.flatMap(({ id, name, ...milestone }) => {
    const year = yearOf(milestone, plan);
    return year === undefined ? [] : [{ id, name, year }];
  });
  return [retirement, ...fixed].sort(
    (first, second) => first.year - second.year,
  );
}

// The year an owner the plan carries retires in: the year they reach
// the age, for a retirement reached at an age, and for the plan's owner
// one reached when conditions hold, the year the plan lays it out in.
// Only the plan's owner retires when conditions hold, so anyone else's
// retirement on conditions is refused in the rule's words, as the model
// refuses to keep one.
export function retirementYearOf(owner: Owner, plan: Plan): number {
  const age = ageOf({ conditions: owner.retirement });
  if (age !== undefined) {
    return yearAt(age, owner);
  }
  if (owner.id !== plan.owners[0]?.id) {
    throw new Error(rules.retiresAtAge);
  }
  return retirementYear(plan);
}

// The plan with its owner retiring at the age given, as the dashboard
// drags it: written on the plan, which the Retirement milestone and the
// slider read, and on the first listed owner, as their retirement's one
// condition, whose plan it is and whose lines the engine stops by their
// own years, so the two cannot drift apart.
export function retiringAt(plan: Plan, retires: number): Plan {
  return {
    ...plan,
    owners: plan.owners.map((owner, index) =>
      index === 0 ? { ...owner, retirement: atAge(retires) } : owner,
    ),
    retires,
  };
}

// A line as its ties make it: an end tied to a milestone read off it,
// the first year the milestone's own and the last the year before it,
// or as many years later as the line ends after it, run whole, and an
// end tied to none as it is. An end tied to a milestone the household
// does not list, or to one reached when conditions hold, is left as it
// is, for the household to refuse. The household is read through this,
// and the dashboard runs it again as the retirement age is dragged, so
// a line moves wherever its milestone does.
export function timed<TLine extends LineValues>(
  line: TLine,
  milestones: readonly Milestone[],
  plan: Plan,
): TLine {
  const first =
    line.startsAt === null
      ? undefined
      : yearTied(line.startsAt, milestones, plan);
  const last =
    line.endsAt === null ? undefined : yearTied(line.endsAt, milestones, plan);
  return {
    ...line,
    ...(first !== undefined && { firstYear: first }),
    ...(last !== undefined && {
      lastMonth: null,
      lastYear: last - 1 + line.endsAfter,
    }),
  };
}

// A line with its ties to the milestone cut, each end tied to it fixed
// in the year it falls in now, years after the milestone included, so a
// milestone deleted leaves the lines tied to it where they were rather
// than moving them. An end tied to anything else stays tied, and a
// milestone reached when conditions hold has no year to fix an end in
// and nothing tied to it, so every line stays as it is.
export function untied<TLine extends LineValues>(
  line: TLine,
  milestone: Milestone,
  plan: Plan,
): TLine {
  const year = yearOf(milestone, plan);
  if (year === undefined) {
    return line;
  }
  return {
    ...line,
    ...(line.startsAt === milestone.id && { firstYear: year, startsAt: null }),
    ...(line.endsAt === milestone.id && {
      endsAfter: 0,
      endsAt: null,
      lastMonth: null,
      lastYear: year - 1 + line.endsAfter,
    }),
  };
}

// The years the milestones fall in, each once, in the order they come,
// for the rules every bar on the plan's span draws across its track: two
// milestones in the one year rule it once.
export function yearsOf(markers: readonly Marker[]): number[] {
  return [...new Set(markers.map(({ year }) => year))];
}

// The year a milestone reached at an age falls in, the year the plan's
// owner reaches the age, or none for one reached when conditions hold.
function yearOf(
  milestone: Pick<MilestoneValues, "conditions">,
  plan: Plan,
): number | undefined {
  const age = ageOf(milestone);
  return age === undefined ? undefined : yearAt(age, plan);
}

// The year a tie falls in: retirement's, or the listed milestone's, or
// none for a milestone the household does not list or one reached when
// conditions hold.
function yearTied(
  tie: Tie,
  milestones: readonly Milestone[],
  plan: Plan,
): number | undefined {
  if (tie === "retirement") {
    return retirementYear(plan);
  }
  const milestone = milestones.find(({ id }) => id === tie);
  return milestone === undefined ? undefined : yearOf(milestone, plan);
}
