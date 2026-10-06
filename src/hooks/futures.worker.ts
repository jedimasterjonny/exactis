import type { Account } from "@/data/accounts";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";

import { futuresOf } from "@/engine/futures";

// A slice of a run of the plan's futures, as a worker is handed one:
// what the run is drawn over, the accounts, the lines, the plan and the
// spread its rates carry, with the place in the run the slice starts
// at and how many futures it holds.
export interface Slice {
  readonly accounts: readonly Account[];
  readonly count: number;
  readonly from: number;
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly spread: Spread;
}

// A worker drawing the plan's futures off the page's thread: handed a
// slice of a run, it draws the futures the run holds there and hands
// them back, in the order the run holds them. What it is handed is
// typed rather than parsed: it is the page's own values, typed where
// the page posted them and copied across whole, not anything from
// outside the app.
addEventListener("message", ({ data }: MessageEvent<Slice>) => {
  const stream = futuresOf(data.accounts, data.schedule, data);
  postMessage(Array.from({ length: data.count }, () => stream.next().value));
});
