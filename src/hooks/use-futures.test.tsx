import type { RenderHookResult } from "@testing-library/react";

import { act, renderHook } from "@testing-library/react";
import { Activity } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Spread } from "@/data/plan";
import type { Breaks, Future, Trial } from "@/engine/futures";
import type { Slice, Tried } from "@/hooks/futures.worker";

import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { retiringAt } from "@/data/milestones";
import { working } from "@/data/owners.fixture";
import {
  breaksIn,
  futuresOf,
  lastingAt,
  lastsTried,
  readingOf,
} from "@/engine/futures";
import { FuturesWorker } from "@/test/futures-worker";

import {
  drawAgain,
  forget,
  useBreaks,
  useFutures,
  useLastingAt,
  usePool,
} from "./use-futures";

// An ISA drawn £1,000 a month over three years at 5%, straying 15% a
// year, so each future is drawn in a moment and no two alike.
const isa: Account = {
  balance: 30000,
  growth: { kind: "plan" },
  id: 1,
  kind: "tax-free",
  name: "ISA",
  owner: 1,
};

const accounts = [isa];

const schedule = {
  expenses: [{ ...expenseLines[0], amount: 1000, growth: "nominal" as const }],
  income: [],
};

const plan = {
  born: 1992,
  from: 2026,
  inflation: 0.02,
  month: 0,
  owners: [working],
  rate: 0.05,
  retires: 92,
  years: 3,
};

const spread = { inflation: 0.02, rate: 0.15 };

// How long a worker takes over a slice, in milliseconds: under the 200
// the screen is handed what has come back at most every.
const took = 150;

// A worker that keeps the place in the run of each slice it is handed,
// and of each future it is handed to try, with all it was handed to try
// it, and takes a while over each.
class Watched extends FuturesWorker {
  public readonly handed: number[] = [];

  public readonly posted: Tried[] = [];

  public readonly tried: number[] = [];

  protected override readonly took = took;

  public override postMessage(posted: Slice | Tried): void {
    if ("trial" in posted) {
      this.tried.push(posted.future);
      this.posted.push(posted);
    } else {
      this.handed.push(posted.from);
    }
    super.postMessage(posted);
  }
}

// The workers the hook starts, in the order it starts them, on a clock
// faked so a test says when each slice lands, in a browser saying it
// has the cores given, two unless told otherwise.
function watchWorkers(cores = 2): readonly Watched[] {
  vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(cores);
  const started: Watched[] = [];
  vi.stubGlobal(
    "Worker",
    vi.fn(function start() {
      const worker = new Watched();
      started.push(worker);
      return worker;
    }),
  );
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  return started;
}

