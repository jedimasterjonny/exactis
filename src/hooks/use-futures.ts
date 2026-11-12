import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { Account } from "@/data/accounts";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Breaks, Future, Trial } from "@/engine/futures";
import type { Slice, Tried } from "@/hooks/futures.worker";

import { breaksIn, defaultSeed, lastingAt } from "@/engine/futures";

// What a screen trying retirement ages has counted over one search of a
// run, found by where the run breaks: the brackets as the counts so far
// have narrowed them, and the count at each age counted.
interface Counted {
  readonly ages: NonNullable<Breaks["ages"]>;
  readonly breaks: Breaks;
  readonly counts: ReadonlyMap<number, number>;
}

// The runs kept, the one read last first, and the seed every one of
// them is drawn from.
interface Drawn {
  readonly runs: readonly Kept[];
  readonly seed: number;
}

// A run kept past the screen that drew it: what it was drawn over,
// written out whole so a plan handed down again in new objects reads as
// the plan it is, the slices of it drawn so far, each at the place it
// falls in the run, a slice not yet drawn left empty, the futures the
// screens have been handed of them, and where the run breaks once it
// has been searched, with the brackets the cut's search, and the age's
// where it is searched, left each future in.
interface Kept {
  readonly breaks?: Breaks;
  readonly for: string;
  readonly futures: readonly Future[];
  readonly slices: (readonly Future[])[];
}

// A reader's own queue on a pool of workers, as poolOf hands one out:
// how a future is tried through it, and how it is dropped.
interface Queue {
  readonly drop: () => void;
  readonly tried: (trial: Trial, future: number) => Promise<boolean>;
}

// How long the futures drawn are held before the screen is handed them,
// in milliseconds: often enough to watch the run come in, and seldom
// enough that the screen is not drawn again for every slice. The
// workers draw alike and so land their slices within a few milliseconds
// of each other, and handed each as it landed the screen showed the
// count between them for a frame or two, which read as a flicker when
// it was measured on two workers, and more workers land more slices in
// the same few milliseconds.
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
// slice keeps the other workers waiting on it for little; and enough
// that handing a slice over is nothing beside drawing it. Measured on
// two workers, at 50 they landed a pair about every 600 ms, and the
// count rose in a limp, half a pair and then the rest 200 ms later.
const slice = 10;

// The most workers a run is drawn on. ponytail: four a run, since
// WebKit drew no faster past two on a four-core box and an iPhone says
// four, so a desktop saying sixteen draws a run and the one compared
// beside it on eight in all; sharing the cores out across the runs
// kept, rather than capping each, would let one run take them all.
const mostWorkers = 4;

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

// Where the plan breaks over its run of the futures, the run given whole
// as useFutures hands it, as breaksIn finds it, on the screen's pool,
// as usePool keeps it, through a queue of the search's own, by as many
// workers as a run is drawn on, each handed one future to try at a time
// and the next as it answers: nothing until the search is done. The
// search is kept with the run, found by the futures handed, so what the
// run was drawn over is written out once, by useFutures, and it is
// dropped with the run; a screen shown again over a run already
// searched reads where it breaks rather than searching again, and so
// does one handed the run again by another screen's hand-over, which
// keeps it. Once the search lands its workers are kept for the screen,
// for the counts that follow it. The run handed over again while it is
// searched drops the search's queue and searches it afresh on the same
// workers; a plan changed stops the pool and searches the new run, and
// so does a screen hidden or taken down, hearing nothing more from the
// workers; one shown again before the search was done searches from the
// start.
export function useBreaks(
  pool: ReturnType<typeof poolOf>,
  {
    futures,
    plan,
  }: { readonly futures: readonly Future[]; readonly plan: Plan },
): Breaks | undefined {
  useEffect(() => {
    if (searchedFor(futures) !== undefined) {
      return undefined;
    }
    const { drop, tried } = pool.queue();
    void breaksIn(futures, plan, { lanes: workersOf(), tried }).then(
      (breaks) => {
        keep({
          ...kept,
          runs: kept.runs.map((each) =>
            each.futures === futures ? { ...each, breaks } : each,
          ),
        });
      },
    );
    return drop;
  }, [futures, plan, pool]);
  const readBreaks = (): Breaks | undefined => searchedFor(futures);
  return useSyncExternalStore(subscribe, readBreaks, readBreaks);
}

