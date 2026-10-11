import type { Account } from "@/data/accounts";
import type { Measured, MilestoneValues } from "@/data/milestones";
import type { Path, Plan, Spread } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";
import type { ProjectionPoint } from "@/engine/projection";

import { isAsset } from "@/data/accounts";
import { isReached } from "@/data/milestones";
import { ageIn, endYear, pricesIn, retirementYear } from "@/data/plan";
import { spentIn } from "@/engine/cash-flow";
import { balanceIn, isShort, project } from "@/engine/projection";
import { normalsFrom } from "@/lib/random";

// One future the plan was run over, as the chance of success reads it:
// the year it first fell short, by running out of money or by drawing a
// pension before the pension age, or null for a future that lasts; the
// year it first ran out, or null for one that never did, so a future
// kept going only by drawing a pension early is told from one that ran
// out; and each year of it measured as a milestone measures one,
// entering it and in today's money as the projection's points are: what the
// plan is worth, every account it holds less every debt it owes, a
// house or a car at its value less the loan on it, as the dashboard
// counts net worth, and the rest beside it. A future that falls short
// by drawing early has not lasted: the 55% the draw is charged keeps
// the plan going only on paper, which is why the projection marks it.
export interface Future {
  readonly fell: null | number;
  readonly measured: readonly Measured[];
  readonly ranOut: null | number;
}

// A year of a run of futures, as the chance of success lays the run on
// the plan's years: what the futures are worth as it opens, read at the
// middle one and at a quarter and a tenth in from either end, counted
// the same from either end, and how many have run out of money by the
// time it closes, in it or before.
export interface FutureYear {
  readonly bottomQuarter: number;
  readonly bottomTenth: number;
  readonly middle: number;
  readonly outOfMoney: number;
  readonly topQuarter: number;
  readonly topTenth: number;
  readonly year: number;
}

// What a future comes to, as the chance of success grades a run: one
// that lasted by what it leaves, one that fell short by when.
export type Outcome =
  "almost" | "barely" | "comfortable" | "early" | "middle" | "surplus";

// What a run of futures comes to, as the chance of success reads it:
// how many were run; how many lasted, ran out of money, or were kept
// going only by drawing a pension early, the three adding up to the
// run; the share that lasted, which is the chance, and how far the run
// alone may have it wrong, the half-width of the range 19 runs in 20
// would put it in, never nothing; the year the first ran out and the year by which
// half of those had, none where none did; and what the middle future is
// worth entering the plan's last year, its net worth, half worth less and
// half more.
export interface Reading {
  readonly chance: number;
  readonly early: number;
  readonly firstRanOut: null | number;
  readonly halfRanOut: null | number;
  readonly lasted: number;
  readonly margin: number;
  readonly middle: number;
  readonly ranOut: number;
  readonly run: number;
}

