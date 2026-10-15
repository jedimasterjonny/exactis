"use client";

import type { JSX } from "react";

import { Flag, Landmark } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Run } from "@/components/app/organisms/chance-tile";
import type { Account } from "@/data/accounts";
import type { Shortfall } from "@/data/cma";
import type { Milestone } from "@/data/milestones";
import type { Plan, Spread } from "@/data/plan";
import type { Tie } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";

import { saveAges } from "@/actions/plan";
import { MilestoneChips } from "@/components/app/atoms/milestone-chips";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { AgeField } from "@/components/app/molecules/age-field";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { ChanceTile } from "@/components/app/organisms/chance-tile";
import { ProjectionChart } from "@/components/app/organisms/projection-chart";
import { takesSpare } from "@/data/accounts";
import {
  ageOf,
  conditionOf,
  measureNames,
  retiresOn,
  retiringAt,
  timed,
} from "@/data/milestones";
import { ageIn, endAge, endYear } from "@/data/plan";
import {
  endWorthOf,
  futureOf,
  markersIn,
  reachedIn,
  runLength,
} from "@/engine/futures";
import { carriedBy, holdsAnything, project } from "@/engine/projection";
import { useFutures } from "@/hooks/use-futures";
import { useSender } from "@/hooks/use-sender";
import { formatGbp } from "@/lib/money";

interface BoardProps extends Omit<ProjectionBoardProps, "spread"> {
  readonly run: Run;
}

// An age moved on the board and not yet known to be in the store, and
// the age the store held when it was moved.
interface Draft {
  readonly age: number;
  readonly over: number;
}

