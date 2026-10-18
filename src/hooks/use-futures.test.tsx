import { act, renderHook } from "@testing-library/react";
import { Activity } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Slice } from "@/hooks/futures.worker";

import { expenseLines } from "@/data/expenses.fixture";
import { working } from "@/data/owners.fixture";
import { futuresOf } from "@/engine/futures";
import { FuturesWorker } from "@/test/futures-worker";

import { drawAgain, forget, useFutures } from "./use-futures";

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
  born: 1990,
  from: 2026,
  inflation: 0.02,
  month: 0,
  owners: [working],
  rate: 0.05,
  retires: 90,
  years: 3,
};

const spread = { inflation: 0.02, rate: 0.15 };

// How long a worker takes over a slice, in milliseconds: under the 200
// the screen is handed what has come back at most every.
const took = 150;

// A worker that keeps the place in the run of each slice it is handed,
// and takes a while over each.
class Watched extends FuturesWorker {
  public readonly handed: number[] = [];

  protected override readonly took = took;

  public override postMessage(slice: Slice): void {
    this.handed.push(slice.from);
    super.postMessage(slice);
  }
}

// The workers the hook starts, in the order it starts them, on a clock
// faked so a test says when each slice lands.
function watchWorkers(): readonly Watched[] {
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
