"use client";

import type { JSX } from "react";

import { Goal as GoalIcon } from "lucide-react";

import type { Account } from "@/data/accounts";
import type { Shortfall } from "@/data/cma";
import type { Goal } from "@/data/goals";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";

import { StatTile } from "@/components/app/molecules/stat-tile";
import { takesSpare } from "@/data/accounts";
import { ageIn, endAge } from "@/data/plan";
import { reachedBy, reachedIn, readingOf, runLength } from "@/engine/futures";
import { useFutures } from "@/hooks/use-futures";
import { formatCount } from "@/lib/count";
import { formatWholePercent } from "@/lib/money";

interface ChanceTileProps {
  readonly accounts: readonly Account[];
  readonly goals: readonly Goal[];
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly spread: Shortfall | Spread;
}

// What the tile is called, on the dashboard as on the screen it reads.
const label = "Chance of success";

// The dashboard's chance of success: the share of the plan's futures
// that last, drawn as the dashboard opens over the same run the chance
// of success draws and written as it writes it, so the two say the
// same, with how many futures and the age they last to beneath it;
// and beside it a tile a goal, the age reached in the year by which
// half the futures have reached it, the median alone, since a tile is
// one figure and the spread either side is read on the chance of
// success. While they are drawn, how many have been; and a dash, saying
// why, while the plan has no spread to draw them at or no savings for
// them to grow. It reads the plan as the store holds it, so an age
// being dragged on the chart is drawn for once it is saved.
export function ChanceTile({
  accounts,
  goals,
  plan,
  schedule,
  spread,
}: ChanceTileProps): JSX.Element {
  if ("short" in spread) {
    return <Unrun caption="No spread to draw the futures from" goals={goals} />;
  }
  if (!accounts.some(takesSpare)) {
    return <Unrun caption="No savings for the futures to grow" goals={goals} />;
  }
  return (
    <Drawn
      accounts={accounts}
      goals={goals}
      plan={plan}
      schedule={schedule}
      spread={spread}
    />
  );
}

// The tiles over the futures as they are drawn.
function Drawn({
  accounts,
  goals,
  plan,
  schedule,
  spread,
}: Omit<ChanceTileProps, "spread"> & { readonly spread: Spread }): JSX.Element {
  const { futures, isDone } = useFutures(accounts, schedule, {
    count: runLength,
    plan,
    spread,
  });
  return (
    <>
      {isDone ? (
        <StatTile
          caption={`Of ${formatCount(runLength)} futures, lasting to ${String(endAge(plan))}`}
          label={label}
          value={formatWholePercent(readingOf(futures).chance)}
        />
      ) : (
        <StatTile
          caption={`Drawing ${formatCount(futures.length)} of ${formatCount(runLength)} futures…`}
          label={label}
          value="…"
        />
      )}
      {goals.map((goal) => (
        <GoalTile
          futures={futures}
          goal={goal}
          isDone={isDone}
          key={goal.id}
          plan={plan}
        />
      ))}
    </>
  );
}

// A goal's tile: the age reached in the year by which half the futures
// have reached it, the year beneath, or a dash with the share of the
// run that reaches it at all where fewer than half ever do; and an
// ellipsis while the futures are drawn, as the chance's.
function GoalTile({
  futures,
  goal,
  isDone,
  plan,
}: {
  readonly futures: readonly Future[];
  readonly goal: Goal;
  readonly isDone: boolean;
  readonly plan: Plan;
}): JSX.Element {
  if (!isDone) {
    return (
      <StatTile
        caption="Drawing the futures…"
        icon={GoalIcon}
        label={goal.name}
        value="…"
      />
    );
  }
  const median = reachedBy(futures, goal, { plan, share: 0.5 });
  if (median === null) {
    const reached = futures.filter(
      (future) => reachedIn(future, goal, plan) !== null,
    ).length;
    return (
      <StatTile
        caption={`Reached in ${formatWholePercent(reached / runLength)} of ${formatCount(runLength)} futures`}
        icon={GoalIcon}
        label={goal.name}
        value="—"
      />
    );
  }
  return (
    <StatTile
      caption={`Median of ${formatCount(runLength)} futures · ${String(median)}`}
      icon={GoalIcon}
      label={goal.name}
      unit="yrs"
      value={String(ageIn(median, plan))}
    />
  );
}

// The tiles with nothing to draw, each dashed and saying why.
function Unrun({
  caption,
  goals,
}: {
  readonly caption: string;
  readonly goals: readonly Goal[];
}): JSX.Element {
  return (
    <>
      <StatTile caption={caption} label={label} value="—" />
      {goals.map((goal) => (
        <StatTile
          caption={caption}
          icon={GoalIcon}
          key={goal.id}
          label={goal.name}
          value="—"
        />
      ))}
    </>
  );
}
