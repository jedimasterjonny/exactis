import type { Account } from "@/data/accounts";
import type {
  Marker,
  Measured,
  Milestone,
  MilestoneValues,
} from "@/data/milestones";
import type { Path, Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { ProjectionPoint, Run } from "@/engine/projection";

import {
  ageOf,
  isReached,
  markersOf,
  retiresOn,
  retiringAt,
} from "@/data/milestones";
import { ageIn, endAge, endYear } from "@/data/plan";
import {
  carriedBy,
  isShort,
  measuredOf,
  movedYears,
  project,
  retimed,
  retirementIn,
} from "@/engine/projection";
import { normalsFrom } from "@/lib/random";

// Where a run of futures breaks, as breaksIn finds it: the least cut to
// the spending nine in ten of them last with, and the earliest age nine
// in ten last retiring at, for a plan isAgeSearched searches the age of.
export interface Breaks {
  readonly age?: null | number;
  readonly cut: null | number;
}

// One future the plan was run over, as the chance of success reads it:
// the year it first fell short, by running out of money or by drawing a
// pension before the pension age, or null for a future that lasts; the
// year it first ran out, or null for one that never did, so a future
// kept going only by drawing a pension early is told from one that ran
// out; and each year of it measured as a milestone measures one,
// entering it and in today's money as the projection's points are: what the
// plan is worth, every account it holds less every debt it owes, a
// house or a car at its value less the loan on it and a pension at what
// drawing it would leave, as the dashboard counts net worth, and the
// rest beside it, the lines tied to retirement running as they did;
// and the year the plan's owner retired in, or null for a future in
// which their retirement on conditions is never reached. A future that falls short by drawing
// early has not lasted: the 55% the draw is charged keeps the plan
// going only on paper, which is why the projection marks it. Nor has
// one whose owner never retires, which lasts only by working to the
// end.
export interface Future {
  readonly fell: null | number;
  readonly measured: readonly Measured[];
  readonly ranOut: null | number;
  readonly retired: null | number;
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
// how many were run; how many lasted, ran out of money, were kept going
// only by drawing a pension early, or never retired, the four adding up
// to the run; the share that lasted, which is the chance, and how far
// the run alone may have it wrong, the half-width of the range 19 runs in 20
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
  readonly unretired: number;
}

// A future tried again in the search for where the run breaks: its
// spending cut by the points given, or its owner retiring at the age
// given.
export type Trial = { readonly age: number } | { readonly cut: number };

// How many futures a run draws: enough to pin the chance to within two
// points either way, and few enough that the run is a matter of
// seconds. The screen and the dashboard's tile draw the same run, so
// they say the same chance.
export const runLength = 1000;

// The seed a run of the futures starts from unless it is given another,
// so every run of a plan meets the same markets and a change in what
// they come to is the plan's.
export const defaultSeed = 2026;

// What a substream's seed steps by from one future to the next: the
// golden ratio's share of 2^32, which spreads the futures' seeds as far
// from each other as any step can.
const step = 0x9e3779b9;

// The deepest cut to the spending a future is searched over, in points
// either way: from half the spending planned to half as much again.
export const deepestCut = 50;

// The share of a run's futures the search for where it breaks finds the
// cut and the age for: nine in ten.
const lastingShare = 0.9;

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

// Where a run of the plan's futures breaks: the least cut to its
// spending, in whole points of the spending planned from 50 off to 50
// on, that nine in ten of the futures last with, and the earliest age
// nine in ten last retiring at, spending as planned. Lasting is as the
// chance counts it, never falling short and retiring. A cut scales
// every expense line paying no debt, in every year of the plan, those
// still saving among them; a line paying a debt is left as it is, since
// the loan says what it pays, as a move's mortgage line does. The ages
// run from the owner's as the plan opens to the plan's last, as the
// dashboard's retirement age does. Each future tried is tried as
// lastsTried tries one, given the future's place in the run, and the
// search runs as many tries at once as the lanes given. The search
// starts from the plan itself, the cut of nothing and the plan's own
// age, where each future's verdict is the run's as the chance read it,
// so none is tried there, and halves the values below it where nine in
// ten last there and above it where they do not, asking at each value
// whether nine in ten last. A future's verdict at a value is read off
// the values it was tried at before, where they settle it, since a
// future lasting with a cut is taken to last with any deeper one and
// one falling short to fall short with any shallower, and retiring
// later likewise; the rest are tried, only until enough have lasted or
// fallen short to settle it. A run lasting even on half as much again
// reads -50, one falling short even on half the spending null; one
// lasting even retiring as the plan opens reads that age, one falling
// short even working to the end null. A future need not last at every
// depth past a cut it lasts with: a move at an age, the pension age, or
// a retirement on conditions, which reads the year's expenses and so
// comes sooner on less, can leave a deeper cut short, and the verdict
// read off an earlier try is then wrong. So the figures are where nine
// in ten last as the tries read them; but since every verdict at the
// plan itself is the chance's own, the cut is nothing or less, and the
// age the plan's own or sooner, exactly where nine in ten futures last
// as the chance counts them. A plan isAgeSearched passes over has the
// spending alone searched.
export async function breaksIn(
  futures: readonly Future[],
  plan: Plan,
  {
    lanes,
    tried,
  }: {
    readonly lanes: number;
    readonly tried: (trial: Trial, future: number) => Promise<boolean>;
  },
): Promise<Breaks> {
  const lasting = futures.map(isLasting);
  const last = endAge(plan);
  const [cut, age] = await Promise.all([
    breakingAt(
      lasting,
      { above: deepestCut + 1, below: -deepestCut - 1, pivot: 0 },
      { lanes, tried: async (value, future) => tried({ cut: value }, future) },
    ),
    isAgeSearched(plan)
      ? breakingAt(
          lasting,
          {
            above: last + 1,
            below: ageIn(plan.from, plan) - 1,
            pivot: plan.retires,
          },
          {
            lanes,
            tried: async (value, future) => tried({ age: value }, future),
          },
        )
      : undefined,
  ]);
  const spending = cut > deepestCut ? null : cut;
  return age === undefined
    ? { cut: spending }
    : { age: age > last ? null : age, cut: spending };
}

// What a future is worth entering the plan's last year: the net worth
// its last year measures, or nothing for a future holding no years, as
// a run of none holds none. What the chance of success grades and
// reads the middle of, and what the dashboard's net worth tile reads
// of the plan at its own rates.
export function endWorthOf({ measured }: Pick<Future, "measured">): number {
  return measured.at(-1)?.worth ?? 0;
}

// A projection read as a future, over what it was run over: the year
// it first fell short, by running out or by drawing a pension early,
// the year it first ran out, the year its owner retired in, and each
// year measured from the month it opens with, the plan's month for the
// first, on the balances entering it as any move that year leaves
// them and over the lines as the run carried them once it had placed
// the retirement and made any move, each run carried once however many
// years it carries. What a future drawn is read as, and what the plan
// at its own rates is read as beside them.
export function futureOf(points: readonly ProjectionPoint[], run: Run): Future {
  const { fell, retired } = lastingOf(points, run);
  const ran = new Map<Run, Run>();
  return {
    fell,
    measured: movedYears(points, run).map(
      ({ allowances, at, balances, run: moved }) => {
        const carried = ran.get(moved) ?? carriedBy(moved, retired);
        ran.set(moved, carried);
        return measuredOf({ allowances, balances }, at, carried);
      },
    ),
    ranOut: points.find(({ uncovered }) => uncovered > 0)?.year ?? null,
    retired,
  };
}

// The futures of a plan, drawn one at a time without end from the place
// in the run given, its first unless another is, each the plan carried
// along its own path, drawn as pathOf draws one at the spread given.
// Future by future the draws come from a stream of their own, seeded by
// where the future falls in the run, counted on from the seed given, or
// from the one every run starts from, so a run of a thousand starts with
// the hundred a run of a hundred is, a run drawn from its fiftieth is
// the rest of the run drawn from its first, and the futures do not
// depend on how many are taken or by whom.
export function* futuresOf(
  accounts: readonly Account[],
  schedule: Schedule,
  {
    from = 0,
    plan,
    seed = defaultSeed,
    spread,
  }: {
    readonly from?: number;
    readonly plan: Plan;
    readonly seed?: number;
    readonly spread: Spread;
  },
): Generator<Future, never, undefined> {
  for (let future = from; ; future += 1) {
    const run = drawnOver(accounts, schedule, { future, plan, seed, spread });
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
// are divided instead, as are those of a plan whose owner retires on
// conditions its own rates never reach. Retirement falls where the plan
// at its own rates retires, which for one on conditions is where that
// run reached them. The fifths are worked out in whole years, so a
// fifth that lands on a year starts there rather than a rounding step
// after it. The worth at a retirement outside the plan's years is read
// at the nearer end of them.
export function gradingOf(projected: Future, plan: Plan): Grading {
  const end = endYear(plan);
  const retired = projected.retired ?? end;
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

// Whether a run is searched for the earliest age nine in ten of its
// futures last retiring at as well as for its cut: only where the
// plan's owner retires at an age not already behind them as the plan
// opens. One retiring on conditions has no age to try, since the run
// finds it, and one already retired has none to move.
export function isAgeSearched(plan: Plan): boolean {
  return (
    retiresOn(plan) === undefined && plan.retires >= ageIn(plan.from, plan)
  );
}

// Whether the future at the place given in a run of the plan's futures
// lasts tried as given: its own path, drawn as futuresOf draws it,
// projected again with the spending cut by every expense line paying no
// debt scaled by what the cut leaves of it, or as the run carried by
// retimed over the plan retiring its owner at the age, so each owner's
// State Pension is made again for it, and read for whether it lasts and
// nothing more.
export function lastsTried(
  accounts: readonly Account[],
  schedule: Schedule,
  {
    future,
    plan,
    seed = defaultSeed,
    spread,
    trial,
  }: {
    readonly future: number;
    readonly plan: Plan;
    readonly seed?: number;
    readonly spread: Spread;
    readonly trial: Trial;
  },
): boolean {
  const run = drawnOver(accounts, schedule, { future, plan, seed, spread });
  return lastsOver(
    "cut" in trial
      ? cutBy(run, trial.cut)
      : retimed(run, retiringAt(run.plan, trial.age)),
  );
}

// The milestones as a run of futures places them on the plan's years:
// those reached at an age where the plan lays them, retirement among
// them, as markersOf lays them out, and those reached when conditions
// hold each in the year by which half the futures have reached it, the
// median, left out where fewer ever do, as every one is over a run of
// none, retirement on conditions among them, by the year each future
// retired in. In the order their years come, two in the one year
// keeping the order they are given in, the plan's before the futures'.
export function markersIn(
  futures: readonly Future[],
  milestones: readonly Milestone[],
  plan: Plan,
): readonly Marker[] {
  const retired =
    retiresOn(plan) === undefined
      ? null
      : yearBy(
          futures.map(({ retired }) => retired),
          0.5,
        );
  const retirement: Marker[] =
    retired === null
      ? []
      : [{ id: "retirement", name: "Retirement", year: retired }];
  const reached = milestones.flatMap(({ conditions, id, name }) => {
    if (ageOf({ conditions }) !== undefined) {
      return [];
    }
    const year = reachedBy(futures, { conditions }, { plan, share: 0.5 });
    return year === null ? [] : [{ id, name, year }];
  });
  return [...markersOf(milestones, plan), ...retirement, ...reached].sort(
    (first, second) => first.year - second.year,
  );
}

// A run of futures graded on the lines given, counted. A future kept
// going only by drawing a pension early is graded by when it first did,
// as it is counted as falling short then, and one whose owner never
// retired fell short before retirement, and early.
export function outcomesOf(
  futures: readonly Future[],
  grading: Grading,
): Readonly<Record<Outcome, number>> {
  function outcomeOf({ fell, measured, retired }: Future): Outcome {
    if (fell === null && retired === null) {
      return "early";
    }
    if (fell === null) {
      const left = endWorthOf({ measured });
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
// about the plan's own, its return about the year's along a glide path
// and by the year's spread, and never about a path's, since a path is
// what is drawn here: one plus a year's figure is one plus the plan's
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
  plan: Pick<Plan, "byYear" | "inflation" | "rate" | "years">,
  spread: Spread,
  normal: () => number,
): Path {
  const drawn = (rate: number, by: number): number =>
    (1 + rate) * Math.exp(by * normal()) - 1;
  const years = Array.from({ length: plan.years }, (_, offset) => ({
    inflation: drawn(plan.inflation, spread.inflation),
    rate: drawn(
      plan.byYear?.[offset] ?? plan.rate,
      spread.byYear?.[offset] ?? spread.rate,
    ),
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
  return yearBy(
    futures.map((future) => reachedIn(future, milestone, plan)),
    share,
  );
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
  const unretired = futures.filter(
    ({ fell, retired }) => fell === null && retired === null,
  ).length;
  const lasted = futures.filter(({ fell }) => fell === null).length - unretired;
  const ranOutIn = sorted(futures.flatMap(({ ranOut }) => ranOut ?? []));
  const chance = lasted / Math.max(run, 1);
  return {
    chance,
    early: run - lasted - unretired - ranOutIn.length,
    firstRanOut: ranOutIn[0] ?? null,
    halfRanOut: ranOutIn[Math.floor((ranOutIn.length - 1) / 2)] ?? null,
    lasted,
    margin: run === 0 ? 0 : wilsonOf(chance, run),
    middle: sorted(futures.map(endWorthOf))[Math.floor(run / 2)] ?? 0,
    ranOut: ranOutIn.length,
    run,
    unretired,
  };
}

// The year by which the share given of a run has got somewhere, from the
// year each future got there in, or null for one that never did, and
// null where fewer than the share ever do.
export function yearBy(
  reached: readonly (null | number)[],
  share: number,
): null | number {
  const years = sorted(reached.flatMap((year) => year ?? []));
  return years[Math.ceil(share * reached.length) - 1] ?? null;
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

// A value between one falling short and one lasting, or an end past the
// range, neither tried, that lasts where the value before it falls
// short: the stretch between the two halved until they meet, keeping
// whichever end the value tried at each halving turns out to be.
async function boundary(
  fails: number,
  holds: number,
  lasts: (value: number) => Promise<boolean>,
): Promise<number> {
  let short = fails;
  let lasting = holds;
  while (lasting - short > 1) {
    const value = Math.floor((short + lasting) / 2);
    if (await lasts(value)) {
      lasting = value;
    } else {
      short = value;
    }
  }
  return lasting;
}

// The value nine in ten of a run's futures last at, as breaksIn finds
// it between the ends given, each past the range, from the value given
// that the run's verdicts were read at: each future kept between the
// most it fell short at and the least it lasted at, and at each value
// asked about only those it falls between tried, a lane at a time.
async function breakingAt(
  lasting: readonly boolean[],
  {
    above,
    below,
    pivot,
  }: { readonly above: number; readonly below: number; readonly pivot: number },
  {
    lanes,
    tried,
  }: {
    readonly lanes: number;
    readonly tried: (value: number, future: number) => Promise<boolean>;
  },
): Promise<number> {
  const needed = Math.ceil(lastingShare * lasting.length);
  const known = lasting.map((hasLasted, future) => ({
    fails: hasLasted ? below : pivot,
    future,
    holds: hasLasted ? pivot : above,
  }));
  async function isEnough(value: number): Promise<boolean> {
    const open = known.filter(
      ({ fails, holds }) => fails < value && value < holds,
    );
    let lasted = known.filter(({ holds }) => holds <= value).length;
    let left = open.length;
    const isSettled = (): boolean => lasted >= needed || lasted + left < needed;
    async function lane(): Promise<void> {
      for (let next = open.shift(); next !== undefined; next = open.shift()) {
        if (isSettled()) {
          return;
        }
        if (await tried(value, next.future)) {
          next.holds = value;
          lasted += 1;
        } else {
          next.fails = value;
        }
        left -= 1;
      }
    }
    await Promise.all(Array.from({ length: lanes }, lane));
    return lasted >= needed;
  }
  return lasting.filter(Boolean).length >= needed
    ? boundary(below, pivot, isEnough)
    : boundary(pivot, above, isEnough);
}

// The run with its spending cut by the points given, every expense line
// paying no debt scaled by what the cut leaves of it.
function cutBy(run: Run, cut: number): Run {
  return {
    ...run,
    schedule: {
      ...run.schedule,
      expenses: run.schedule.expenses.map((line) =>
        line.pays === undefined
          ? { ...line, amount: line.amount * (1 - cut / 100) }
          : line,
      ),
    },
  };
}

// The run of the future at the place given in a run of the plan's
// futures: the plan carried along the path drawn from that future's
// own stream.
function drawnOver(
  accounts: readonly Account[],
  schedule: Schedule,
  {
    future,
    plan,
    seed,
    spread,
  }: {
    readonly future: number;
    readonly plan: Plan;
    readonly seed: number;
    readonly spread: Spread;
  },
): Run {
  const path = pathOf(plan, spread, normalsFrom(seed + future * step));
  return { accounts, plan: { ...plan, path }, schedule };
}

// Whether a future lasted, as the chance counts it: it never fell short,
// and its owner retired.
function isLasting({
  fell,
  retired,
}: Pick<Future, "fell" | "retired">): boolean {
  return fell === null && retired !== null;
}

// What decides whether a projection lasted, as futureOf reads it: the
// year it first fell short, by running out or by drawing a pension
// early, and the year its owner retired in, over what it was run over.
function lastingOf(
  points: readonly ProjectionPoint[],
  run: Run,
): Pick<Future, "fell" | "retired"> {
  return {
    fell: points.find(isShort)?.year ?? null,
    retired: retirementIn(points, run),
  };
}

// Whether a run lasts, projected as a future of it is and read as the
// chance reads one.
function lastsOver(run: Run): boolean {
  return isLasting(
    lastingOf(project(run.accounts, run.schedule, run.plan), run),
  );
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
