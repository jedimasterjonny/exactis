import type { Account } from "@/data/accounts";
import type { Path, Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { ProjectionPoint } from "@/engine/projection";

import { takesSpare } from "@/data/accounts";
import { balanceIn, project } from "@/engine/projection";
import { normalsFrom } from "@/lib/random";

// One future the plan was run over, as the chance of success reads it:
// the year it first fell short, by running out of money or by drawing a
// pension before the pension age, or null for a future that lasts; the
// year it first ran out, or null for one that never did, so a future
// kept going only by drawing a pension early is told from one that ran
// out; and what the savings it draws on hold entering each year of the
// plan, cash, the ISAs and the pensions, in today's money as the
// projection's points are. A future that falls short by drawing early
// has not lasted: the 55% the draw is charged keeps the plan going only
// on paper, which is why the projection marks it.
export interface Future {
  readonly fell: null | number;
  readonly ranOut: null | number;
  readonly savings: readonly number[];
}

// A year of a run of futures, as the chance of success lays the run on
// the plan's years: how many futures are still lasting as it opens, how
// many first fall short in it, by running out or drawing a pension
// early, and what the futures' savings hold as it opens, the poor one a
// tenth of them hold less than, the middle one and the good one a tenth
// hold more than, counted the same from either end, a future run out
// holding nothing.
export interface FutureYear {
  readonly fell: number;
  readonly good: number;
  readonly lasting: number;
  readonly middle: number;
  readonly poor: number;
  readonly year: number;
}

// What a run of futures comes to, as the chance of success reads it:
// how many were run; how many lasted, ran out of money, or were kept
// going only by drawing a pension early, the three adding up to the
// run; the share that lasted, which is the chance, and how far the run
// alone may have it wrong, the half-width of the range 19 runs in 20
// would put it in, never nothing; the year the first ran out and the year by which
// half of those had, none where none did; the year by which a tenth of
// the run had fallen short either way, none where fewer did; and what
// the middle future's savings hold entering the plan's last year, half
// holding less and half more, a future run out holding nothing.
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
  readonly tenthFell: null | number;
}

// The seed every run of the futures starts from, so every run of a plan
// meets the same markets and a change in what they come to is the plan's.
const seed = 2026;

// What a substream's seed steps by from one future to the next: the
// golden ratio's share of 2^32, which spreads the futures' seeds as far
// from each other as any step can.
const step = 0x9e3779b9;

// A projection read as a future, over the accounts it was run over: the
// year it first fell short, by running out or by drawing a pension
// early, the year it first ran out, and what the savings hold entering
// each year. What a future drawn is read as, and what the plan at its
// own rates is read as beside them.
export function futureOf(
  points: readonly ProjectionPoint[],
  accounts: readonly Account[],
): Future {
  const savings = accounts.filter(takesSpare);
  return {
    fell:
      points.find(({ early, uncovered }) => early > 0 || uncovered > 0)?.year ??
      null,
    ranOut: points.find(({ uncovered }) => uncovered > 0)?.year ?? null,
    savings: points.map((point) =>
      savings.reduce((sum, { id }) => sum + balanceIn(point, id), 0),
    ),
  };
}

// The futures of a plan, drawn one at a time without end, each the plan
// carried along its own path, drawn as pathOf draws one at the spread
// given. Future by future the draws come from a stream of their own,
// seeded by where the future falls in the run, so a run of a thousand
// starts with the hundred a run of a hundred is, and the futures do not
// depend on how many are taken or by whom.
export function* futuresOf(
  accounts: readonly Account[],
  schedule: Schedule,
  { plan, spread }: { readonly plan: Plan; readonly spread: Spread },
): Generator<Future, never, undefined> {
  for (let future = 0; ; future += 1) {
    const path = pathOf(plan, spread, normalsFrom(seed + future * step));
    yield futureOf(project(accounts, schedule, { ...plan, path }), accounts);
  }
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
  const fellIn = sorted(futures.flatMap(({ fell }) => fell ?? []));
  const chance = lasted / Math.max(run, 1);
  return {
    chance,
    early: run - lasted - ranOutIn.length,
    firstRanOut: ranOutIn[0] ?? null,
    halfRanOut: ranOutIn[Math.floor((ranOutIn.length - 1) / 2)] ?? null,
    lasted,
    margin: run === 0 ? 0 : wilsonOf(chance, run),
    middle:
      sorted(futures.map(({ savings }) => savings.at(-1) ?? 0))[
        Math.floor(run / 2)
      ] ?? 0,
    ranOut: ranOutIn.length,
    run,
    tenthFell: fellIn[Math.ceil(run / 10) - 1] ?? null,
  };
}

// A year of a run of futures, each future's savings read off the point
// for the year. A year a future holds no point for, as a run of none
// holds none, reads as holding nothing.
export function yearIn(
  futures: readonly Future[],
  plan: Pick<Plan, "from">,
  year: number,
): FutureYear {
  const held = sorted(
    futures.map(({ savings }) => savings[year - plan.from] ?? 0),
  );
  const tenth = Math.floor(held.length / 10);
  return {
    fell: futures.filter(({ fell }) => fell === year).length,
    good: held[held.length - 1 - tenth] ?? 0,
    lasting: futures.filter(({ fell }) => fell === null || fell >= year).length,
    middle: held[Math.floor(held.length / 2)] ?? 0,
    poor: held[tenth] ?? 0,
    year,
  };
}

// A run of futures year by year over the plan's years, from the one it
// starts in to the one it ends in.
export function yearsIn(
  futures: readonly Future[],
  plan: Pick<Plan, "from" | "years">,
): readonly FutureYear[] {
  return Array.from({ length: plan.years + 1 }, (_, offset) =>
    yearIn(futures, plan, plan.from + offset),
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
