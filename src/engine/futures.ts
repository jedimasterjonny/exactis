import type { Account } from "@/data/accounts";
import type { Path, Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";

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

// The seed every run of the futures starts from, so every run of a plan
// meets the same markets and a change in what they come to is the plan's.
const seed = 2026;

// What a substream's seed steps by from one future to the next: the
// golden ratio's share of 2^32, which spreads the futures' seeds as far
// from each other as any step can.
const step = 0x9e3779b9;

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
  const savings = accounts.filter(takesSpare);
  for (let future = 0; ; future += 1) {
    const path = pathOf(plan, spread, normalsFrom(seed + future * step));
    const points = project(accounts, schedule, { ...plan, path });
    yield {
      fell:
        points.find(({ early, uncovered }) => early > 0 || uncovered > 0)
          ?.year ?? null,
      ranOut: points.find(({ uncovered }) => uncovered > 0)?.year ?? null,
      savings: points.map((point) =>
        savings.reduce((sum, { id }) => sum + balanceIn(point, id), 0),
      ),
    };
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
