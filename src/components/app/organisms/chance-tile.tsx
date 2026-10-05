"use client";

import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { Shortfall } from "@/data/cma";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";

import { StatTile } from "@/components/app/molecules/stat-tile";
import { takesSpare } from "@/data/accounts";
import { endAge } from "@/data/plan";
import { readingOf, runLength } from "@/engine/futures";
import { useFutures } from "@/hooks/use-futures";
import { formatCount } from "@/lib/count";
import { formatWholePercent } from "@/lib/money";

interface ChanceTileProps {
  readonly accounts: readonly Account[];
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
// while they are drawn, how many have been; and a dash, saying why,
// while the plan has no spread to draw them at or no savings for them
// to grow. It reads the plan as the store
// holds it, so an age being dragged on the chart is drawn for once it
// is saved.
export function ChanceTile({
  accounts,
  plan,
  schedule,
  spread,
}: ChanceTileProps): JSX.Element {
  if ("short" in spread) {
    return (
      <StatTile
        caption="No spread to draw the futures from"
        label={label}
        value="—"
      />
    );
  }
  if (!accounts.some(takesSpare)) {
    return (
      <StatTile
        caption="No savings for the futures to grow"
        label={label}
        value="—"
      />
    );
  }
  return (
    <Drawn
      accounts={accounts}
      plan={plan}
      schedule={schedule}
      spread={spread}
    />
  );
}

// The tile over the futures as they are drawn.
function Drawn({
  accounts,
  plan,
  schedule,
  spread,
}: Omit<ChanceTileProps, "spread"> & { readonly spread: Spread }): JSX.Element {
  const { futures, isDone } = useFutures(accounts, schedule, {
    count: runLength,
    plan,
    spread,
  });
  return isDone ? (
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
  );
}
