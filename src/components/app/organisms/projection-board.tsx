"use client";

import type { JSX, ReactNode } from "react";

import { Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Account } from "@/data/accounts";
import type { Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Tie } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";

import { saveAges } from "@/actions/plan";
import { MilestoneChips } from "@/components/app/atoms/milestone-chips";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { AgeField } from "@/components/app/molecules/age-field";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { ProjectionChart } from "@/components/app/organisms/projection-chart";
import { markersOf, timed } from "@/data/milestones";
import { ageIn, endAge, retirementYear } from "@/data/plan";
import { balanceOf, holdsAnything, project } from "@/engine/projection";
import { useSender } from "@/hooks/use-sender";
import { formatGbp } from "@/lib/money";

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
  readonly children: ReactNode;
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

// How long an age committed has to stand before it is saved, in
// milliseconds: long enough that the arrow keys, which commit on every
// step, save once for a run of steps rather than once for each.
export const settle = 400;

// The dashboard's projection: the engine run in the browser over the
// accounts, the two schedules and the plan as the store has them, and
// charted with the milestones marked, retirement among them, under the
// row of tiles, the milestone tile first and the caller's after it.
// One milestone is chosen at a time, from the chips in the chart's top
// row, which name what the chart's lines cannot: the tile reads the
// balance the plan holds entering its year, with the year and the age,
// and the chart draws its line solid. Retirement is chosen to begin
// with, and chosen again whenever the age is moved, so the tile shows
// what the plan holds at retirement as the age is dragged. A choice
// the milestones no longer hold, one deleted or moved out of the plan's
// years, falls back to retirement, or to the first there is. A plan
// with nothing to project, or whose years hold no milestone at all, its
// owner retired before it starts, has no chips and keeps the retirement
// tile it had, the age and the last working year.
// The retirement age is the board's to set, in the chart's top row,
// from the age its owner is now to the age the plan runs to, and the
// tile, the mark and every figure the engine projects follow it as it
// is dragged, and the last working year is written beneath it, since the engine is pure and a plan of a lifetime is
// some hundreds of months, so it runs on every render rather than on
// the server behind a cache. So do the lines tied to retirement: each
// line's tied ends are read off the milestones again at the age
// dragged to, so a salary ending at retirement stops and the spending
// starting at it starts wherever the age is, as the store will have
// them once the age is saved. The age shown is the store's, which the
// board is handed, save while a draft moved over that same age stands:
// once the store's age changes, from this board's save or from anywhere
// else, the draft was drawn over an age that has gone and the store's
// is shown instead, so the board never holds on to an age the store has
// moved past. An age committed is saved once it has stood for a moment,
// so a run of arrow steps is one save and not one for each; a board
// taken down with a save still waiting sends it as it goes. A store that
// refuses drops the draft, so the board shows what the store holds,
// read afresh, and says why under a toast.
export function ProjectionBoard({
  accounts,
  children,
  milestones,
  plan,
  schedule,
}: ProjectionBoardProps): JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [choice, setChoice] = useState<Tie>("retirement");
  const pendingRef = useRef<null | Pending>(null);
  const { send } = useSender();
  const retires =
    draft !== null && draft.over === plan.retires ? draft.age : plan.retires;
  const drafted = { ...plan, retires };
  const points = project(
    accounts,
    {
      expenses: schedule.expenses.map((line) =>
        timed(line, milestones, drafted),
      ),
      income: schedule.income.map((line) => timed(line, milestones, drafted)),
    },
    drafted,
  );
  const isProjecting = points.some(holdsAnything);
  const markers = isProjecting
    ? markersOf(milestones, drafted).filter(({ year }) =>
        points.some((point) => point.year === year),
      )
    : [];
  const chosen =
    markers.find(({ id }) => id === choice) ??
    markers.find(({ id }) => id === "retirement") ??
    markers[0];
  const at = points.find(({ year }) => year === chosen?.year);
  const lastWorking = `Last working year ${String(retirementYear(drafted) - 1)}`;

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
            value={String(retires)}
          />
        ) : (
          <StatTile
            caption={`${String(at.year)} · age ${String(at.age)}`}
            icon={Flag}
            label={`At ${chosen.name}`}
            tone="inverse"
            value={formatGbp(balanceOf(at))}
          />
        )}
        {children}
      </TileGrid>
      <ProjectionChart
        accounts={accounts}
        choices={
          chosen === undefined ? undefined : (
            <MilestoneChips
              markers={markers}
              onSelect={setChoice}
              selected={chosen.id}
            />
          )
        }
        controls={
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
        }
        milestones={markers}
        points={points}
        selected={chosen?.id}
      />
    </>
  );
}