// A save waiting for the age to settle: the timer that sends it, and
// the save itself, for a board taken down before the timer fires. The
// save travels with the timer so the board's cleanup reads nothing but
// the ref.
interface Pending {
  readonly flush: () => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface ProjectionBoardProps {
  readonly accounts: readonly Account[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly spread: Shortfall | Spread;
}

// How long an age committed has to stand before it is saved, in
// milliseconds: long enough that the arrow keys, which commit on every
// step, save once for a run of steps rather than once for each.
export const settle = 400;

// The dashboard's projection: the engine run in the browser over the
// accounts, the two schedules and the plan as the store has them, and
// charted with the milestones marked, retirement among them, under the
// row of tiles, the milestone tile first, the chance of success after
// it and after that the net worth the plan holds entering its last
// year, read off the one projection at the plan's own rates, as the
// chance's screen reads it to set the middle future against, and left
// to a wider screen than a phone's. The futures the chance of success is
// read over are drawn here, once, as the chance's screen draws them,
// so the tiles and the chart read the one run: a milestone reached when
// conditions hold is marked on the chart in the year by which half the
// futures drawn so far have reached it, named in a chip with that
// year, moving as the run comes in, as the chance's fan moves it, and
// while fewer than half the futures drawn so far reach it its chip
// says it is coming; one fewer than half ever reach is not marked once
// the run is drawn, and its chip gives the share that do in place of
// a year. There is nothing to draw while the plan has no
// spread, the CMA giving it none, or no savings for the futures to
// grow, and then the tiles say which and the chart marks the
// milestones the plan lays out alone.
// One milestone is chosen at a time, from the chips in the chart's top
// row, which name what the chart's lines cannot: the tile reads what
// the plan holds entering its year on the measure the milestone is on,
// the liquid net worth for one reached on that and the net worth for
// one reached on it, at an age or for retirement, named in the caption
// beside the year and the age, and the chart draws its line solid. The
// figure is the plan's own projection whichever milestone it is: one
// reached when conditions hold stands in the year by which half the
// futures have reached it and is read at what the plan itself holds
// entering that year, which can be short of what the milestone asks,
// where the plan at its rates reaches it later than half the futures
// do. Retirement is chosen to begin
// with, and chosen again whenever the age is moved, so the tile shows
// what the plan holds at retirement as the age is dragged. A choice
// the milestones no longer hold, one deleted or moved out of the plan's
// years, falls back to retirement, or to the first there is. A plan
// with nothing to project, or whose years hold no milestone at all, its
// owner retired before it starts, has no chips and keeps the retirement
// tile it had, the age and the last working year, or a dash where the
// plan's owner retires on conditions its own rates never reach. A
// retirement on conditions is marked where the plan at its own rates
// reaches them, which is where the chart's lines tied to it switch
// over, the futures' median being the chance's screen's to show, and
// the tile reads it on the measure of its first condition.
// The retirement age is the board's to set while retirement is reached
// at an age, in the chart's top row, from the age its owner is now to
// the age the plan runs to, and the
// tile, the mark and every figure the engine projects follow it as it
// is dragged, and the last working year is written beneath it, since the engine is pure and a plan of a lifetime is
// some hundreds of months, so it runs on every render rather than on
// the server behind a cache. So do the lines tied to retirement: each
// line's tied ends are read off the milestones again at the age
// dragged to, so a salary ending at retirement stops and the spending
// starting at it starts wherever the age is, as the store will have
// them once the age is saved. The futures are not drawn again as the
// age moves: they read the plan as the store holds it, so an age being
// dragged is drawn for once it is saved. The age shown is the store's,
// which the board is handed, save while a draft moved over that same
// age stands: once the store's age changes, from this board's save or
// from anywhere else, the draft was drawn over an age that has gone and
// the store's is shown instead, so the board never holds on to an age
// the store has moved past. An age committed is saved once it has
// stood for a moment, so a run of arrow steps is one save and not one
// for each; a board taken down with a save still waiting sends it as
// it goes. A store that refuses drops the draft, so the board shows
// what the store holds, read afresh, and says why under a toast. A
// retirement on conditions has no age to drag, so the row says what it
// is reached on instead, as the plan screen's milestones say it.
export function ProjectionBoard({
  spread,
  ...props
}: ProjectionBoardProps): JSX.Element {
  if ("short" in spread) {
    return (
      <Board {...props} run={{ unrun: "No spread to draw the futures from" }} />
    );
  }
  if (!props.accounts.some(takesSpare)) {
    return (
      <Board {...props} run={{ unrun: "No savings for the futures to grow" }} />
    );
  }
  return <Drawn {...props} spread={spread} />;
}

// The board over the tiles and the chart, handed the run as far as it
// has been drawn, or why it cannot be.
function Board({
  accounts,
  milestones,
  plan,
  run,
  schedule,
}: BoardProps): JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [choice, setChoice] = useState<Tie>("retirement");
  const pendingRef = useRef<null | Pending>(null);
  const { send } = useSender();
  const conditions = retiresOn(plan);
  const retires =
    draft !== null && draft.over === plan.retires ? draft.age : plan.retires;
  // The engine's run is memoised by hand, and the plan it runs over with
  // it, since the compiler cannot see that nothing after the run changes
  // what it returns. It folded the run into the scope that reads the
  // milestone chosen, so choosing one ran the engine again and handed
  // the chart points it had never seen, which recharts redraws whole.
  // The run is read as a future beside its points, each year measured
  // as a milestone measures one, so the tiles read the net worth as the
  // chance's screen reads the plan at its own rates, by the one function.
  // A retirement on conditions has no age to drag, and is projected as
  // the plan holds it; the plan it is laid out by is the one retiring
  // where the run reached it, or past its end where the run never did,
  // as the plan screen lays it out.
  const drafted = useMemo(
    () => (retiresOn(plan) === undefined ? retiringAt(plan, retires) : plan),
    [plan, retires],
  );
  const { laid, points, projected } = useMemo(() => {
    const lines = {
      expenses: schedule.expenses.map((line) =>
        timed(line, milestones, drafted),
      ),
      income: schedule.income.map((line) => timed(line, milestones, drafted)),
    };
    const projection = project(accounts, lines, drafted);
    const run = { accounts, plan: drafted, schedule: lines };
    const future = futureOf(projection, run);
    return {
      laid: carriedBy(run, future.retired ?? endYear(drafted) + 1).plan,
      points: projection,
      projected: future,
    };
  }, [accounts, drafted, milestones, schedule]);
  const isProjecting = points.some(holdsAnything);
  // The milestones are placed by the futures drawn so far, so a chip
  // and a line move as the slices land; while the run is drawn, the
  // ones it has yet to place are said to be coming, and once it is,
  // the ones it never placed give the share of the run that reach them.
  const drawn = "unrun" in run ? [] : run.futures;
  const markers = isProjecting
    ? markersIn(drawn, milestones, laid).filter(({ year }) =>
        points.some((point) => point.year === year),
      )
    : [];
  const unplaced =
    isProjecting && !("unrun" in run)
      ? milestones
          .filter(
            (milestone) =>
              ageOf(milestone) === undefined &&
              !markers.some(({ id }) => id === milestone.id),
          )
          .map((milestone) => ({
            id: milestone.id,
            name: milestone.name,
            reached: run.isDone
              ? drawn.filter(
                  (future) => reachedIn(future, milestone, laid) !== null,
                ).length / runLength
              : null,
          }))
      : [];
  const chosen =
    markers.find(({ id }) => id === choice) ??
    markers.find(({ id }) => id === "retirement") ??
    markers[0];
  const at =
    projected.measured[points.findIndex(({ year }) => year === chosen?.year)];
  // The measure the tile reads the chosen milestone on: the sum its
  // first condition is on, retirement's among them, or the net worth for
  // one whose condition is on the age, which no sum answers to.
  const condition = (
    chosen?.id === "retirement"
      ? conditions
      : milestones.find(({ id }) => id === chosen?.id)?.conditions
  )?.[0];
  const measure =
    condition === undefined || condition.measure === "age"
      ? "worth"
      : condition.measure;
  const lastWorking =
    projected.retired === null
      ? "Not retired by the plan's end"
      : `Last working year ${String(projected.retired - 1)}`;

  function save(age: number): void {
    send(async () => saveAges({ retires: age }), {
      failure: "Retirement age not saved",
      onRejected: () => {
        setDraft(null);
      },
    });
  }

  function move(age: number): void {
    setDraft({ age, over: plan.retires });
    setChoice("retirement");
  }

  function commit(age: number): void {
    move(age);
    if (pendingRef.current !== null) {
      clearTimeout(pendingRef.current.timer);
    }
    function flush(): void {
      pendingRef.current = null;
      save(age);
    }
    pendingRef.current = { flush, timer: setTimeout(flush, settle) };
  }

  // A save still waiting when the board is taken down is sent then
  // rather than dropped with the timer.
  useEffect(
    () => (): void => {
      if (pendingRef.current !== null) {
        clearTimeout(pendingRef.current.timer);
        pendingRef.current.flush();
      }
    },
    [],
  );

  return (
    <>
      <TileGrid>
        {chosen === undefined || at === undefined ? (
          <StatTile
            caption={lastWorking}
            icon={Flag}
            label="Retirement"
            tone="inverse"
            unit="yrs"
            value={
              projected.retired === null
                ? "—"
                : String(ageIn(projected.retired, plan))
            }
          />
        ) : (
          <StatTile
            caption={`${measureNames[measure]} · ${String(chosen.year)} · age ${String(at.age)}`}
            icon={Flag}
            label={`At ${chosen.name}`}
            tone="inverse"
            value={formatGbp(at[measure])}
          />
        )}
        <ChanceTile milestones={milestones} plan={plan} run={run} />
        <StatTile
          caption="At the plan's own rates"
          icon={Landmark}
          isHiddenOnPhone
          label={`Net worth at ${String(endAge(plan))}`}
          value={formatGbp(endWorthOf(projected))}
        />
      </TileGrid>
      <ProjectionChart
        accounts={accounts}
        choices={
          chosen === undefined ? undefined : (
            <MilestoneChips
              markers={markers}
              onSelect={setChoice}
              selected={chosen.id}
              unplaced={unplaced}
            />
          )
        }
        controls={
          conditions === undefined ? (
            <div className="w-36">
              <AgeField
                hint={lastWorking}
                label="Retirement age"
                max={endAge(plan)}
                min={ageIn(plan.from, plan)}
                onValueChange={move}
                onValueCommitted={commit}
                value={retires}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {["Retirement", ...conditions.map(conditionOf)].join(" · ")}
            </p>
          )
        }
        milestones={markers}
        points={points}
        selected={chosen?.id}
      />
    </>
  );
}

// The board over the futures as they are drawn, at the spread given.
function Drawn({
  spread,
  ...props
}: Omit<ProjectionBoardProps, "spread"> & {
  readonly spread: Spread;
}): JSX.Element {
  const { futures, isDone } = useFutures(props.accounts, props.schedule, {
    count: runLength,
    plan: props.plan,
    spread,
  });
  return <Board {...props} run={{ futures, isDone }} />;
}
