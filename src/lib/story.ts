import type { Milestone } from "@/data/milestones";
import type { Path, Plan } from "@/data/plan";
import type { Future, Outcome } from "@/engine/futures";

import { ageOf, ownerNamed, yearOf } from "@/data/milestones";
import { ageIn, endAge, endYear, pricesIn } from "@/data/plan";
import { endWorthOf, reachedIn } from "@/engine/futures";
import { counted, formatCount } from "@/lib/count";
import {
  formatGbp,
  formatPercent,
  formatSignedGbp,
  formatWholePercent,
} from "@/lib/money";
import { lastingOutcomes } from "@/lib/outcomes";

// One future told: what it came to, in a sentence; what its portfolio
// returned and its prices rose a year, beside the plan's own rates, in
// another; its years worth telling, in year order; the years its
// milestones and its retirement fall in, named, for its chart to rule;
// and what its portfolio returned in each year of the plan, as the plan
// lives it.
export interface Story {
  readonly chapters: readonly Chapter[];
  readonly headline: string;
  readonly lede: string;
  readonly marks: readonly Mark[];
  readonly returns: readonly number[];
}

// A year of a future worth telling: the year, what happened in it, in a
// sentence that stands alone, what else is worth saying of it, if
// anything, and whether it went the plan's way, against it or neither.
interface Chapter {
  readonly body?: string;
  readonly title: string;
  readonly tone: Tone;
  readonly year: number;
}

// A year a chart rules, named for what falls in it.
interface Mark {
  readonly name: string;
  readonly year: number;
}

// What a future is read against: what it is graded as, where it falls
// in its run, counted from nothing, the markets it was drawn along, a
// return and an inflation for each of its years with the return's
// months, the plan's milestones, the plan, and the plan at its own
// rates read as a future.
interface Told {
  readonly markets: Required<Path>;
  readonly milestones: readonly Milestone[];
  readonly outcome: Outcome;
  readonly place: number;
  readonly plan: Plan;
  readonly projected: Future;
}

type Tone = "caution" | "plain" | "positive";

// How many years from a retirement are read as the ones that decide it.
const firstYears = 5;

// The lede while the future to tell is not yet known: the plan's own
// rates over its years, as the lede sets the future's beside them, and
// an ellipsis for each of the future's own.
export function heldLede(plan: Plan): string {
  return `Its portfolio returns …\u00a0a\u00a0year and its prices rise …, against ${formatPercent(yearly(plannedOf(plan), 0, plan))} and ${formatPercent(plan.inflation)} at the plan's own rates.`;
}

