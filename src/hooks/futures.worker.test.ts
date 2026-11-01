// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { Slice, Tried } from "@/hooks/futures.worker";

import { expenseLines } from "@/data/expenses.fixture";
import { working } from "@/data/owners.fixture";
import { futuresOf } from "@/engine/futures";

// What the worker adds to hear what it is handed.
type Listener = (event: { readonly data: Slice | Tried }) => void;

// An ISA drawn £1,000 a month over three years at 5%, straying 15% a
// year.
const run = {
  plan: {
    born: 1992,
    from: 2026,
    inflation: 0.02,
    month: 0,
    owners: [working],
    rate: 0.05,
    retires: 92,
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
  // it. Five futures from the run's third are its third to its seventh,
  // drawn from the seed the slice gives; and the run's fourth future,
  // £30,000 spent £1,000 a month for three years, lasts on half of it
  // and falls short on half as much again.
  it("answers a slice of a run with the futures the run holds there, and a future tried with whether it lasts so", async () => {
    const listeners: Listener[] = [];
    const posted = vi.fn();
    vi.stubGlobal("addEventListener", (_type: string, listener: Listener) => {
      listeners.push(listener);
    });
    vi.stubGlobal("postMessage", posted);
    await import("./futures.worker");

    for (const listener of listeners) {
      listener({
        data: { ...run, accounts, count: 5, from: 2, schedule, seed: 7 },
      });
      for (const cut of [50, -50]) {
        listener({
          data: {
            ...run,
            accounts,
            future: 3,
            schedule,
            seed: 7,
            trial: { cut },
          },
        });
      }
    }

    expect(posted.mock.calls).toStrictEqual([
      [
        futuresOf(accounts, schedule, { ...run, seed: 7 })
          .take(7)
          .toArray()
          .slice(2),
      ],
      [true],
      [false],
    ]);
  });
});
