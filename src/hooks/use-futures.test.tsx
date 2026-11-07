import { act, renderHook } from "@testing-library/react";
import { Activity } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Breaks, Future, Trial } from "@/engine/futures";
import type { Slice, Tried } from "@/hooks/futures.worker";

import { expenseLines } from "@/data/expenses.fixture";
import { retiringAt } from "@/data/milestones";
import { working } from "@/data/owners.fixture";
import { breaksIn, futuresOf, lastingAt, lastsTried } from "@/engine/futures";
import { FuturesWorker } from "@/test/futures-worker";

import { drawAgain, forget, useBreaks, useFutures } from "./use-futures";

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
// and of each future it is handed to try, and takes a while over each.
class Watched extends FuturesWorker {
  public readonly handed: number[] = [];

  public readonly tried: number[] = [];

  protected override readonly took = took;

  public override postMessage(posted: Slice | Tried): void {
    if ("trial" in posted) {
      this.tried.push(posted.future);
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

  // Ten futures to the slice, the run is one slice on one worker, and
  // the search starts two more, each handed one future at a time; the
  // household's run beside it, five futures on a worker of its own, is
  // left unsearched. The two find the figures one lane finds, in
  // brackets of their own, since which future lands first is the
  // workers', and the count at an age off either is the same.
  it("searches a run drawn whole for where it breaks on two workers trying a future at a time, and keeps it with that run alone", async () => {
    const started = watchWorkers();
    const household = { count: 5, plan, spread };
    const { result: other } = renderHook(() =>
      useFutures(accounts, schedule, household),
    );
    const futures = drawn();
    const searched = { ...run, futures };
    const { result, unmount } = renderHook(() =>
      useBreaks(accounts, schedule, searched),
    );

    expect(result.current).toBeUndefined();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const tried = async (trial: Trial, future: number): Promise<boolean> =>
      Promise.resolve(
        lastsTried(accounts, schedule, { ...run, future, trial }),
      );
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
    const [, , ...searching] = started;
    expect(searching).toHaveLength(2);
    for (const worker of searching) {
      expect(worker.tried.length).toBeGreaterThan(0);
      expect(worker.terminate).toHaveBeenCalled();
    }
    unmount();
    const { result: again } = renderHook(() =>
      useBreaks([{ ...isa }], { ...schedule }, { ...searched }),
    );
    expect(again.current).toStrictEqual(result.current);
    expect(started).toHaveLength(4);
    expect(
      renderHook(() =>
        useBreaks(accounts, schedule, {
          ...household,
          futures: other.current.futures,
        }),
      ).result.current,
    ).toBeUndefined();
  });

  // Taken down after the first two tries are back, others on their way.
  it("stops the workers when the screen is taken down part way, and searches afresh when shown again", () => {
    const started = watchWorkers();
    const searched = { ...run, futures: drawn() };
    const { unmount } = renderHook(() =>
      useBreaks(accounts, schedule, searched),
    );
    act(() => {
      vi.advanceTimersByTime(took);
    });

    unmount();

    const [, ...searching] = started;
    for (const worker of searching) {
      expect(worker.terminate).toHaveBeenCalled();
      expect(worker.onmessage).toBeNull();
    }
    const { result } = renderHook(() =>
      useBreaks(accounts, schedule, searched),
    );
    act(() => {
      vi.advanceTimersByTime(took);
    });
    expect(result.current).toBeUndefined();
    expect(started).toHaveLength(5);
  });

  // A worker taking a minute over what it is handed.
  class Late extends FuturesWorker {
    protected override readonly took = 60000;
  }

  // Two screens read the one run, the second's worker a minute over the
  // slice the first's draws in 150 ms, and a third, opened once the run
  // is drawn, searches it. The second's slice lands after the search,
  // handing the run over again, and where it breaks is kept with it, so
  // the third reads it still and searches nothing again.
  it("keeps where a run breaks when another screen hands the run over after the search", async () => {
    const started = watchWorkers();
    const watching = globalThis.Worker;
    renderHook(() => useFutures(accounts, schedule, run));
    vi.stubGlobal("Worker", Late);
    renderHook(() => useFutures(accounts, schedule, run));
    vi.stubGlobal("Worker", watching);
    act(() => {
      vi.advanceTimersByTime(took);
    });
    const { result } = renderHook(() => {
      const { futures } = useFutures(accounts, schedule, run);
      return useBreaks(accounts, schedule, { ...run, futures });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    const breaks = result.current;
    const searching = started.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(breaks).toBeDefined();
    expect(result.current).toStrictEqual(breaks);
    expect(started).toHaveLength(searching);
  });
});