// One future of a run told as a life: every figure off the future, the
// markets drawn for it and the plan at its own rates, so nothing here
// is a second reading of the model. Each year's return is read as the
// plan lives it, a plan opening after January living its first year
// over the months it holds of it, as the run carries it (The run, in
// the engine's README), and each figure a year is what the months
// lived compound to a year. The headline says
// what it came to as the chance counts it. The lede sets its portfolio
// and its prices beside the plan's own rates, over the years its
// savings last. Then the years: each milestone in the year this future
// reaches it, from the plan's first year to its last, one reached at an
// age in the year whoever's age it is reaches it and one reached on
// conditions set against the year the plan's own rates reach it; the
// retirement, from the plan's first year to the year before its last,
// which the run does not carry, named for the plan's owner where
// another owner retires at an age of their own, with what the plan is
// worth beside what its own rates make it then, and what the portfolio
// returns over the five years from it, or as many as the savings last,
// since the same returns in another order end elsewhere and those are
// the years that decide, opening on its being the most the future is
// ever worth where it is; the year the plan is worth the most, where
// that is neither its first nor its last nor the retirement's; the
// portfolio's worst year, where one falls, and its best, both among the
// years the savings last, and among the whole years where the plan
// holds only part of its first; the year a pension is first drawn early,
// where the savings last past it; the year they run out; and for a
// future that never fell short, the end, with what it leaves beside
// what the plan's own rates leave, a good end where the future lasted
// as the chance counts it and a plain one where it worked to the end.
// Years in order, and those sharing a year in the order given here.
export function storyOf(
  future: Future,
  { markets, milestones, outcome, place, plan, projected }: Told,
): Story {
  const end = endYear(plan);
  const lasted = (future.ranOut ?? end) - plan.from;
  const span = Math.max(lasted, 1);
  const returns = markets.rate.map((rate, year) =>
    year === 0 && plan.month > 0
      ? Math.expm1(
          markets.months
            .slice(plan.month, 12)
            .reduce((sum, month) => sum + Math.log1p(month), 0),
        )
      : rate,
  );
  const worthIn = ({ measured }: Future, year: number): number =>
    measured[year - plan.from]?.worth ?? 0;
  const against = (year: number): string =>
    `${formatSignedGbp(worthIn(future, year) - worthIn(projected, year))} against the plan's own rates.`;
  const reaching = milestones.flatMap((milestone) =>
    reached(milestone, future, { plan, projected }),
  );
  const most = peak(future, plan);
  const retiring = retirement(future, {
    against,
    isMost: most.some(({ year }) => year === future.retired),
    lasted,
    plan,
    returns,
    worthIn,
  });
  const isLasting = lastingOutcomes.some((lasting) => lasting === outcome);
  const chapters: Chapter[] = [
    ...reaching,
    ...retiring,
    ...most.filter(({ year }) => year !== future.retired),
    ...extremes(returns.slice(0, span), plan),
    ...shortfall(future, end),
    ...(future.fell === null
      ? [
          {
            body: against(end),
            title: `The plan ends${isLasting ? "" : " without retiring"}, leaving ${formatGbp(endWorthOf(future))}`,
            tone: isLasting ? ("positive" as const) : ("plain" as const),
            year: end,
          },
        ]
      : []),
  ];
  const prices =
    pricesIn(
      { ...plan, path: markets },
      { month: 0, year: plan.from + span },
    ) **
      (12 / (12 * span - plan.month)) -
    1;
  return {
    chapters: chapters.toSorted((first, second) => first.year - second.year),
    headline: `Future\u00a0${formatCount(place + 1)} ${cameTo(future, plan)}.`,
    lede: `Its portfolio returns ${formatPercent(yearly(returns.slice(0, span), 0, plan))}\u00a0a\u00a0year and its prices rise ${formatPercent(prices)}, against ${formatPercent(yearly(plannedOf(plan).slice(0, span), 0, plan))} and ${formatPercent(plan.inflation)} at the plan's own rates.`,
    marks: [
      ...reaching.map(({ title, year }) => ({ name: title, year })),
      ...retiring.map(({ year }) => ({ name: "Retirement", year })),
    ],
    returns,
  };
}

// The year a milestone is reached in set against the year the plan's own
// rates reach it, null where they never do.
function againstPlanned(year: number, planned: null | number): string {
  if (planned === null) {
    return "The plan's own rates never reach it.";
  }
  if (year === planned) {
    return "The year the plan's own rates reach it.";
  }
  return `${counted(Math.abs(year - planned), "year")} ${year < planned ? "sooner" : "later"} than at the plan's own rates.`;
}

// What a future came to, as the chance counts it, to follow its name.
function cameTo(
  { fell, measured, ranOut, retired }: Future,
  plan: Plan,
): string {
  if (ranOut !== null) {
    return `runs out at\u00a0${String(ageIn(ranOut, plan))}`;
  }
  if (fell !== null) {
    return `lasts to\u00a0${String(endAge(plan))} only by drawing a pension early, at\u00a0${String(ageIn(fell, plan))}`;
  }
  if (retired === null) {
    return `never reaches the conditions it retires on`;
  }
  return `lasts to\u00a0${String(endAge(plan))} and leaves ${formatGbp(endWorthOf({ measured }))}`;
}

// The portfolio's worst year, where it is a fall, and its best, where
// it is a rise and another year, among the whole years: a first year
// the plan holds only part of is not ranked against them, since a few
// months stray less than a year does.
function extremes(rates: readonly number[], plan: Plan): Chapter[] {
  const whole = plan.month > 0 ? 1 : 0;
  const ranked = rates.slice(whole);
  const fall = Math.min(...ranked);
  const rise = Math.max(...ranked);
  const worst = whole + ranked.indexOf(fall);
  const best = whole + ranked.indexOf(rise);
  return [
    ...(fall < 0
      ? [
          {
            body: "Its worst year.",
            title: `The portfolio falls ${formatWholePercent(-fall)}`,
            tone: "caution" as const,
            year: plan.from + worst,
          },
        ]
      : []),
    ...(rise > 0 && best !== worst
      ? [
          {
            body: "Its best year.",
            title: `The portfolio rises ${formatWholePercent(rise)}`,
            tone: "positive" as const,
            year: plan.from + best,
          },
        ]
      : []),
  ];
}

