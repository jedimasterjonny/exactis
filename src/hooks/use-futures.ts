import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { Account } from "@/data/accounts";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";
import type { Slice } from "@/hooks/futures.worker";

import { defaultSeed } from "@/engine/futures";

// The run drawn last, kept past the screen that drew it: what it was
// drawn over, written out whole so a plan handed down again in new
// objects reads as the plan it is, the slices of it drawn so far, each
// at the place it falls in the run, a slice not yet drawn left empty,
// the futures the screens have been handed of them, and the seed the
// runs are drawn from.
interface Kept {
  readonly for: string;
  readonly futures: readonly Future[];
  readonly seed: number;
  readonly slices: (readonly Future[])[];
}

// How long the futures drawn are held before the screen is handed them,
// in milliseconds: often enough to watch the run come in, and seldom
// enough that the screen is not drawn again for every slice. The two
// workers draw alike and so land their slices within a few milliseconds
// of each other, and handed each as it landed the screen showed the
// count between them for a frame or two, which read as a flicker.
const handed = 200;

// Nothing drawn, as a page opens with, and every run drawn from the
// seed the engine draws from.
const none: Kept = { for: "", futures: [], seed: defaultSeed, slices: [] };

// The screens reading the run kept, told when it changes.
const listeners = new Set<() => void>();

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

let kept = none;

// Draws the futures again from a seed of their own, dropping the run
// kept, so every screen reading it draws the plan over other markets;
// and so does every run after it until the page is opened afresh, so a
// plan changed since still meets the markets the one before it did. The
// engine's seed stands behind the one drawn for the type alone, which
// does not know that an array of one holds one.
export function drawAgain(): void {
  const [seed = defaultSeed] = crypto.getRandomValues(new Uint32Array(1));
  keep({ for: "", futures: [], seed, slices: [] });
}

// Drops the run kept, as a page opening has none: for the tests, which
// each open on a page of their own.
export function forget(): void {
  kept = none;
}

// The plan's futures as they are drawn, the count given of them, by two
// workers off the page's thread, so the page stays to hand and the run
// takes half the time one thread would: the futures drawn so far, in
// the order the run holds them, and whether that is all of them. The
// run is handed out a slice at a time, the next to whichever worker
// comes free first, so a worker slowed by the page's own work does not
// hold the run up. The screen is handed what has come back at most
// every 200 ms, and the whole run the moment it is. A plan changed part
// way drops what was drawn for the one before and starts again, and a
// screen taken down stops the workers, hearing nothing more from them,
// and hands over what had landed since it last handed any over, unless
// the run has been drawn again since and what landed is of no use.
// The run is kept beyond the screen that drew it, one run, the last, so
// a screen opened over the same plan, as the chance of success opened
// from the dashboard is, reads the futures the other drew, carrying on
// from the slices drawn if it was left part way, rather than drawing
// them again; and so does a screen hidden and shown again, as Next
// hides a route navigated away from rather than taking it down. Every
// screen reading the run is handed the same futures as they land.
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
  const drawn = useSyncExternalStore(subscribe, read, read);
  const { seed } = drawn;
  const run = useMemo(
    () => ({
      accounts,
      count,
      key: JSON.stringify([accounts, count, plan, schedule, seed, spread]),
      plan,
      schedule,
      seed,
      spread,
    }),
    [accounts, count, plan, schedule, seed, spread],
  );
  useEffect(() => {
    if (kept.for !== run.key) {
      keep({ for: run.key, futures: [], seed: run.seed, slices: [] });
    }
    const { slices } = kept;
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
      if (kept.slices === slices) {
        keep({ ...kept, futures: slices.flat() });
      }
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
        seed: run.seed,
        spread: run.spread,
      };
      worker.postMessage(posted);
    }
    for (const worker of pool) {
      hand(worker);
    }
    return (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
        handOver();
      }
      for (const worker of pool) {
        worker.onmessage = null;
        worker.terminate();
      }
    };
  }, [run]);
  const futures = drawn.for === run.key ? drawn.futures : [];
  return { futures, isDone: futures.length >= count };
}

// Keeps the run given, telling every screen reading it.
function keep(next: Kept): void {
  kept = next;
  for (const listener of listeners) {
    listener();
  }
}

// The run kept, as a screen reads it: on the server too, which keeps
// none, since it draws nothing, and so as a page is hydrated, which has
// drawn nothing yet.
function read(): Kept {
  return kept;
}

// Tells the listener given when the run kept changes, until it unsubscribes.
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}
