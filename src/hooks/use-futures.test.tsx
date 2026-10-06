import { act, renderHook } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Slice } from "@/hooks/futures.worker";

import { expenseLines } from "@/data/expenses.fixture";
import { futuresOf } from "@/engine/futures";
import { FuturesWorker } from "@/test/futures-worker";

import { useFutures } from "./use-futures";

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