describe("useFutures", () => {
  // Each test opens a page of its own, with no run kept from the last.
  beforeEach(() => {
    forget();
  });

  // 24 futures are three slices, the last of four: the two workers are
  // handed the first
  // two, and the first back is handed the third while the other, with
  // nothing left to hand it, is let go. The first two land together at
  // 150 ms and are handed over together at 200, so the screen never
  // shows the count between them; the third lands at 300 and finishes
  // the run, which is handed over at once.
  it("draws the plan's futures on two workers a slice at a time, handing over what has landed every 200 ms and the whole run once it is drawn", () => {
    const started = watchWorkers();
    const run = { count: 24, plan, spread };
    const { result } = renderHook(() => useFutures(accounts, schedule, run));

    expect(result.current).toStrictEqual({ futures: [], isDone: false });
    expect(started.map(({ handed }) => handed)).toStrictEqual([[0], [10]]);
    act(() => {
      vi.advanceTimersByTime(took);
    });
    expect(started.map(({ handed }) => handed)).toStrictEqual([[0, 20], [10]]);
    expect(result.current).toStrictEqual({ futures: [], isDone: false });
    act(() => {
      vi.advanceTimersByTime(200 - took);
    });
    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, run).take(20).toArray(),
      isDone: false,
    });
    act(() => {
      vi.advanceTimersByTime(took);
    });

    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, run).take(24).toArray(),
      isDone: true,
    });
    for (const worker of started) {
      expect(worker.terminate).toHaveBeenCalled();
    }
  });

  // The old plan's third slice is still on its way when the plan
  // changes, and lands on a handler taken off.
  it("drops what was drawn for a plan changed part way, hearing nothing more from its workers, and draws the new one's", () => {
    const started = watchWorkers();
    const changed = { ...plan, rate: 0.08 };
    const { rerender, result } = renderHook(
      ({ drawnFor }) =>
        useFutures(accounts, schedule, { count: 30, plan: drawnFor, spread }),
      { initialProps: { drawnFor: plan } },
    );
    act(() => {
      vi.advanceTimersByTime(took);
    });

    rerender({ drawnFor: changed });

    expect(result.current).toStrictEqual({ futures: [], isDone: false });
    expect(started).toHaveLength(4);
    for (const worker of started.slice(0, 2)) {
      expect(worker.terminate).toHaveBeenCalled();
      expect(worker.onmessage).toBeNull();
    }
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, { plan: changed, spread })
        .take(30)
        .toArray(),
      isDone: true,
    });
  });

  // Next hides a route navigated away from rather than taking it down,
  // which clears its effects and runs them again when it is shown; a run
  // done before it was hidden is still done, with nothing left to draw.
  it("is still done when the screen is hidden and shown again, starting no worker", () => {
    const started = watchWorkers();
    const mode = { current: "visible" as "hidden" | "visible" };
    const run = { count: 5, plan, spread };
    const { rerender, result } = renderHook(
      () => useFutures(accounts, schedule, run),
      {
        wrapper: ({ children }) => (
          <Activity mode={mode.current}>{children}</Activity>
        ),
      },
    );
    act(() => {
      vi.runAllTimers();
    });

    mode.current = "hidden";
    rerender();
    mode.current = "visible";
    rerender();

    expect(started).toHaveLength(1);
    expect(result.current.futures).toHaveLength(5);
    expect(result.current.isDone).toBe(true);
  });

  // Hidden once the first two of three slices are back, the third still
  // on its way: shown again, the run carries on from the slices it has,
  // handing the third out again rather than starting over, and it ends
  // on the same futures.
  it("carries a run hidden part way on from the slices it has when shown again", () => {
    const started = watchWorkers();
    const mode = { current: "visible" as "hidden" | "visible" };
    const run = { count: 30, plan, spread };
    const { rerender, result } = renderHook(
      () => useFutures(accounts, schedule, run),
      {
        wrapper: ({ children }) => (
          <Activity mode={mode.current}>{children}</Activity>
        ),
      },
    );
    act(() => {
      vi.advanceTimersByTime(took);
    });

    mode.current = "hidden";
    rerender();
    mode.current = "visible";
    rerender();
    act(() => {
      vi.runAllTimers();
    });

    expect(started.map(({ handed }) => handed)).toStrictEqual([
      [0, 20],
      [10],
      [20],
    ]);
    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, run).take(30).toArray(),
      isDone: true,
    });
  });

  // The second screen is handed the plan in objects of its own, as a
  // route rendered afresh is, and reads it as the plan it is.
  it("hands a screen opened over the same plan the run another drew, starting no worker", () => {
    const started = watchWorkers();
    const run = { count: 5, plan, spread };
    const { unmount } = renderHook(() => useFutures(accounts, schedule, run));
    act(() => {
      vi.runAllTimers();
    });
    unmount();

    const { result } = renderHook(() =>
      useFutures([{ ...isa }], { ...schedule }, { ...run, plan: { ...plan } }),
    );

    expect(started).toHaveLength(1);
    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, run).take(5).toArray(),
      isDone: true,
    });
  });

  // Taken down once the first two of three slices are back, the third
  // still on its way: the next screen draws the third alone.
  it("carries a run another screen left part way on from the slices it drew", () => {
    const started = watchWorkers();
    const run = { count: 30, plan, spread };
    const { unmount } = renderHook(() => useFutures(accounts, schedule, run));
    act(() => {
      vi.advanceTimersByTime(took);
    });
    unmount();

    const { result } = renderHook(() => useFutures(accounts, schedule, run));

    expect(result.current.futures).toHaveLength(20);
    act(() => {
      vi.runAllTimers();
    });
    expect(started.map(({ handed }) => handed)).toStrictEqual([
      [0, 20],
      [10],
      [20],
    ]);
    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, run).take(30).toArray(),
      isDone: true,
    });
  });

  // Drawn again once the first two of three slices are back, the third
  // still on its way: what has landed is of no use, and the run starts
  // over from the seed drawn, here 7.
  it("draws the futures again from a seed of their own, dropping what was drawn", () => {
    const started = watchWorkers();
    vi.spyOn(crypto, "getRandomValues").mockReturnValue(new Uint32Array([7]));
    const run = { count: 30, plan, spread };
    const { result } = renderHook(() => useFutures(accounts, schedule, run));
    act(() => {
      vi.advanceTimersByTime(took);
    });

    act(() => {
      drawAgain();
    });

    expect(result.current).toStrictEqual({ futures: [], isDone: false });
    act(() => {
      vi.runAllTimers();
    });
    expect(started.map(({ handed }) => handed)).toStrictEqual([
      [0, 20],
      [10],
      [0, 20],
      [10],
    ]);
    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, { ...run, seed: 7 })
        .take(30)
        .toArray(),
      isDone: true,
    });
  });

  it("draws a plan changed after the futures were drawn again from the seed they were drawn from", () => {
    watchWorkers();
    vi.spyOn(crypto, "getRandomValues").mockReturnValue(new Uint32Array([7]));
    const changed = { ...plan, rate: 0.08 };
    const { rerender, result } = renderHook(
      ({ drawnFor }) =>
        useFutures(accounts, schedule, { count: 5, plan: drawnFor, spread }),
      { initialProps: { drawnFor: plan } },
    );
    act(() => {
      drawAgain();
    });

    rerender({ drawnFor: changed });
    act(() => {
      vi.runAllTimers();
    });

    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, { plan: changed, seed: 7, spread })
        .take(5)
        .toArray(),
      isDone: true,
    });
  });

  // The household's and a comparison's side by side, as the dashboard
  // draws them while a scenario is open: each is drawn once, on two
  // workers of its own, and neither drops the other's.
  it("draws two screens over different plans side by side, each its own futures, neither dropping the other's", () => {
    const started = watchWorkers();
    const household = { count: 30, plan, spread };
    const compared = { ...household, plan: { ...plan, rate: 0.08 } };
    const { result: householdBoard } = renderHook(() =>
      useFutures(accounts, schedule, household),
    );
    const { result: comparedBoard } = renderHook(() =>
      useFutures(accounts, schedule, compared),
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(started.map(({ handed }) => handed)).toStrictEqual([
      [0, 20],
      [10],
      [0, 20],
      [10],
    ]);
    expect(householdBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, household).take(30).toArray(),
      isDone: true,
    });
    expect(comparedBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, compared).take(30).toArray(),
      isDone: true,
    });
  });

  // The comparison is changed part way, as a scenario edited is, and
  // its first run, read after the household's but by no screen now, is
  // the one dropped: the household's carries on from its slices rather
  // than starting over, and the comparison changed back draws afresh.
  it("drops the run read longest ago that no screen still reads for a third, and the two still read carry on", () => {
    const started = watchWorkers();
    const household = { count: 30, plan, spread };
    const compared = { ...household, plan: { ...plan, rate: 0.08 } };
    const edited = { ...household, plan: { ...plan, rate: 0.03 } };
    const { result: householdBoard } = renderHook(() =>
      useFutures(accounts, schedule, household),
    );
    const { rerender, result: comparedBoard } = renderHook(
      ({ over }) => useFutures(accounts, schedule, over),
      { initialProps: { over: compared } },
    );
    act(() => {
      vi.advanceTimersByTime(took);
    });

    rerender({ over: edited });
    act(() => {
      vi.runAllTimers();
    });

    expect(started.map(({ handed }) => handed)).toStrictEqual([
      [0, 20],
      [10],
      [0, 20],
      [10],
      [0, 20],
      [10],
    ]);
    expect(householdBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, household).take(30).toArray(),
      isDone: true,
    });
    expect(comparedBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, edited).take(30).toArray(),
      isDone: true,
    });
    rerender({ over: compared });
    expect(comparedBoard.current).toStrictEqual({ futures: [], isDone: false });
    expect(householdBoard.current.isDone).toBe(true);
  });

  // A third screen opened beside the two over a plan of its own: a run
  // a screen is reading is kept past two, so none is dropped from under
  // the screen showing it.
  it("keeps every run a screen is reading past two, so three screens over three plans side by side each draw their own", () => {
    const started = watchWorkers();
    const household = { count: 30, plan, spread };
    const compared = { ...household, plan: { ...plan, rate: 0.08 } };
    const third = { ...household, plan: { ...plan, rate: 0.03 } };
    const { result: householdBoard } = renderHook(() =>
      useFutures(accounts, schedule, household),
    );
    const { result: comparedBoard } = renderHook(() =>
      useFutures(accounts, schedule, compared),
    );
    const { result: thirdBoard } = renderHook(() =>
      useFutures(accounts, schedule, third),
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(started).toHaveLength(6);
    expect(householdBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, household).take(30).toArray(),
      isDone: true,
    });
    expect(comparedBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, compared).take(30).toArray(),
      isDone: true,
    });
    expect(thirdBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, third).take(30).toArray(),
      isDone: true,
    });
  });

  // The household's drawn, a comparison is opened beside it and drawn
  // in turn: none of its hand-overs is the household's, so the
  // household's screen is not drawn again for any of them.
  it("does not draw a screen again for another run's hand-overs", () => {
    watchWorkers();
    const household = { count: 5, plan, spread };
    const compared = { count: 30, plan: { ...plan, rate: 0.08 }, spread };
    let timesDrawn = 0;
    renderHook(() => {
      timesDrawn += 1;
      return useFutures(accounts, schedule, household);
    });
    act(() => {
      vi.runAllTimers();
    });
    const drawnBefore = timesDrawn;

    const { result: comparedBoard } = renderHook(() =>
      useFutures(accounts, schedule, compared),
    );
    act(() => {
      vi.runAllTimers();
    });

    expect(comparedBoard.current.isDone).toBe(true);
    expect(timesDrawn).toBe(drawnBefore);
  });

  // Both drawn part way, the third slice of each still on its way, when
  // the futures are drawn again, here from the seed 7.
  it("draws every run kept again from the one seed drawn, dropping what was drawn of each", () => {
    watchWorkers();
    vi.spyOn(crypto, "getRandomValues").mockReturnValue(new Uint32Array([7]));
    const household = { count: 30, plan, spread };
    const compared = { ...household, plan: { ...plan, rate: 0.08 } };
    const { result: householdBoard } = renderHook(() =>
      useFutures(accounts, schedule, household),
    );
    const { result: comparedBoard } = renderHook(() =>
      useFutures(accounts, schedule, compared),
    );
    act(() => {
      vi.advanceTimersByTime(took);
    });

    act(() => {
      drawAgain();
    });

    expect(householdBoard.current).toStrictEqual({
      futures: [],
      isDone: false,
    });
    expect(comparedBoard.current).toStrictEqual({ futures: [], isDone: false });
    act(() => {
      vi.runAllTimers();
    });
    expect(householdBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, { ...household, seed: 7 })
        .take(30)
        .toArray(),
      isDone: true,
    });
    expect(comparedBoard.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, { ...compared, seed: 7 })
        .take(30)
        .toArray(),
      isDone: true,
    });
  });

  it("forgets every run kept", () => {
    watchWorkers();
    const household = { count: 5, plan, spread };
    const compared = { ...household, plan: { ...plan, rate: 0.08 } };
    const { unmount } = renderHook(() =>
      useFutures(accounts, schedule, household),
    );
    const { unmount: unmountCompared } = renderHook(() =>
      useFutures(accounts, schedule, compared),
    );
    act(() => {
      vi.runAllTimers();
    });
    unmount();
    unmountCompared();

    forget();

    expect(
      renderHook(() => useFutures(accounts, schedule, household)).result
        .current,
    ).toStrictEqual({ futures: [], isDone: false });
    expect(
      renderHook(() => useFutures(accounts, schedule, compared)).result.current,
    ).toStrictEqual({ futures: [], isDone: false });
  });

  // 40 futures are four slices, the first three handed to the three
  // workers at once, and the fourth to whichever comes back first; and a
  // browser saying it has none is drawn for on one.
  it("draws on a worker for each core the browser says it has", () => {
    const started = watchWorkers(3);
    renderHook(() =>
      useFutures(accounts, schedule, { count: 40, plan, spread }),
    );

    expect(started.map(({ handed }) => handed)).toStrictEqual([
      [0],
      [10],
      [20],
    ]);
    act(() => {
      vi.runAllTimers();
    });
    expect(started.map(({ handed }) => handed)).toStrictEqual([
      [0, 30],
      [10],
      [20],
    ]);
    vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(0);
    renderHook(() =>
      useFutures(accounts, schedule, {
        count: 40,
        plan: { ...plan, rate: 0.03 },
        spread,
      }),
    );
    expect(started).toHaveLength(4);
  });

  // 100 futures are ten slices, but a browser saying it has sixteen
  // cores draws them on four workers; and one giving no count at all, as
  // a browser may leave it unsaid, draws on one rather than none.
  it("draws on four workers at most, and on one where the browser gives no count", () => {
    const started = watchWorkers(16);
    renderHook(() =>
      useFutures(accounts, schedule, { count: 100, plan, spread }),
    );

    expect(started).toHaveLength(4);
    vi.stubGlobal("navigator", {});
    renderHook(() =>
      useFutures(accounts, schedule, {
        count: 100,
        plan: { ...plan, rate: 0.03 },
        spread,
      }),
    );
    expect(started).toHaveLength(5);
  });

  it("stops the workers when the screen is taken down", () => {
    const started = watchWorkers();
    const { unmount } = renderHook(() =>
      useFutures(accounts, schedule, { count: 20, plan, spread }),
    );

    unmount();

    expect(started).toHaveLength(2);
    for (const worker of started) {
      expect(worker.terminate).toHaveBeenCalled();
      expect(worker.onmessage).toBeNull();
    }
  });

  it("is done at once with nothing to draw, starting no worker", () => {
    const started = watchWorkers();
    const { result } = renderHook(() =>
      useFutures(accounts, schedule, { count: 0, plan, spread }),
    );

    expect(result.current).toStrictEqual({ futures: [], isDone: true });
    expect(started).toHaveLength(0);
  });
});

