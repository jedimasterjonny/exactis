// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { Slice } from "@/hooks/futures.worker";

import { expenseLines } from "@/data/expenses.fixture";
import { futuresOf } from "@/engine/futures";

// What the worker adds to hear a slice it is handed.
type Listener = (event: { readonly data: Slice }) => void;

// An ISA drawn £1,000 a month over three years at 5%, straying 15% a
// year.
const run = {
  plan: {
    born: 1990,
    from: 2026,
    inflation: 0.02,
    month: 0,
    rate: 0.05,
    retires: 90,
    years: 3,
  },
  spread: { inflation: 0.02, rate: 0.15 },
};

const accounts: Slice["accounts"] = [
  {
    balance: 30000,
    growth: { kind: "plan" },
    id: 1,
    kind: "tax-free",
    name: "ISA",
    owner: 1,
  },
];

const schedule: Slice["schedule"] = {
  expenses: [{ ...expenseLines[0], amount: 1000, growth: "nominal" }],
  income: [],
};

describe("futures.worker", () => {
  // The worker's scope is stood in for by the two globals it reaches:
  // the listener it adds is kept, and called as a message would call
  // it. Five futures from the run's third are its third to its seventh.
  it("answers a slice of a run with the futures the run holds there", async () => {
    const listeners: Listener[] = [];
    const posted = vi.fn();
    vi.stubGlobal("addEventListener", (_type: string, listener: Listener) => {
      listeners.push(listener);
    });
    vi.stubGlobal("postMessage", posted);
    await import("./futures.worker");

    for (const listener of listeners) {
      listener({ data: { ...run, accounts, count: 5, from: 2, schedule } });
    }

    expect(posted.mock.calls).toStrictEqual([
      [futuresOf(accounts, schedule, run).take(7).toArray().slice(2)],
    ]);
  });
});
