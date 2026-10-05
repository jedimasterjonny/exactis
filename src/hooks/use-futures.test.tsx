import { act, renderHook, waitFor } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { expenseLines } from "@/data/expenses.fixture";
import { futuresOf } from "@/engine/futures";

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

describe("useFutures", () => {
  // Each look at the clock moves it 5 ms on, so a future takes 5 ms and
  // a slice draws one or two, stopping before one would end past it, and
  // the screen is handed what has been drawn once 200 ms have passed,
  // well before the run is done.
  it("draws the plan's futures a slice at a time, handing them over as they come in, and says when it has drawn them all", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 5));
    const run = { count: 60, plan, spread };
    const { result } = renderHook(() => useFutures(accounts, schedule, run));

    expect(result.current).toStrictEqual({ futures: [], isDone: false });
    act(() => {
      vi.advanceTimersToNextTimer();
    });
    expect(result.current.futures).toStrictEqual([]);
    while (result.current.futures.length === 0) {
      act(() => {
        vi.advanceTimersToNextTimer();
      });
    }
    expect(result.current.isDone).toBe(false);
    expect(result.current.futures.length).toBeLessThan(60);
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current).toStrictEqual({
      futures: futuresOf(accounts, schedule, run).take(60).toArray(),
      isDone: true,
    });
  });

  it("drops what was drawn for a plan changed part way, and draws the new one's", async () => {
    const changed = { ...plan, rate: 0.08 };
    const { rerender, result } = renderHook(
      ({ drawnFor }) =>
        useFutures(accounts, schedule, { count: 25, plan: drawnFor, spread }),
      { initialProps: { drawnFor: plan } },
    );
    await waitFor(() => {
      expect(result.current.isDone).toBe(true);
    });

    rerender({ drawnFor: changed });

    expect(result.current).toStrictEqual({ futures: [], isDone: false });
    await waitFor(() => {
      expect(result.current.isDone).toBe(true);
    });
    expect(result.current.futures).toStrictEqual(
      futuresOf(accounts, schedule, { plan: changed, spread })
        .take(25)
        .toArray(),
    );
  });

  // Next hides a route navigated away from rather than taking it down,
  // which clears its effects and runs them again when it is shown; a run
  // done before it was hidden is still done, with nothing left to draw.
  it("is still done when the screen is hidden and shown again, drawing nothing more", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const mode = { current: "visible" as "hidden" | "visible" };
    const run = { count: 25, plan, spread };
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

    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.futures).toHaveLength(25);
    expect(result.current.isDone).toBe(true);
  });

  // Hidden part way, once two lots have been handed over, the run
  // carries on from where it stood when shown again, so the next lot
  // handed over holds more rather than starting over, and it ends on the
  // same futures.
  it("carries a run hidden part way on from where it stood when shown again", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 5));
    const mode = { current: "visible" as "hidden" | "visible" };
    const run = { count: 60, plan, spread };
    const { rerender, result } = renderHook(
      () => useFutures(accounts, schedule, run),
      {
        wrapper: ({ children }) => (
          <Activity mode={mode.current}>{children}</Activity>
        ),
      },
    );
    for (const handedOver of [0, 1]) {
      const was = result.current.futures.length;
      while (result.current.futures.length === was) {
        act(() => {
          vi.advanceTimersToNextTimer();
        });
      }
      expect(result.current.futures.length).toBeGreaterThan(handedOver);
    }
    const before = result.current.futures.length;

    mode.current = "hidden";
    rerender();
    mode.current = "visible";
    rerender();
    while (result.current.futures.length === before) {
      act(() => {
        vi.advanceTimersToNextTimer();
      });
    }

    expect(result.current.futures.length).toBeGreaterThan(before);
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.futures).toStrictEqual(
      futuresOf(accounts, schedule, run).take(60).toArray(),
    );
  });

  it("stops the run when the screen is taken down", () => {
    const stopped = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = renderHook(() =>
      useFutures(accounts, schedule, { count: 25, plan, spread }),
    );

    unmount();

    expect(stopped).toHaveBeenCalled();
  });

  it("is done at once with nothing to draw", async () => {
    const { result } = renderHook(() =>
      useFutures(accounts, schedule, { count: 0, plan, spread }),
    );

    expect(result.current).toStrictEqual({ futures: [], isDone: true });
    await waitFor(() => {
      expect(result.current.futures).toStrictEqual([]);
    });
  });
});