describe("useBreaks", () => {
  // Each test opens a page of its own, with no run kept from the last.
  beforeEach(() => {
    forget();
  });

  // Retiring at 36, inside the plan's three years, so the age is searched
  // as well as the spending.
  const run = { count: 10, plan: retiringAt(plan, 36), spread };

  // The run's ten futures, drawn on one worker by a screen left open.
  function drawn(): readonly Future[] {
    const { result } = renderHook(() => useFutures(accounts, schedule, run));
    act(() => {
      vi.runAllTimers();
    });
    return result.current.futures;
  }

  // Where the futures given break, searched on a pool of the screen's
  // own over the run, as the card searches them.
  function searching(
    futures: readonly Future[],
  ): RenderHookResult<Breaks | undefined, unknown> {
    return renderHook(() =>
      useBreaks(usePool(accounts, schedule, run), { futures, plan: run.plan }),
    );
  }

  // Whether one of the run's futures lasts tried as given, on the test's
  // own thread.
  async function tried(trial: Trial, future: number): Promise<boolean> {
    return Promise.resolve(
      lastsTried(accounts, schedule, { ...run, future, trial }),
    );
  }

  // A worker taking the time given over what it is handed.
  function taking(took: number): typeof FuturesWorker {
    return class extends FuturesWorker {
      protected override readonly took = took;
    };
  }

  // Ten futures to the slice, the run is one slice on one worker, and
  // the search starts two more, each handed one future at a time; the
  // household's run beside it, five futures on a worker of its own, is
  // left unsearched. The two find the figures one lane finds, in
  // brackets of their own, since which future lands first is the
  // workers', and the count at an age off either is the same. The two
  // are kept for the screen once the search lands, and let go with it.
  it("searches a run drawn whole for where it breaks on two workers trying a future at a time, keeps it with that run alone, and keeps the workers until the screen is taken down", async () => {
    const started = watchWorkers();
    const household = { count: 5, plan, spread };
    const { result: other } = renderHook(() =>
      useFutures(accounts, schedule, household),
    );
    const futures = drawn();
    const { result, unmount } = searching(futures);

    expect(result.current).toBeUndefined();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const oneLane = await breaksIn(futures, run.plan, { lanes: 1, tried });
    const countedAt = async (
      ages: Breaks["ages"],
      age: number,
    ): Promise<number> => {
      expect(ages).toHaveLength(10);
      return (await lastingAt(ages ?? [], age, { lanes: 1, tried })).lasted;
    };
    expect({
      age: result.current?.age,
      cut: result.current?.cut,
    }).toStrictEqual({ age: oneLane.age, cut: oneLane.cut });
    for (const age of [35, 37]) {
      expect(await countedAt(result.current?.ages, age)).toBe(
        await countedAt(oneLane.ages, age),
      );
    }
    const [, , ...searchers] = started;
    expect(searchers).toHaveLength(2);
    for (const worker of searchers) {
      expect(worker.tried.length).toBeGreaterThan(0);
      expect(worker.terminate).not.toHaveBeenCalled();
    }
    unmount();
    for (const worker of searchers) {
      expect(worker.terminate).toHaveBeenCalled();
      expect(worker.onmessage).toBeNull();
    }
    const { result: again } = renderHook(() =>
      useBreaks(usePool([{ ...isa }], { ...schedule }, { ...run }), {
        futures,
        plan: { ...run.plan },
      }),
    );
    expect(again.current).toStrictEqual(result.current);
    expect(started).toHaveLength(4);
    expect(
      renderHook(() =>
        useBreaks(usePool(accounts, schedule, household), {
          futures: other.current.futures,
          plan,
        }),
      ).result.current,
    ).toBeUndefined();
  });

  // Taken down after the first two tries are back, others on their way.
  it("stops the workers when the screen is taken down part way, and searches afresh when opened again", () => {
    const started = watchWorkers();
    const futures = drawn();
    const { unmount } = searching(futures);
    act(() => {
      vi.advanceTimersByTime(took);
    });

    unmount();

    const [, ...searchers] = started;
    for (const worker of searchers) {
      expect(worker.terminate).toHaveBeenCalled();
      expect(worker.onmessage).toBeNull();
    }
    const { result } = searching(futures);
    act(() => {
      vi.advanceTimersByTime(took);
    });
    expect(result.current).toBeUndefined();
    expect(started).toHaveLength(5);
  });

  // Two screens read the one run, the second's worker a minute over the
  // slice the first's draws in 150 ms, and a third, opened once the run
  // is drawn, searches it. The second's slice lands after the search,
  // handing the run over again, and where it breaks is kept with it, so
  // the third reads it still and searches nothing again.
  it("keeps where a run breaks when another screen hands the run over after the search", async () => {
    const started = watchWorkers();
    const watching = globalThis.Worker;
    renderHook(() => useFutures(accounts, schedule, run));
    vi.stubGlobal("Worker", taking(60000));
    renderHook(() => useFutures(accounts, schedule, run));
    vi.stubGlobal("Worker", watching);
    act(() => {
      vi.advanceTimersByTime(took);
    });
    const { result } = renderHook(() => {
      const { futures } = useFutures(accounts, schedule, run);
      return useBreaks(usePool(accounts, schedule, run), {
        futures,
        plan: run.plan,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    const breaks = result.current;
    const searchers = started.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(breaks).toBeDefined();
    expect(result.current).toStrictEqual(breaks);
    expect(started).toHaveLength(searchers);
  });

  // As above, but the second screen's slice lands a second in, while
  // the run is searched: the search is begun again over the run handed
  // over, on the same two workers, and finds what one lane finds.
  it("searches the run afresh on the same workers when another screen hands it over while it is searched", async () => {
    const started = watchWorkers();
    const watching = globalThis.Worker;
    renderHook(() => useFutures(accounts, schedule, run));
    vi.stubGlobal("Worker", taking(1000));
    renderHook(() => useFutures(accounts, schedule, run));
    vi.stubGlobal("Worker", watching);
    act(() => {
      vi.advanceTimersByTime(took);
    });
    const { result } = renderHook(() => {
      const { futures } = useFutures(accounts, schedule, run);
      return {
        breaks: useBreaks(usePool(accounts, schedule, run), {
          futures,
          plan: run.plan,
        }),
        futures,
      };
    });
    const first = result.current.futures;
    const searchers = started.slice(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000 - took);
    });

    expect(result.current.futures).not.toBe(first);
    expect(result.current.futures).toStrictEqual(first);
    expect(result.current.breaks).toBeUndefined();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const oneLane = await breaksIn(first, run.plan, { lanes: 1, tried });
    expect({
      age: result.current.breaks?.age,
      cut: result.current.breaks?.cut,
    }).toStrictEqual({ age: oneLane.age, cut: oneLane.cut });
    expect(started).toHaveLength(3);
    expect(searchers).toHaveLength(2);
    for (const worker of searchers) {
      expect(worker.terminate).not.toHaveBeenCalled();
    }
  });
});

describe("useLastingAt", () => {
  // Each test opens a page of its own, the futures drawn from the seed
  // the engine draws from.
  beforeEach(() => {
    forget();
  });

  // £12,000 a year earned until the owner retires, as much as is spent,
  // so a year worked costs the savings nothing and retiring later lasts
  // in more of the futures.
  const earning = {
    ...schedule,
    income: [
      {
        ...incomeLines[0],
        amount: 12000,
        bonus: 0,
        feeds: null,
        growth: "nominal" as const,
        lastYear: null,
        rsu: 0,
        sacrifice: 0,
      },
    ],
  };

  // Retiring at 35 on the £30,000, of ten futures none last retiring at
  // 34, eight at 35 and all ten at 36 and 37. The search from 35 tries
  // one future at 36, which lasts and makes nine, so it leaves the eight
  // lasting at 35 open at 34, and the one it did not try open at 36 and
  // 37.
  const run = { plan: retiringAt(plan, 35), spread };

  // Where the run's ten futures break, searched a lane at a time on the
  // test's own thread, with the futures and how one is tried there.
  async function searched(): Promise<{
    readonly breaks: Breaks;
    readonly futures: readonly Future[];
    readonly tried: (trial: Trial, future: number) => Promise<boolean>;
  }> {
    const futures = futuresOf(accounts, earning, run).take(10).toArray();
    const tried = async (trial: Trial, future: number): Promise<boolean> =>
      Promise.resolve(lastsTried(accounts, earning, { ...run, future, trial }));
    const breaks = await breaksIn(futures, run.plan, { lanes: 1, tried });
    return { breaks, futures, tried };
  }

  // The count at the age given off where the run breaks, as lastingAt
  // reads it a lane at a time on the test's own thread.
  async function countAt(
    { breaks, tried }: Awaited<ReturnType<typeof searched>>,
    age: number,
  ): Promise<number> {
    return (await lastingAt(breaks.ages ?? [], age, { lanes: 1, tried }))
      .lasted;
  }

  // What the hook hands back over the breaks given, on a pool of the
  // screen's own over the run, the spread given or the run's, rendered
  // again with whichever the test gives next.
  function counting(
    breaks: Breaks | undefined,
  ): RenderHookResult<
    ReturnType<typeof useLastingAt>,
    { readonly breaks: Breaks | undefined; readonly over?: Spread }
  > {
    return renderHook(
      ({
        breaks: given,
        over = spread,
      }: {
        readonly breaks: Breaks | undefined;
        readonly over?: Spread;
      }) =>
        useLastingAt(usePool(accounts, earning, { ...run, spread: over }), {
          breaks: given,
          plan: run.plan,
        }),
      { initialProps: { breaks } },
    );
  }

  // An age given to the hook, as the card commits one.
  function give(
    result: { readonly current: ReturnType<typeof useLastingAt> },
    age: number,
  ): void {
    act(() => {
      result.current.onAge(age);
    });
  }

  async function landed(): Promise<void> {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  }

  // What each worker has been handed to try, in the order the workers
  // started and the order each was handed them.
  function trials(started: readonly Watched[]): readonly Trial[][] {
    return started.map(({ posted }) => posted.map(({ trial }) => trial));
  }

  it("counts at the plan's own age off the brackets, as the run's own lasted, starting no worker", async () => {
    const started = watchWorkers();
    const { breaks, futures } = await searched();
    const { result } = counting(breaks);

    await landed();

    expect(result.current.age).toBe(35);
    expect(result.current.lasted).toBe(readingOf(futures).lasted);
    expect(result.current.lasted).toBe(8);
    expect(started).toHaveLength(0);
  });

  it("counts another age given on two workers, each handed a future and the age alone over the plan as it was, and keeps them once it lands until the screen is taken down", async () => {
    const started = watchWorkers();
    const search = await searched();
    const before = structuredClone(run.plan);
    const { result, unmount } = counting(search.breaks);

    give(result, 34);

    expect(result.current.age).toBe(34);
    expect(result.current.lasted).toBeUndefined();
    await landed();
    expect(result.current.lasted).toBe(await countAt(search, 34));
    expect(started).toHaveLength(2);
    const posted = started.flatMap((worker) => worker.posted);
    expect(
      posted.map(({ future }) => future).toSorted((one, other) => one - other),
    ).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const { plan: on, trial } of posted) {
      expect(trial).toStrictEqual({ age: 34 });
      expect(on).toStrictEqual(run.plan);
    }
    expect(run.plan).toStrictEqual(before);
    for (const worker of started) {
      expect(worker.terminate).not.toHaveBeenCalled();
    }
    unmount();
    for (const worker of started) {
      expect(worker.terminate).toHaveBeenCalled();
      expect(worker.onmessage).toBeNull();
    }
  });

  // The count at 36 tries the one future left open there, on one worker
  // of the two it may start, and that future lasts, so it is settled at
  // 37 too.
  it("starts a worker only for a try that finds none free, reads an age counted before at once, and counts off the brackets the counts before narrowed", async () => {
    const started = watchWorkers();
    const { breaks } = await searched();
    const { result } = counting(breaks);
    give(result, 36);
    await landed();

    expect(result.current.lasted).toBe(10);
    expect(started.map(({ tried }) => tried)).toStrictEqual([[9]]);
    give(result, 37);
    await landed();
    expect(result.current.lasted).toBe(10);
    give(result, 36);
    expect(result.current.lasted).toBe(10);
    expect(started).toHaveLength(1);
  });

  // The plan's own age is read and then 34 is given before its count
  // lands, and 36 once the first two tries at 34 are back, two more on
  // their way. The one future open at 36 waits for a worker, and the
  // first back takes it; the other, with nothing waiting, is left free.
  it("drops a count's queue when another age is given, counting the newer age on the same workers and dropping what the older would land", async () => {
    const started = watchWorkers();
    const search = await searched();
    const { result } = counting(search.breaks);
    give(result, 34);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(took);
    });

    give(result, 36);

    for (const worker of started) {
      expect(worker.terminate).not.toHaveBeenCalled();
      expect(worker.onmessage).not.toBeNull();
    }
    await landed();
    expect(result.current.lasted).toBe(10);
    expect(trials(started)).toStrictEqual([
      [{ age: 34 }, { age: 34 }, { age: 36 }],
      [{ age: 34 }, { age: 34 }],
    ]);
    give(result, 35);
    expect(result.current.lasted).toBeUndefined();
    await landed();
    expect(result.current.lasted).toBe(8);
    give(result, 34);
    expect(result.current.lasted).toBeUndefined();
    await landed();
    expect(result.current.lasted).toBe(await countAt(search, 34));
    expect(started).toHaveLength(2);
  });

  // 36 is given while both workers try 34, so its one try waits for a
  // worker, and 37 before either is back: the try at 36 is never
  // posted, and the one at 37 is.
  it("posts none of a dropped count's tries still waiting for a worker", async () => {
    const started = watchWorkers();
    const { breaks } = await searched();
    const { result } = counting(breaks);
    give(result, 34);

    give(result, 36);
    give(result, 37);
    await landed();

    expect(result.current.lasted).toBe(10);
    expect(trials(started)).toStrictEqual([
      [{ age: 34 }, { age: 37 }],
      [{ age: 34 }],
    ]);
  });

  // 36 leaves one future open, its one try posted at once, and 34 is
  // given before it lands, so the count at 36 is done once it lands and
  // is neither shown nor kept: 36 given again counts afresh.
  it("keeps no count dropped whose last tries land after another age is given", async () => {
    const started = watchWorkers();
    const search = await searched();
    const { result } = counting(search.breaks);
    give(result, 36);

    give(result, 34);
    await landed();

    expect(result.current.lasted).toBe(await countAt(search, 34));
    give(result, 36);
    expect(result.current.lasted).toBeUndefined();
    await landed();
    expect(result.current.lasted).toBe(10);
    expect(
      started.flatMap(({ posted }) =>
        posted.flatMap(({ future, trial }) =>
          "age" in trial && trial.age === 36 ? [future] : [],
        ),
      ),
    ).toStrictEqual([9, 9]);
  });

  // Next hides a route navigated away from rather than taking it down,
  // which clears its effects and runs them again when it is shown, its
  // state kept.
  it("stops the pool when the screen is hidden, and counts the age given afresh on workers it starts again when shown, which serve the counts after", async () => {
    const started = watchWorkers();
    const search = await searched();
    const mode = { current: "visible" as "hidden" | "visible" };
    const { rerender, result } = renderHook(
      () =>
        useLastingAt(usePool(accounts, earning, run), {
          breaks: search.breaks,
          plan: run.plan,
        }),
      {
        wrapper: ({ children }) => (
          <Activity mode={mode.current}>{children}</Activity>
        ),
      },
    );
    give(result, 34);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(took);
    });

    mode.current = "hidden";
    rerender();

    for (const worker of started) {
      expect(worker.terminate).toHaveBeenCalled();
      expect(worker.onmessage).toBeNull();
    }
    mode.current = "visible";
    rerender();
    await landed();
    expect(result.current.age).toBe(34);
    expect(result.current.lasted).toBe(await countAt(search, 34));
    expect(started).toHaveLength(4);
    give(result, 36);
    await landed();
    expect(result.current.lasted).toBe(10);
    expect(started).toHaveLength(4);
  });

  // The run searched again hands where it breaks in a new object, as a
  // plan changed and changed back hands the run kept for it: the age
  // given, the count at 36 kept and the brackets it narrowed are all the
  // old one's, and so is the count at 34 on its way, dropped.
  it("drops the age given, every count and the brackets for where the run breaks handed afresh, dropping a count on its way, so the age reads the plan's again", async () => {
    const started = watchWorkers();
    const first = await searched();
    const again = await searched();
    const { rerender, result } = counting(first.breaks);
    give(result, 36);
    await landed();
    give(result, 34);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(took);
    });

    rerender({ breaks: again.breaks });

    expect(result.current.age).toBe(35);
    expect(result.current.lasted).toBeUndefined();
    await landed();
    expect(result.current.lasted).toBe(8);
    give(result, 36);
    expect(result.current.lasted).toBeUndefined();
    await landed();
    expect(result.current.lasted).toBe(10);
    expect(started).toHaveLength(2);
    for (const worker of started) {
      expect(worker.terminate).not.toHaveBeenCalled();
    }
  });

  // The spread handed afresh, as a plan changed hands the run in new
  // objects, while 34 is counted, two tries on their way: the count
  // starts afresh on two workers of the new run's.
  it("stops the pool for a run changed, the next try starting workers of the new run's own", async () => {
    const started = watchWorkers();
    const search = await searched();
    const { rerender, result } = counting(search.breaks);
    give(result, 34);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(took);
    });

    rerender({ breaks: search.breaks, over: { ...spread } });

    const [old, older, ...fresh] = started;
    for (const worker of [old, older]) {
      expect(worker?.terminate).toHaveBeenCalled();
      expect(worker?.onmessage).toBeNull();
    }
    expect(fresh).toHaveLength(2);
    await landed();
    expect(result.current.lasted).toBe(await countAt(search, 34));
    expect(started).toHaveLength(4);
    for (const worker of fresh) {
      expect(worker.terminate).not.toHaveBeenCalled();
    }
  });

  it("counts nothing, starting no worker, before the run is searched or where its age is not", async () => {
    const started = watchWorkers();
    const { rerender, result } = counting(undefined);
    await landed();

    expect(result.current.age).toBe(35);
    expect(result.current.lasted).toBeUndefined();
    rerender({ breaks: { cut: 3, cuts: [] } });
    await landed();
    expect(result.current.lasted).toBeUndefined();
    expect(started).toHaveLength(0);
  });

  it("stops the workers when the screen is taken down part way", async () => {
    const started = watchWorkers();
    const { breaks } = await searched();
    const { result, unmount } = counting(breaks);
    give(result, 34);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(took);
    });

    unmount();

    expect(started).toHaveLength(2);
    for (const worker of started) {
      expect(worker.terminate).toHaveBeenCalled();
      expect(worker.onmessage).toBeNull();
    }
  });

  // The card's search of the run, drawn by a screen left open on one
  // worker, and the age tried there, on one pool, as the card reads
  // them: the count at 34 is posted to the search's two workers.
  it("shares one pool with the search, counting on the search's workers and starting none of its own", async () => {
    const started = watchWorkers();
    const drawing = { ...run, count: 10 };
    const { result: drawn } = renderHook(() =>
      useFutures(accounts, earning, drawing),
    );
    act(() => {
      vi.runAllTimers();
    });
    const { futures } = drawn.current;
    const { result } = renderHook(() => {
      const pool = usePool(accounts, earning, run);
      const breaks = useBreaks(pool, { futures, plan: run.plan });
      return { breaks, tried: useLastingAt(pool, { breaks, plan: run.plan }) };
    });
    await landed();
    expect(result.current.breaks).toBeDefined();
    expect(started).toHaveLength(3);

    give({ current: result.current.tried }, 34);
    await landed();

    const tried = async (trial: Trial, future: number): Promise<boolean> =>
      Promise.resolve(lastsTried(accounts, earning, { ...run, future, trial }));
    expect(result.current.tried.lasted).toBe(
      (
        await lastingAt(result.current.breaks?.ages ?? [], 34, {
          lanes: 1,
          tried,
        })
      ).lasted,
    );
    expect(started).toHaveLength(3);
    for (const worker of started.slice(1)) {
      expect(
        worker.posted.some(({ trial }) => "age" in trial && trial.age === 34),
      ).toBe(true);
      expect(worker.terminate).not.toHaveBeenCalled();
    }
  });
});