// The plan's futures as they are drawn, the count given of them, by a
// worker for each core off the page's thread, so the page stays to hand
// and the run takes the cores' share of the time one thread would, as
// workersOf counts them: the futures drawn so far, in the order the run
// holds them, and whether that is all of them. The
// run is handed out a slice at a time, the next to whichever worker
// comes free first, so a worker slowed by the page's own work does not
// hold the run up. The screen is handed what has come back at most
// every 200 ms, and the whole run the moment it is, each hand-over
// replacing the run's futures and nothing else kept with it, so where
// the run breaks stays however late another screen's slice lands. A plan changed part
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
      .slice(0, workersOf())
      .map(() => new Worker(new URL("./futures.worker.ts", import.meta.url)));
    let lastHanded = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    function handOver(): void {
      timer = undefined;
      lastHanded = performance.now();
      const index = kept.runs.findIndex((other) => other.slices === slices);
      const current = kept.runs[index];
      if (current !== undefined) {
        keep({
          ...kept,
          runs: kept.runs.with(index, { ...current, futures: slices.flat() }),
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

// A retirement age tried over where the plan's run breaks, as useBreaks
// hands it: the age, the plan's own until another is given; how many of
// the futures last retiring at it, as lastingAt counts them off where the
// run breaks, on the screen's pool, as usePool keeps it, through a queue
// of the count's own, on as many workers as a run is drawn on: nothing
// while it counts, nor where the run has no age searched; and how
// another age is given. Each count is kept on the screen with the
// brackets it narrowed, which the next count reads, so an age counted
// before reads its count at once; and the age given, the counts and the
// brackets are all dropped for where the run breaks handed afresh, as a
// plan changed and changed back hands the run kept for it, so the age
// reads the plan's again. No worker starts until a future is left open
// at the age, so the plan's own age, or any the brackets settle, starts
// none. An age given while another counts drops the old count's queue
// and counts the new one on the same workers, and a count dropped whose
// last tries were already on their way is not kept when they land; a
// screen hidden or taken down stops the pool, and one shown again counts
// its age afresh.
export function useLastingAt(
  pool: ReturnType<typeof poolOf>,
  {
    breaks,
    plan,
  }: { readonly breaks: Breaks | undefined; readonly plan: Plan },
): {
  readonly age: number;
  readonly lasted: number | undefined;
  readonly onAge: (age: number) => void;
} {
  const [given, setGiven] = useState<
    undefined | { readonly age: number; readonly breaks: Breaks | undefined }
  >(undefined);
  const [counted, setCounted] = useState<Counted | undefined>(undefined);
  const age =
    given !== undefined && given.breaks === breaks ? given.age : plan.retires;
  const mine = counted?.breaks === breaks ? counted : undefined;
  const lasted = mine?.counts.get(age);
  useEffect(() => {
    const ages = mine?.ages ?? breaks?.ages;
    if (breaks === undefined || ages === undefined || lasted !== undefined) {
      return undefined;
    }
    const { drop, tried } = pool.queue();
    let isCurrent = true;
    void lastingAt(ages, age, { lanes: workersOf(), tried }).then((count) => {
      if (isCurrent) {
        setCounted({
          ages: count.ages,
          breaks,
          counts: new Map(mine?.counts).set(age, count.lasted),
        });
      }
    });
    return (): void => {
      isCurrent = false;
      drop();
    };
  }, [age, breaks, lasted, mine, pool]);
  return {
    age,
    lasted,
    onAge: (tried: number): void => {
      setGiven({ age: tried, breaks });
    },
  };
}

// The workers a screen tries the futures of its run again on, as poolOf
// keeps them, made for the run, what it is drawn over and its seed, and
// shared by the search of it and every count off where it breaks, so a
// count after the search runs on workers already warm. Nothing starts
// until a try finds no worker free. The pool is stopped as the run
// changes, as a plan changed or drawn again does, and as the screen is
// hidden or taken down, hearing nothing more from its workers; the next
// try starts them afresh. ponytail: the workers are kept idle for the
// screen's life; an idle timeout is the upgrade if a phone's memory
// shows.
export function usePool(
  accounts: readonly Account[],
  schedule: Schedule,
  { plan, spread }: { readonly plan: Plan; readonly spread: Spread },
): ReturnType<typeof poolOf> {
  const seed = useSyncExternalStore(subscribe, readSeed, readSeed);
  const pool = useMemo(
    () => poolOf({ accounts, plan, schedule, seed, spread }),
    [accounts, plan, schedule, seed, spread],
  );
  useEffect(() => pool.stop, [pool]);
  return pool;
}

// Keeps the runs given, telling every screen reading them.
function keep(next: Drawn): void {
  kept = next;
  for (const listener of listeners) {
    listener();
  }
}

// Workers trying the futures of the run given again, as many as
// workersOf counts as a try would start one, each started only when a
// try finds none free, so a count leaving one future open starts one,
// and each handed one future to try at a time and the next as it
// answers, what the run was drawn over posted with each. The tries wait
// their turn in the order asked, each reader's through a queue of its
// own, which it can drop: none of its tries still waiting is posted,
// nor any it asks after, and those are never answered, while a try
// already posted still lands. Stopped, the workers are let go, hearing
// nothing more from them, and every try waiting is dropped with them,
// so the next try starts the pool afresh.
function poolOf(run: Omit<Tried, "future" | "trial">): {
  readonly queue: () => Queue;
  readonly stop: () => void;
} {
  const pool: Worker[] = [];
  const free: Worker[] = [];
  let queued: {
    readonly by: { isDropped: boolean };
    readonly posted: Tried;
    readonly settle: (lasts: boolean) => void;
  }[] = [];
  function hand(worker: Worker): void {
    const next = queued.shift();
    if (next === undefined) {
      free.push(worker);
      return;
    }
    worker.onmessage = ({ data: hasLasted }: MessageEvent<boolean>): void => {
      next.settle(hasLasted);
      hand(worker);
    };
    worker.postMessage(next.posted);
  }
  function queue(): Queue {
    const by = { isDropped: false };
    return {
      drop: (): void => {
        by.isDropped = true;
        queued = queued.filter((each) => each.by !== by);
      },
      tried: async (trial, future) =>
        new Promise((settle) => {
          if (by.isDropped) {
            return;
          }
          queued.push({
            by,
            posted: {
              accounts: run.accounts,
              future,
              plan: run.plan,
              schedule: run.schedule,
              seed: run.seed,
              spread: run.spread,
              trial,
            },
            settle,
          });
          if (free.length === 0 && pool.length < workersOf()) {
            const started = new Worker(
              new URL("./futures.worker.ts", import.meta.url),
            );
            pool.push(started);
            free.push(started);
          }
          const worker = free.pop();
          if (worker !== undefined) {
            hand(worker);
          }
        }),
    };
  }
  function stop(): void {
    for (const worker of pool) {
      worker.onmessage = null;
      worker.terminate();
    }
    pool.length = 0;
    free.length = 0;
    queued = [];
  }
  return { queue, stop };
}

// The seed the runs are drawn from, as a screen reads it: on the server
// too, which keeps the engine's, since it draws nothing, and so as a
// page is hydrated, which has drawn nothing yet.
function readSeed(): number {
  return kept.seed;
}

// Where the run kept whose futures are those given breaks, once it has
// been searched.
function searchedFor(futures: readonly Future[]): Breaks | undefined {
  return kept.runs.find((run) => run.futures === futures)?.breaks;
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

// How many workers draw a run, search one, or try one at an age,
// between them: one for each core the browser says it has, up to
// mostWorkers, and one where it says none or gives no count at all,
// each run its own, so two runs drawn side by side start twice as many.
// WebKit says four on fewer than eight cores and eight on more,
// whatever the device holds.
function workersOf(): number {
  const cores = navigator.hardwareConcurrency;
  return Number.isFinite(cores) ? Math.min(mostWorkers, Math.max(1, cores)) : 1;
}
