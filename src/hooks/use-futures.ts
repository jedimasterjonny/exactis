import { useEffect, useMemo, useRef, useState } from "react";

import type { Account } from "@/data/accounts";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";
import type { Slice } from "@/hooks/futures.worker";

// The futures drawn so far for the plan they were drawn for, which a
// plan changed since leaves behind.
interface Drawn {
  readonly for: unknown;
  readonly futures: readonly Future[];
}

// A run as far as it has been drawn: the plan it is drawn for, and the
// slices of it drawn so far, each at the place it falls in the run, a
// slice not yet drawn left empty.
interface Progress {
  readonly for: unknown;
  readonly slices: (readonly Future[])[];
}

// How long the futures drawn are held before the screen is handed them,
// in milliseconds: often enough to watch the run come in, and seldom
// enough that the screen is not drawn again for every slice. The two
// workers draw alike and so land their slices within a few milliseconds
// of each other, and handed each as it landed the screen showed the
// count between them for a frame or two, which read as a flicker.
const handed = 200;

// How many futures a worker is handed at a time: few enough that slices
// land many times between the screen's hand-overs, so the count rises
// by about as much at each, the first futures show early, and the last
// slice keeps a worker waiting on the other for little; and enough that
// handing a slice over is nothing beside drawing it. At 50 the two
// workers landed a pair about every 600 ms, and the count rose in a
// limp, half a pair and then the rest 200 ms later.
const slice = 10;

// How many workers draw a run between them.
const workers = 2;

// The plan's futures as they are drawn, the count given of them, by two
// workers off the page's thread, so the page stays to hand and the run
// takes half the time one thread would: the futures drawn so far, in
// the order the run holds them, and whether that is all of them. The
// run is handed out a slice at a time, the next to whichever worker
// comes free first, so a worker slowed by the page's own work does not
// hold the run up. The screen is handed what has come back at most
// every 200 ms, and the whole run the moment it is. A plan changed part
// way drops what was drawn for the one before and starts again, and a
// screen taken down stops the workers, hearing nothing more from them. A screen hidden and shown again, as
// Next hides a route navigated away from rather than taking it down,
// carries on from the slices drawn while it was shown, or is done if
// they were all, rather than drawing a run it has again.
//
// ponytail: two workers; one a core, from
// navigator.hardwareConcurrency, would take a run to the cores' share,
// if two are not enough.
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
      kept?.for === run ? kept : { for: run, slices: [] };
    progressRef.current = current;
    const { slices } = current;
    const waiting = Array.from(
      { length: Math.ceil(run.count / slice) },
      (_, index) => index,
    ).filter((index) => slices[index] === undefined);
    const pool = waiting
      .slice(0, workers)
      .map(() => new Worker(new URL("./futures.worker.ts", import.meta.url)));
    let lastHanded = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    function handOver(): void {
      timer = undefined;
      lastHanded = performance.now();
      setDrawn({ for: run, futures: slices.flat() });
    }
    function hand(worker: Worker): void {
      const index = waiting.shift();
      if (index === undefined) {
        worker.terminate();
        return;
      }
      const from = index * slice;
      worker.onmessage = ({ data }: MessageEvent<readonly Future[]>): void => {
        slices[index] = data;
        hand(worker);
        if (slices.flat().length >= run.count) {
          clearTimeout(timer);
          handOver();
        } else {
          timer ??= setTimeout(
            handOver,
            Math.max(0, lastHanded + handed - performance.now()),
          );
        }
      };
      const posted: Slice = {
        accounts: run.accounts,
        count: Math.min(slice, run.count - from),
        from,
        plan: run.plan,
        schedule: run.schedule,
        spread: run.spread,
      };
      worker.postMessage(posted);
    }
    for (const worker of pool) {
      hand(worker);
    }
    return (): void => {
      clearTimeout(timer);
      for (const worker of pool) {
        worker.onmessage = null;
        worker.terminate();
      }
    };
  }, [run]);
  const futures = drawn.for === run ? drawn.futures : [];
  return { futures, isDone: futures.length >= count };
}
