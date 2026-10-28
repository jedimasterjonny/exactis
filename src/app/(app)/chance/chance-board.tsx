"use client";

import type { JSX } from "react";

import { useMemo } from "react";

import type { Account } from "@/data/accounts";
import type { Milestone } from "@/data/milestones";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";

import { Caution } from "@/components/app/molecules/caution";
import { FuturesCount } from "@/components/app/organisms/futures-count";
import { FuturesDrawn } from "@/components/app/organisms/futures-drawn";
import { FuturesFan } from "@/components/app/organisms/futures-fan";
import { FuturesOutcomes } from "@/components/app/organisms/futures-outcomes";
import { MilestoneSpreads } from "@/components/app/organisms/milestone-spreads";
import { ageIn } from "@/data/plan";
import {
  futureOf,
  gradingOf,
  outcomesOf,
  readingOf,
  runLength,
} from "@/engine/futures";
import { project } from "@/engine/projection";

interface ChanceBoardProps {
  readonly accounts: readonly Account[];
  readonly futures: readonly Future[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly spread: Spread;
}

// What the plan's futures come to, as many as have come in: graded,
// the run fanned over the plan's years, every milestone and when the
// run reaches it, and the count beneath them. The screen reads the run
// and hands the futures down, since its header reads them too, so the
// board reads none of its own. The plan at its own rates is read as a
// future, for what it is worth at the end beside the middle future and
// as its owner retires, which the futures that last are graded against.
// A plan that falls short even at its own rates is said to before what
// the futures come to, since the chance then reads how often the
// markets would carry a plan that does not work as it stands. What the
// run was drawn from closes the screen.
export function ChanceBoard({
  accounts,
  futures,
  milestones,
  plan,
  schedule,
  spread,
}: ChanceBoardProps): JSX.Element {
  const reading = readingOf(futures);
  const asProjected = useMemo(
    () =>
      futureOf(project(accounts, schedule, plan), { accounts, plan, schedule }),
    [accounts, plan, schedule],
  );
  const projected = readingOf([asProjected]);
  const grading = useMemo(
    () => gradingOf(asProjected, plan),
    [asProjected, plan],
  );
  return (
    <>
      <AtItsRates future={asProjected} plan={plan} />
      <FuturesOutcomes
        count={runLength}
        grading={grading}
        outcomes={outcomesOf(futures, grading)}
        plan={plan}
        reading={reading}
      />
      <FuturesFan futures={futures} milestones={milestones} plan={plan} />
      <MilestoneSpreads
        futures={futures}
        milestones={milestones}
        plan={plan}
        schedule={schedule}
      />
      <FuturesCount
        count={runLength}
        plan={plan}
        projected={projected.middle}
        reading={reading}
      />
      <FuturesDrawn plan={plan} spread={spread} />
    </>
  );
}

// What the plan comes to at its own rates, where it falls short at them:
// running out, said with the year it does, lasting only by drawing a
// pension before it can be drawn, or never reaching the conditions its
// owner retires on, each of which the futures count as falling short,
// said so the chance is not read as the markets' doing alone. Nothing
// where the plan lasts at its own rates.
function AtItsRates({
  future,
  plan,
}: {
  readonly future: Future;
  readonly plan: Plan;
}): JSX.Element | null {
  if (future.ranOut !== null) {
    return (
      <Caution
        title={`The plan runs out at ${String(ageIn(future.ranOut, plan))} even at its own rates`}
      />
    );
  }
  if (future.fell !== null) {
    return (
      <Caution
        title={`The plan lasts at its own rates only by drawing a pension early, at ${String(ageIn(future.fell, plan))}`}
      />
    );
  }
  if (future.retired === null) {
    return (
      <Caution title="The plan never reaches its retirement's conditions at its own rates" />
    );
  }
  return null;
}
