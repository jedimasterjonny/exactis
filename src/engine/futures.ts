import type { Path, Plan } from "@/data/plan";

// How far a year strays from the plan's rates, as the futures are drawn:
// the standard deviation of the logarithm of one plus the plan rate's
// return in a year, and of one plus prices' rise. The rate's is the
// portfolio's as a whole, stocks and bonds in the split the plan holds,
// since every account on the plan rate is carried at the one rate.
export interface Spread {
  readonly inflation: number;
  readonly rate: number;
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
