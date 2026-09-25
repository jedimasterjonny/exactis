"use client";

import type { JSX, ReactNode } from "react";

import { Flag } from "lucide-react";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import type { Account } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";

import { saveAges } from "@/actions/plan";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { AgeField } from "@/components/app/molecules/age-field";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { ProjectionChart } from "@/components/app/organisms/projection-chart";
import { toast } from "@/components/kit/toast";
import { endAge, retirementYear } from "@/data/plan";
import { project } from "@/engine/projection";
import { acceptedOf } from "@/lib/answer";
import { reasonOf } from "@/lib/errors";

// An age moved on the board and not yet known to be in the store, and
// the age the store held when it was moved.
interface Draft {
  readonly age: number;
  readonly over: number;
}

// A save waiting for the age to settle: the age, and the timer that
// sends it.
interface Pending {
  readonly age: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface ProjectionBoardProps {
  readonly accounts: readonly Account[];
  readonly children: ReactNode;
  readonly plan: Plan;
  readonly schedule: Schedule;
}

// How long an age committed has to stand before it is saved, in
// milliseconds: long enough that the arrow keys, which commit on every
// step, save once for a run of steps rather than once for each.
export const settle = 400;

// The dashboard's projection: the engine run in the browser over the
// accounts, the two schedules and the plan as the store has them, and
// charted with the year the plan's owner retires in marked, under the
// row of tiles, the retirement tile first and the caller's after it.
// The retirement age is the board's to set, in the chart's top row,
// from the age its owner is now to the age the plan runs to, and the
// tile, the mark and every figure the engine projects follow it as it
// is dragged, since the engine is pure and a plan of a lifetime is
// some hundreds of months, so it runs on every render rather than on
// the server behind a cache. The age shown is the store's, which the
// board is handed, save while a draft moved over that same age stands:
// once the store's age changes, from this board's save or from anywhere
// else, the draft was drawn over an age that has gone and the store's
// is shown instead, so the board never holds on to an age the store has
// moved past. An age committed is saved once it has stood for a moment,
// so a run of arrow steps is one save and not one for each; a board
// taken down with a save still waiting sends it as it goes. A store that
// refuses drops the draft, so the board shows what the store holds,
// read afresh, and says why under a toast; the drop is a transition of
// its own, since a state update after an await is not part of the one
// it awaited in.
export function ProjectionBoard({
  accounts,
  children,
  plan,
  schedule,
}: ProjectionBoardProps): JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null);
  const pendingRef = useRef<null | Pending>(null);
  const [, startSaving] = useTransition();
  const retires =
    draft !== null && draft.over === plan.retires ? draft.age : plan.retires;
  const drafted = { ...plan, retires };

  function save(age: number): void {
    startSaving(async () => {
      try {
        acceptedOf(await saveAges({ retires: age }));
      } catch (error: unknown) {
        startTransition(() => {
          setDraft(null);
        });
        toast.add({
          description: reasonOf(error),
          title: "Retirement age not saved",
          type: "error",
        });
      }
    });
  }

  function move(age: number): void {
    setDraft({ age, over: plan.retires });
  }

  function commit(age: number): void {
    move(age);
    if (pendingRef.current !== null) {
      clearTimeout(pendingRef.current.timer);
    }
    pendingRef.current = {
      age,
      timer: setTimeout(() => {
        pendingRef.current = null;
        save(age);
      }, settle),
    };
  }

  // A save still waiting when the board is taken down is sent then
  // rather than dropped with the timer.
  useEffect(
    () => (): void => {
      if (pendingRef.current !== null) {
        clearTimeout(pendingRef.current.timer);
        save(pendingRef.current.age);
      }
    },
    [],
  );

  return (
    <>
      <TileGrid>
        <StatTile
          caption={`Last working year ${String(retires - 1)}`}
          icon={Flag}
          label="Retirement"
          tone="inverse"
          unit="yrs"
          value={String(retires)}
        />
        {children}
      </TileGrid>
      <ProjectionChart
        controls={
          <div className="w-36">
            <AgeField
              label="Retirement age"
              max={endAge(plan)}
              min={plan.from - plan.born}
              onValueChange={move}
              onValueCommitted={commit}
              value={retires}
            />
          </div>
        }
        points={project(accounts, schedule, drafted)}
        retirement={retirementYear(drafted)}
      />
    </>
  );
}
