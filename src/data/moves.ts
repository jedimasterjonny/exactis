import type { Sources } from "@/data/household";

import { derivedSet } from "@/data/cma";
import { resultsOf } from "@/data/rates";

// The sources the CMA-derived rates rested on some while ago, to say
// what has moved them since, and the day the household stood so.
export interface Before {
  readonly savedOn: string;
  readonly sources: Sources;
}

// What moved the CMA-derived rates from one household's sources to
// another's: the figures they came to before and after, and a step for
// each source that changed, or for two or more taken together, in the
// order they are taken, with how far it moved each figure. The steps
// add up to the move in all.
export interface Moves {
  readonly before: Standing;
  readonly now: Standing;
  readonly steps: readonly Step[];
}

// A source the CMA-derived rates rest on, by what names it.
export type Source = "cma" | "curve" | "deductions" | "targets";

// The figures the plan runs on that a change of source can move: the
// plan rate, the inflation, and the plan rate over it, each a fraction
// a year.
interface Standing {
  readonly inflation: number;
  readonly planRate: number;
  readonly real: number;
}

// The sources a step took, one or more, and how far it moved each
// figure.
interface Step {
  readonly by: Standing;
  readonly sources: readonly Source[];
}

// Each source as the steps take it: what of it is compared, so a change
// that could move no rate is not counted as one, and how a set of
// sources takes it from another. The CMA is compared by the classes its
// latest vintage prices, by name, since neither the previous vintage
// nor the day it was published moves a rate; the curve whole, since the
// day it stood on sets how much of RPI's wedge comes off; the target
// allocation by each category's share and the class it is mapped onto,
// by id, since neither an import's day, nor a name, nor the order a
// mapping was made in moves a rate; and the fees and yield without the
// day they were set. The curve moves the inflation, and so the real
// return, and leaves the plan rate, which is nominal, where it was; the
// yield moves nothing but the split of stocks' return, so a step of
// fees and yield is the fees'.
const steps: readonly {
  readonly read: (sources: Sources) => unknown;
  readonly source: Source;
  readonly take: (into: Sources, from: Sources) => Sources;
}[] = [
  {
    read: ({ cma }) =>
      [...(cma?.latest.assets ?? [])].sort((one, other) =>
        one.name.localeCompare(other.name),
      ),
    source: "cma",
    take: (into, { cma }) => ({ ...into, cma }),
  },
  {
    read: ({ curve }) => curve,
    source: "curve",
    take: (into, { curve }) => ({ ...into, curve }),
  },
  {
    read: ({ mappings, targets }) => ({
      classes: [...mappings]
        .sort((one, other) => one.category.localeCompare(other.category))
        .map(({ asset, category }) => [category, asset]),
      shares: [...(targets?.categories ?? [])]
        .sort((one, other) => one.id.localeCompare(other.id))
        .map(({ id, share }) => [id, share]),
    }),
    source: "targets",
    take: (into, { mappings, targets }) => ({ ...into, mappings, targets }),
  },
  {
    read: ({ deductions: { dividends, fees } }) => ({ dividends, fees }),
    source: "deductions",
    take: (into, { deductions }) => ({ ...into, deductions }),
  },
];

// What moved the CMA-derived rates from the sources before to the
// sources now: each source that changed taken in turn, the CMA's, the
// curve, the target allocation and the fees and yield, and what each
// moved over what the ones taken before it had made. Taken in another
// order a source's share of the move could differ, where two moved
// together, but the shares would still add up to the move in all. A
// source that derives no rates taken alone, as a vintage no longer
// pricing a class the categories were mapped onto before they were
// mapped again, is taken together with the ones after it until they
// derive some, and the step names them all. There is nothing to say
// where the sources before derive no rates, as before a CMA is pulled,
// or the sources now.
export function movesBetween(before: Sources, now: Sources): Moves | null {
  const first = standingOf(before);
  if (first === null) {
    return null;
  }
  const taken: Step[] = [];
  let pending: Source[] = [];
  let sources = before;
  let standing = first;
  for (const { read, source, take } of steps) {
    if (JSON.stringify(read(sources)) !== JSON.stringify(read(now))) {
      sources = take(sources, now);
      pending = [...pending, source];
      const next = standingOf(sources);
      if (next !== null) {
        taken.push({ by: apart(next, standing), sources: pending });
        pending = [];
        standing = next;
      }
    }
  }
  return pending.length === 0
    ? { before: first, now: standing, steps: taken }
    : null;
}

// How far one standing is from another, figure by figure.
function apart(to: Standing, from: Standing): Standing {
  return {
    inflation: to.inflation - from.inflation,
    planRate: to.planRate - from.planRate,
    real: to.real - from.real,
  };
}

// What a set of sources comes to, or null while they derive no rates.
function standingOf(sources: Sources): null | Standing {
  const derived = derivedSet(sources);
  if ("short" in derived) {
    return null;
  }
  const { nominal, real } = resultsOf(derived.rates, derived.allocation);
  return {
    inflation: derived.rates.inflation,
    planRate: nominal.portfolio,
    real: real.portfolio,
  };
}
