import type { JSX } from "react";

import { Flag, RefreshCw } from "lucide-react";

import type { Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Future } from "@/engine/futures";

import { RowAction } from "@/components/app/atoms/row-action";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { ageOf } from "@/data/milestones";
import { ageIn, endAge } from "@/data/plan";
import { reachedBy, reachedIn, readingOf, runLength } from "@/engine/futures";
import { drawAgain } from "@/hooks/use-futures";
import { formatCount } from "@/lib/count";
import { formatWholePercent } from "@/lib/money";

// A run of the futures as the board hands it down: the futures drawn
// so far and whether that is all of them, or why there is nothing to
// draw, which the tiles say in place of a figure.
export type Run =
  | { readonly futures: readonly Future[]; readonly isDone: boolean }
  | { readonly unrun: string };

interface ChanceTileProps {
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly run: Run;
}

interface ReachedTileProps {
  readonly futures: readonly Future[];
  readonly isDone: boolean;
  readonly milestone: Milestone;
  readonly plan: Plan;
}

// What the tile is called, on the dashboard as on the screen it reads.
const label = "Chance of success";

// The dashboard's chance of success: the share of the plan's futures
// that last, drawn as the dashboard opens over the same run the chance
// of success draws and written as it writes it, so the two say the
// same, with how many futures and the age they last to beneath it; and
// beside it a tile for each milestone reached when conditions hold,
// the age reached in the year by which half the futures have reached
// it, the median alone, since a tile is one figure and the spread
// either side is read on the chance of success. While they are drawn,
// how many have been; and a dash, saying why, while there is nothing
// to draw them at. The run is the board's, which draws it once for the
// tiles and the chart alike.
export function ChanceTile({
  milestones,
  plan,
  run,
}: ChanceTileProps): JSX.Element {
  const reached = milestones.filter(
    (milestone) => ageOf(milestone) === undefined,
  );
  if ("unrun" in run) {
    return (
      <>
        <StatTile caption={run.unrun} label={label} value="—" />
        {reached.map((milestone) => (
          <StatTile
            caption={run.unrun}
            icon={Flag}
            key={milestone.id}
            label={milestone.name}
            value="—"
          />
        ))}
      </>
    );
  }
  const { futures, isDone } = run;
  return (
    <>
      {isDone ? (
        <StatTile
          action={<DrawAgain />}
          caption={`Of ${formatCount(runLength)} futures, lasting to ${String(endAge(plan))}`}
          label={label}
          value={formatWholePercent(readingOf(futures).chance)}
        />
      ) : (
        <StatTile
          action={<DrawAgain />}
          caption={`Drawing ${formatCount(futures.length)} of ${formatCount(runLength)} futures…`}
          label={label}
          value="…"
        />
      )}
      {reached.map((milestone) => (
        <ReachedTile
          futures={futures}
          isDone={isDone}
          key={milestone.id}
          milestone={milestone}
          plan={plan}
        />
      ))}
    </>
  );
}

// The button in the corner of every tile the run is read on, drawing
// the futures again as the chance's screen does from its header. A
// tile saying why there is nothing to draw has none.
function DrawAgain(): JSX.Element {
  return (
    <RowAction
      icon={RefreshCw}
      name="Draw the futures again"
      onClick={drawAgain}
    />
  );
}

// A milestone's tile: the age reached in the year by which half the
// futures have reached it, the year beneath, or a dash with the share
// of the run that reaches it at all where fewer than half ever do; and
// an ellipsis while the futures are drawn, as the chance's.
function ReachedTile({
  futures,
  isDone,
  milestone,
  plan,
}: ReachedTileProps): JSX.Element {
  if (!isDone) {
    return (
      <StatTile
        action={<DrawAgain />}
        caption="Drawing the futures…"
        icon={Flag}
        label={milestone.name}
        value="…"
      />
    );
  }
  const median = reachedBy(futures, milestone, { plan, share: 0.5 });
  if (median === null) {
    const reached = futures.filter(
      (future) => reachedIn(future, milestone, plan) !== null,
    ).length;
    return (
      <StatTile
        action={<DrawAgain />}
        caption={`Reached in ${formatWholePercent(reached / runLength)} of ${formatCount(runLength)} futures`}
        icon={Flag}
        label={milestone.name}
        value="—"
      />
    );
  }
  return (
    <StatTile
      action={<DrawAgain />}
      caption={`Median of ${formatCount(runLength)} futures · ${String(median)}`}
      icon={Flag}
      label={milestone.name}
      unit="yrs"
      value={String(ageIn(median, plan))}
    />
  );
}
