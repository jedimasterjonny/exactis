import type { IncomeLine } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";

import { retirementYearOf } from "@/data/milestones";
import { yearAt } from "@/data/plan";

// The full new State Pension for 2026/27, £241.30 a week, as a year of
// 52 weeks in whole pounds. It is in today's money, as every line's
// amount is, and the line paying it rises with inflation: the triple
// lock raises it each April by the most of earnings, prices and 2.5%,
// so prices are the least it rises by, and the plan holds that floor
// rather than guess at the rest.
const fullStatePension = 12_548;

// The qualifying years that earn the full amount, and the fewest that
// earn any.
const fullYears = 35;
const fewestYears = 10;

// The qualifying years an owner is paid the State Pension on: those
// typed, none where none are, taken as they stand; or, where they are
// dated by the tax year they run through, one more for each tax year
// after it that opens before the year the owner retires in, as the plan
// given lays it out, and before the year they reach their State Pension
// age.
export function qualifyingYearsOf(owner: Owner, plan: Plan): number {
  const years = owner.qualifyingYears ?? 0;
  if (owner.qualifiedThrough === undefined) {
    return years;
  }
  // ponytail: every tax year before retirement counts as a qualifying
  // one, so a year at home, part-time below the Lower Earnings Limit or
  // credited for Child Benefit or caring is not told apart from a year
  // worked; holding which years an owner works, and above what, is the
  // upgrade.
  const stops = Math.min(
    retirementYearOf(owner, plan),
    statePensionFrom(owner),
  );
  return years + Math.max(0, stops - 1 - owner.qualifiedThrough);
}

// The State Pension age of an owner born in the year given, whatever
// their sex, since the ages were equalised in 2018: 66 for one born in
// 1960 or before, 67 for one born from 1961 to 1977, and 68 from 1978.
// An owner holds the year they were born in and not the day, so the age
// is read off the year, as the engine reads the pension age, and the
// whole of the year it is reached in counts as reaching it; the months
// by which the age phases up across 1960 and again across 1977 are not
// held, and each of those years is paid from the year most born in it
// reach the age in.
export function statePensionAge(born: number): number {
  if (born <= 1960) {
    return 66;
  }
  return born <= 1977 ? 67 : 68;
}

// The year an owner's State Pension is paid from: the year they reach
// their State Pension age in.
export function statePensionFrom(owner: Pick<Owner, "born">): number {
  return yearAt(statePensionAge(owner.born), owner);
}

// The line paying an owner the State Pension their qualifying years
// earn, counted as the plan given lays their retirement out, a year at
// a time from the year they reach their State Pension age to the end of
// the plan, rising with inflation; or none for an owner whose years earn
// nothing, none typed among them. It is the household's own rather than
// a line kept, made whenever the household is read and again wherever
// a run places a retirement on conditions, so it moves with the owner's
// year of birth, their years and their retirement.
// Its id is the owner's, which no line holds, since the kept household
// refuses an id held by more than one record, as the line paying a
// move's mortgage is given its loan's. It is no salary, so it feeds no
// pension and pays no National Insurance, and it is tied to no
// milestone, since the law says when it starts.
export function statePensionLines(owner: Owner, plan: Plan): IncomeLine[] {
  const amount = statePensionOn(qualifyingYearsOf(owner, plan));
  return amount === 0
    ? []
    : [
        {
          amount,
          bonus: 0,
          cadence: "year",
          endsAfter: 0,
          endsAt: null,
          feeds: null,
          firstYear: statePensionFrom(owner),
          growth: "inflation",
          id: owner.id,
          kind: "state-pension",
          lastMonth: null,
          lastYear: null,
          match: 0,
          name: `State pension · ${owner.name}`,
          owner: owner.id,
          rsu: 0,
          sacrifice: 0,
          startsAt: null,
        },
      ];
}

// What qualifying years earn a year in today's money: the full amount
// for 35 or more, since years past 35 earn no more, nothing for fewer
// than ten, and a 35th of it for each year between, to the pound.
export function statePensionOn(years: number): number {
  if (years < fewestYears) {
    return 0;
  }
  return Math.round(
    (fullStatePension * Math.min(years, fullYears)) / fullYears,
  );
}