// The year the plan is worth the most, where it is neither where the
// plan starts, which is today, nor where it ends, which the end says.
function peak({ measured }: Future, plan: Plan): Chapter[] {
  const worths = measured.map(({ worth }) => worth);
  const most = Math.max(...worths);
  const at = worths.indexOf(most);
  return at <= 0 || at === worths.length - 1
    ? []
    : [
        {
          title: `At its most, worth ${formatGbp(most)}`,
          tone: "plain",
          year: plan.from + at,
        },
      ];
}

// What the plan rate comes to in each year of the plan at its own
// rates, as the plan lives it: its own, or its glide path's, the first
// year's over the months the plan holds of it.
function plannedOf(plan: Plan): number[] {
  return Array.from({ length: plan.years }, (_, year) => {
    const rate = plan.byYear?.[year] ?? plan.rate;
    return year === 0 ? (1 + rate) ** ((12 - plan.month) / 12) - 1 : rate;
  });
}

// A milestone in the year the future reaches it, from the plan's first
// year to its last, or nothing where it never does: one reached at an
// age named alone, in the year whoever's age it is reaches it, and one
// reached on conditions set against the year the plan's own rates
// reach it.
function reached(
  milestone: Milestone,
  future: Future,
  { plan, projected }: Pick<Told, "plan" | "projected">,
): Chapter[] {
  if (ageOf(milestone) !== undefined) {
    const year = yearOf(milestone, plan);
    return year === undefined || year < plan.from || year > endYear(plan)
      ? []
      : [{ title: milestone.name, tone: "plain", year }];
  }
  const year = reachedIn(future, milestone, plan);
  if (year === null) {
    return [];
  }
  return [
    {
      body: againstPlanned(year, reachedIn(projected, milestone, plan)),
      title: milestone.name,
      tone: "plain",
      year,
    },
  ];
}

// The retirement, in the year the future's owner retires, from the
// plan's first year to the year before its last, or nothing otherwise:
// what the plan is worth then, beside what its own rates make it, and
// what the portfolio returns a year over the years from it, five or as
// many as the savings last, said where they last any.
function retirement(
  future: Future,
  {
    against,
    isMost,
    lasted,
    plan,
    returns,
    worthIn,
  }: {
    readonly against: (year: number) => string;
    readonly isMost: boolean;
    readonly lasted: number;
    readonly plan: Plan;
    readonly returns: readonly number[];
    readonly worthIn: (future: Future, year: number) => number;
  },
): Chapter[] {
  const { retired } = future;
  if (retired === null || retired < plan.from || retired >= endYear(plan)) {
    return [];
  }
  const at = retired - plan.from;
  const first = returns.slice(at, Math.min(at + firstYears, lasted));
  const returned = formatPercent(yearly(first, at, plan));
  const [named] = ownerNamed(plan);
  const who = named === undefined ? "Retires" : `${named} retires`;
  return [
    {
      body: [
        ...(isMost ? ["The most this future is ever worth."] : []),
        against(retired),
        ...(first.length === 0
          ? []
          : [
              first.length === 1
                ? `Its portfolio returns ${returned} over the year from here.`
                : `Its portfolio returns ${returned}\u00a0a\u00a0year over the ${String(first.length)} years from here.`,
            ]),
      ].join(" "),
      title: `${who}, worth ${formatGbp(worthIn(future, retired))}`,
      tone: "plain",
      year: retired,
    },
  ];
}

// Where a future fell short: the year a pension is first drawn early,
// where the savings last past it, and the year they run out, with how
// long before the plan's end that is.
function shortfall({ fell, ranOut }: Future, end: number): Chapter[] {
  return [
    ...(fell !== null && fell !== ranOut
      ? [
          {
            title: "A pension is drawn early to keep going",
            tone: "caution" as const,
            year: fell,
          },
        ]
      : []),
    ...(ranOut === null
      ? []
      : [
          {
            body: `${counted(end - ranOut, "year")} before the plan ends.`,
            title: "The savings run out",
            tone: "caution" as const,
            year: ranOut,
          },
        ]),
  ];
}

// The rate a stretch of the plan's years compounds to a year, from what
// each came to as the plan lives it, the stretch starting the given
// number of years in: over the months it holds, so a stretch from the
// plan's first year counts that year for the months the plan holds of
// it. Nothing over no years.
function yearly(lived: readonly number[], at: number, plan: Plan): number {
  const months = 12 * lived.length - (at === 0 ? plan.month : 0);
  return Math.expm1(
    (12 * lived.reduce((sum, rate) => sum + Math.log1p(rate), 0)) /
      Math.max(months, 1),
  );
}
