"use client";

import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";

import { ProjectionChart } from "@/components/app/organisms/projection-chart";
import { retirementYear } from "@/data/plan";
import { project } from "@/engine/projection";

interface ProjectionBoardProps {
  readonly accounts: readonly Account[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

// The dashboard's projection: the engine run in the browser over the
// accounts, the two schedules and the plan as the store has them, and
// charted with the year the plan's owner retires in marked. The engine
// is pure and a plan of a lifetime is some hundreds of months, so it runs
// on every render rather than on the server behind a cache: what the
// board is handed is what it projects, and a figure changed on the
// screen can be projected as it changes rather than on the way back from a
// save.
export function ProjectionBoard({
  accounts,
  plan,
  schedule,
}: ProjectionBoardProps): JSX.Element {
  return (
    <ProjectionChart
      points={project(accounts, schedule, plan)}
      retirement={retirementYear(plan)}
    />
  );
}
