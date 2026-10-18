import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { Account } from "@/data/accounts";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";
import type { Slice } from "@/hooks/futures.worker";

import { defaultSeed } from "@/engine/futures";

// The runs kept, the one read last first, and the seed every one of
// them is drawn from.
interface Drawn {
  readonly runs: readonly Kept[];
  readonly seed: number;
}

// A run kept past the screen that drew it: what it was drawn over,
// written out whole so a plan handed down again in new objects reads as
// the plan it is, the slices of it drawn so far, each at the place it
// falls in the run, a slice not yet drawn left empty, and the futures
// the screens have been handed of them.
interface Kept {
  readonly for: string;
  readonly futures: readonly Future[];
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
const none: Drawn = { runs: [], seed: defaultSeed };

// The screens reading the runs kept, told when they change.
const listeners = new Set<() => void>();

// Nothing drawn of a run, which a screen reads until its run has some:
// one array, so a screen handed it again is not drawn again.
const nothing: readonly Future[] = [];

// The keys of the runs the screens are reading, one for each screen.
const reading: string[] = [];

// How many runs are kept: the household's, and the one it is compared
// against, the chance of success reading the household's. A run a
// screen is reading is kept past it, so a third drawn beside the two
// is not dropped while a screen still shows it.
const runsKept = 2;

// How many futures a worker is handed at a time: few enough that slices
// land many times between the screen's hand-overs, so the count rises
// by about as much at each, the first futures show early, and the last
// slice keeps a worker waiting on the other for little; and enough that
// handing a slice over is nothing beside drawing it. At 50 the two
// workers landed a pair about every 600 ms, and the count rose in a
// limp, half a pair and then the rest 200 ms later.
const slice = 10;

// How many workers draw a run between them, each run its own, so two
// runs drawn side by side start four.
const workers = 2;

let kept = none;

// Draws the futures again from a seed of their own, dropping every run
// kept, so every screen reading one draws its plan over other markets;
// and so does every run after it until the page is opened afresh, so a
// plan changed since still meets the markets the one before it did. The
// engine's seed stands behind the one drawn for the type alone, which
// does not know that an array of one holds one.
export function drawAgain(): void {
  const [seed = defaultSeed] = crypto.getRandomValues(new Uint32Array(1));
  keep({ runs: [], seed });
}

// Drops the runs kept, as a page opening has none: for the tests, which
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
// Two runs are kept beyond the screens that drew them, found by what
// they were drawn over, so a screen opened over the same plan, as the
// chance of success opened from the dashboard is, reads the futures the
// other drew, carrying on from the slices drawn if it was left part
// way, rather than drawing them again; and so does a screen hidden and
// shown again, as Next hides a route navigated away from rather than
// taking it down; and two screens over different plans side by side,
// as a comparison is drawn beside the household's, each read their own
// rather than dropping the other's. Past two, the runs dropped are
// those read longest ago that no screen is still reading, and a run a
// screen is reading is never dropped. Every screen reading a run is
// handed the same futures as they land, and is not drawn again as
// another run's land.
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
  const seed = useSyncExternalStore(subscribe, readSeed, readSeed);
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
    reading.push(run.key);
    const mine = kept.runs.find(({ for: key }) => key === run.key) ?? {
      for: run.key,
      futures: nothing,
      slices: [],
    };
    if (kept.runs[0] !== mine) {
      keep({
        ...kept,
        runs: trimmed([mine, ...kept.runs.filter((other) => other !== mine)]),
      });
    }
    const { slices } = mine;
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
      const index = kept.runs.findIndex((other) => other.slices === slices);
      if (index !== -1) {
        keep({
          ...kept,
          runs: kept.runs.with(index, { ...mine, futures: slices.flat() }),
        });
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
      reading.splice(reading.indexOf(run.key), 1);
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
  // This screen's run's futures alone, which only its own hand-overs
  // replace, so another run's do not draw this screen again.
  const readFutures = (): readonly Future[] =>
    kept.runs.find(({ for: key }) => key === run.key)?.futures ?? nothing;
  const futures = useSyncExternalStore(subscribe, readFutures, readFutures);
  return { futures, isDone: futures.length >= count };
}

// Keeps the runs given, telling every screen reading them.
function keep(next: Drawn): void {
  kept = next;
  for (const listener of listeners) {
    listener();
  }
}

// The seed the runs are drawn from, as a screen reads it: on the server
// too, which keeps the engine's, since it draws nothing, and so as a
// page is hydrated, which has drawn nothing yet.
function readSeed(): number {
  return kept.seed;
}

// Tells the listener given when the runs kept change, until it unsubscribes.
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

// The runs given, the one read last first: every run a screen is
// reading, and of the rest those read last, while there is room for
// them under runsKept.
function trimmed(runs: readonly Kept[]): readonly Kept[] {
  const isRead = ({ for: key }: Kept): boolean => reading.includes(key);
  let spare = runsKept - runs.filter(isRead).length;
  return runs.filter((run) => {
    if (isRead(run)) {
      return true;
    }
    spare -= 1;
    return spare >= 0;
  });
}