// What a future is measured over: the accounts, the schedule and the
// plan its points were projected from, the path it was carried along
// among them, so a year's expenses are read in that future's money.
interface Run {
  readonly accounts: readonly Account[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

// How many futures a run draws: enough to pin the chance to within two
// points either way, and few enough that the run is a matter of
// seconds. The screen and the dashboard's tile draw the same run, so
// they say the same chance.
export const runLength = 1000;

// The seed every run of the futures starts from, so every run of a plan
// meets the same markets and a change in what they come to is the plan's.
const seed = 2026;

// What a substream's seed steps by from one future to the next: the
// golden ratio's share of 2^32, which spreads the futures' seeds as far
// from each other as any step can.
const step = 0x9e3779b9;

// The lines a run of futures is graded on, as gradingOf draws them for
// a plan: the year from which a future falling short has reached the
// middle of retirement and the year from which it almost made it, and
// the pounds from which a future lasting is comfortable and over which
// it leaves a large surplus.
export interface Grading {
  readonly almost: number;
  readonly comfortable: number;
  readonly middle: number;
  readonly surplus: number;
}

// A projection read as a future, over what it was run over: the year
// it first fell short, by running out or by drawing a pension early,
// the year it first ran out, and each year measured from the month it
// opens with, the plan's month for the first. What a future drawn is
// read as, and what the plan at its own rates is read as beside them.
export function futureOf(points: readonly ProjectionPoint[], run: Run): Future {
  return {
    fell: points.find(isShort)?.year ?? null,
    measured: points.map((point, offset) =>
      measuredOf(
        point,
        { month: offset === 0 ? run.plan.month : 0, year: point.year },
        run,
      ),
    ),
    ranOut: points.find(({ uncovered }) => uncovered > 0)?.year ?? null,
  };
}

// The futures of a plan, drawn one at a time without end from the place
// in the run given, its first unless another is, each the plan carried
// along its own path, drawn as pathOf draws one at the spread given.
// Future by future the draws come from a stream of their own, seeded by
// where the future falls in the run, so a run of a thousand starts with
// the hundred a run of a hundred is, a run drawn from its fiftieth is
// the rest of the run drawn from its first, and the futures do not
// depend on how many are taken or by whom.
export function* futuresOf(
  accounts: readonly Account[],
  schedule: Schedule,
  {
    from = 0,
    plan,
    spread,
  }: { readonly from?: number; readonly plan: Plan; readonly spread: Spread },
): Generator<Future, never, undefined> {
  for (let future = from; ; future += 1) {
    const path = pathOf(plan, spread, normalsFrom(seed + future * step));
    const run = { accounts, plan: { ...plan, path }, schedule };
    yield futureOf(project(accounts, schedule, run.plan), run);
  }
}

// The lines a plan's futures are graded on. A future that lasted is
// graded by what the plan is worth at its end against what the plan at
// its own rates is worth as its owner retires: more than three times
// that a large surplus, half to three times comfortable, and less than
// half barely made it. One yardstick for every future rather than each
// future's own worth at retirement, so a future that leaves more is
// never graded below one that leaves less, and each grade is a span of
// pounds. A plan worth nothing at retirement, or less, gives no scale to
// grade by, three times nothing calling a future that leaves a pound a
// large surplus and three times a debt crossing the lines, so it is
// graded against what it is worth today, and never against less than
// nothing. A future that fell short is graded by how far into the
// plan's retirement it got first: in the last fifth almost made it, in
// the two fifths before that the middle, and before those early, with
// every future falling short before retirement. Counted from the plan's
// start instead, two fifths of a plan opening in its owner's thirties
// would end in their fifties, before most retire, and early would hold
// only the bridge to a pension. A retirement already begun counts from
// the plan's start, where the futures are drawn from, and a plan ending
// before its owner retires has no retirement to divide, so its own years
// are divided instead. The fifths are worked out in whole years, so a
// fifth that lands on a year starts there rather than a rounding step
// after it. The worth at a retirement outside the plan's years is read
// at the nearer end of them.
export function gradingOf(projected: Future, plan: Plan): Grading {
  const end = endYear(plan);
  const retired = retirementYear(plan);
  const opens = retired < end ? Math.max(retired, plan.from) : plan.from;
  const span = Math.max(1, end - opens);
  const at = Math.min(
    Math.max(retired - plan.from, 0),
    projected.measured.length - 1,
  );
  const atRetirement = projected.measured[at]?.worth ?? 0;
  const worth =
    atRetirement > 0
      ? atRetirement
      : Math.max(0, projected.measured[0]?.worth ?? 0);
  return {
    almost: opens + Math.ceil((4 * span) / 5),
    comfortable: worth / 2,
    middle: opens + Math.ceil((2 * span) / 5),
    surplus: 3 * worth,
  };
}

// A run of futures graded on the lines given, counted. A future kept
// going only by drawing a pension early is graded by when it first did,
// as it is counted as falling short then.
export function outcomesOf(
  futures: readonly Future[],
  grading: Grading,
): Readonly<Record<Outcome, number>> {
  function outcomeOf({ fell, measured }: Future): Outcome {
    if (fell === null) {
      const left = measured.at(-1)?.worth ?? 0;
      if (left > grading.surplus) {
        return "surplus";
      }
      return left >= grading.comfortable ? "comfortable" : "barely";
    }
    if (fell >= grading.almost) {
      return "almost";
    }
    return fell >= grading.middle ? "middle" : "early";
  }
  const graded = futures.map(outcomeOf);
  const count = (outcome: Outcome): number =>
    graded.filter((each) => each === outcome).length;
  return {
    almost: count("almost"),
    barely: count("barely"),
    comfortable: count("comfortable"),
    early: count("early"),
    middle: count("middle"),
    surplus: count("surplus"),
  };
}

// One future of the markets for the plan, a return and an inflation for
// every year it carries, each drawn apart from the others and log-normal
// about the plan's own: one plus a year's figure is one plus the plan's
// times the exponential of a normal draw scaled to the spread. So the
// middle year of the draws grows at exactly the plan's rate. That is
// what the plan rate means, BlackRock's returns being annualised, a
// figure that compounds to where the markets are expected to end, and so
// the middle future lands near the projection at the plan's rates;
// keyed to the average year instead, it would compound some half a
// spread squared lower every year, and at the 14% a year a portfolio of
// mostly stocks strays by, its middle future would sit a third under
// the projection after fifty years. The average year comes out that
// much above the plan's rate, and no year loses more than
// everything, as a normal draw of the return itself could. The plan's
// first year is drawn whole although the plan holds only the months of
// it from where it starts, which understates how far that one stretch
// can stray. Inflation is drawn apart from returns, since no source
// says how the two move together, and each year apart from the last, so
// a decade of high prices is rarer here than the past has known.
export function pathOf(
  plan: Pick<Plan, "inflation" | "rate" | "years">,
  spread: Spread,
  normal: () => number,
): Path {
  const drawn = (rate: number, by: number): number =>
    (1 + rate) * Math.exp(by * normal()) - 1;
  const years = Array.from({ length: plan.years }, () => ({
    inflation: drawn(plan.inflation, spread.inflation),
    rate: drawn(plan.rate, spread.rate),
  }));
  return {
    inflation: years.map(({ inflation }) => inflation),
    rate: years.map(({ rate }) => rate),
  };
}

// The year by which the share given of a run of futures have reached
// the milestone, or null where fewer ever do: at a twentieth the year
// the earliest 5% have reached it by, and at a half the median. A run
// of none reaches nothing.
export function reachedBy(
  futures: readonly Future[],
  milestone: Pick<MilestoneValues, "conditions">,
  {
    plan,
    share,
  }: { readonly plan: Pick<Plan, "from">; readonly share: number },
): null | number {
  const years = sorted(
    futures.flatMap((future) => reachedIn(future, milestone, plan) ?? []),
  );
  return years[Math.ceil(share * futures.length) - 1] ?? null;
}

// The year a future first reaches the milestone in, the first its
// conditions all hold entering, whatever the years after it do, or
// null for a future that never reaches it over the plan's years. One
// reached at an age is reached in the same year of every future.
export function reachedIn(
  future: Future,
  milestone: Pick<MilestoneValues, "conditions">,
  plan: Pick<Plan, "from">,
): null | number {
  const at = future.measured.findIndex((measured) =>
    isReached(milestone, measured),
  );
  return at === -1 ? null : plan.from + at;
}

// What a run of futures comes to, read off the futures drawn, a run of
// none reading as nothing at all, and a future holding no years as
// holding nothing. The chance's range is Wilson's for a share of a
// count, whose half-width is 1.96 over one and 1.96² over the count,
// times the root of the share's variance over the count and 1.96² over
// four counts squared: unlike the normal range it does not shrink to
// nothing for a run that all lasted or none did, which a thousand
// futures cannot say for certain.
export function readingOf(futures: readonly Future[]): Reading {
  const run = futures.length;
  const lasted = futures.filter(({ fell }) => fell === null).length;
  const ranOutIn = sorted(futures.flatMap(({ ranOut }) => ranOut ?? []));
  const chance = lasted / Math.max(run, 1);
  return {
    chance,
    early: run - lasted - ranOutIn.length,
    firstRanOut: ranOutIn[0] ?? null,
    halfRanOut: ranOutIn[Math.floor((ranOutIn.length - 1) / 2)] ?? null,
    lasted,
    margin: run === 0 ? 0 : wilsonOf(chance, run),
    middle:
      sorted(futures.map(({ measured }) => measured.at(-1)?.worth ?? 0))[
        Math.floor(run / 2)
      ] ?? 0,
    ranOut: ranOutIn.length,
    run,
  };
}

// A run of futures year by year over the plan's years, from the one it
// starts in to the one it ends in. A year a future holds no point for,
// as a run of none holds none, reads as worth nothing.
export function yearsIn(
  futures: readonly Future[],
  plan: Pick<Plan, "from" | "years">,
): readonly FutureYear[] {
  return Array.from({ length: plan.years + 1 }, (_, offset) => {
    const year = plan.from + offset;
    const held = sorted(
      futures.map(({ measured }) => measured[offset]?.worth ?? 0),
    );
    const quarter = Math.floor(held.length / 4);
    const tenth = Math.floor(held.length / 10);
    return {
      bottomQuarter: held[quarter] ?? 0,
      bottomTenth: held[tenth] ?? 0,
      middle: held[Math.floor(held.length / 2)] ?? 0,
      outOfMoney: futures.filter(
        ({ ranOut }) => ranOut !== null && ranOut <= year,
      ).length,
      topQuarter: held[held.length - 1 - quarter] ?? 0,
      topTenth: held[held.length - 1 - tenth] ?? 0,
      year,
    };
  });
}

// A year of a projection as a milestone measures it, from the month it
// opens with: the age the plan's owner reaches in it, and every sum whole
// pounds of today's money: what every account comes to, which is the
// plan's net worth; what it owes, every debt's balance turned to a sum
// owed, nothing where it owes nothing rather than nothing with a sign;
// what it is worth less the property and vehicles; and twelve of what
// the expense lines running in the month cost it, read in today's
// money at how far prices have risen by then along the future's path.
function measuredOf(
  point: ProjectionPoint,
  at: Month,
  { accounts, plan, schedule }: Run,
): Measured {
  const sum = (held: readonly Account[]): number =>
    held.reduce((total, { id }) => total + balanceIn(point, id), 0);
  const worth = sum(accounts);
  return {
    age: ageIn(at.year, plan),
    debt: 0 - sum(accounts.filter(({ kind }) => kind === "debt")),
    expenses: Math.round(
      (12 *
        spentIn(schedule, { at, plan }).reduce(
          (total, { amount }) => total + amount,
          0,
        )) /
        pricesIn(plan, at),
    ),
    liquid: worth - sum(accounts.filter(isAsset)),
    worth,
  };
}

function sorted(values: readonly number[]): readonly number[] {
  return values.toSorted((first, second) => first - second);
}

// The half-width of Wilson's range for a share of a count, at 19 in 20.
function wilsonOf(share: number, count: number): number {
  const z = 1.96;
  return (
    (z / (1 + z ** 2 / count)) *
    Math.sqrt((share * (1 - share)) / count + z ** 2 / (4 * count ** 2))
  );
}
