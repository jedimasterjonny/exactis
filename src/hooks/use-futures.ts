import { useEffect, useMemo, useRef, useState } from "react";

import type { Account } from "@/data/accounts";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";

import { futuresOf } from "@/engine/futures";

// The futures drawn so far for the plan they were drawn for, which a
// plan changed since leaves behind.
interface Drawn {
  readonly for: unknown;
  readonly futures: readonly Future[];
}

// A run as far as it has been drawn: the plan it is drawn for, the
// futures drawn so far, and the stream drawing them, which carries on
// where it left off.
interface Progress {
  readonly for: unknown;
  readonly held: Future[];
  readonly stream: Iterator<Future, never>;
}

// How long a slice of the run may hold the page, in milliseconds: under
// a frame, so the page answers between slices. A slice draws a future
// only while the last one drawn would still end within it.
const slice = 12;

// How long the futures drawn are held before the screen is handed them,
// in milliseconds: often enough to watch the run come in, and seldom
// enough that the screen is not drawn again for every future.
const handed = 200;

// The plan's futures as they are drawn, the count given of them, a slice
// at a time between the page's other work, so the screen can show the
// run coming in and the page stays to hand while it does: the futures
// drawn so far, and whether that is all of them. A plan changed part
// way drops what was drawn for the one before and starts again, and a
// screen taken down stops the run. A screen hidden and shown again, as
// Next hides a route navigated away from rather than taking it down,
// carries on from where its run stood, or is done if it was, rather
// than drawing a run it has again.
//
// ponytail: one thread, about 6 s for 1,000 futures of a 53-year plan
// in Chrome; a pool of workers drawing every nth future would take it
// to the cores' share of that, if the wait is felt.
export function useFutures(
  accounts: readonly Account[],
  schedule: Schedule,
  {
    count,
    plan,
    spread,
  }: { readonly count: number; readonly plan: Plan; readonly spread: Spread },
): { readonly futures: readonly Future[]; readonly isDone: boolean } {
  const run = useMemo(
    () => ({ accounts, count, plan, schedule, spread }),
    [accounts, count, plan, schedule, spread],
  );
  const [drawn, setDrawn] = useState<Drawn>({ for: null, futures: [] });
  const progressRef = useRef<null | Progress>(null);
  useEffect(() => {
    const kept = progressRef.current;
    const current: Progress =
      kept?.for === run
        ? kept
        : {
            for: run,
            held: [],
            stream: futuresOf(run.accounts, run.schedule, run),
          };
    progressRef.current = current;
    const { held, stream } = current;
    let lastHanded = performance.now();
    let timer = held.length < run.count ? setTimeout(step, 0) : undefined;
    function step(): void {
      const until = performance.now() + slice;
      let took: number;
      do {
        const started = performance.now();
        held.push(stream.next().value);
        took = performance.now() - started;
      } while (held.length < run.count && performance.now() + took < until);
      const isDone = held.length >= run.count;
      if (isDone || performance.now() - lastHanded >= handed) {
        lastHanded = performance.now();
        setDrawn({ for: run, futures: [...held] });
      }
      if (!isDone) {
        timer = setTimeout(step, 0);
      }
    }
    return (): void => {
      clearTimeout(timer);
    };
  }, [run]);
  const futures = drawn.for === run ? drawn.futures : [];
  return { futures, isDone: futures.length >= count };
}
