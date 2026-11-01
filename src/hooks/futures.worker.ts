import type { Account } from "@/data/accounts";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Trial } from "@/engine/futures";

import { futuresOf, lastsTried } from "@/engine/futures";

// A slice of a run of the plan's futures, as a worker is handed one:
// what the run is drawn over, the accounts, the lines, the plan and the
// spread its rates carry, with the place in the run the slice starts
// at, how many futures it holds, and the seed the run is drawn from.
export interface Slice {
  readonly accounts: readonly Account[];
  readonly count: number;
  readonly from: number;
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly seed: number;
  readonly spread: Spread;
}

// One future of a run tried again, as a worker is handed one in the
// search for where the run breaks: what the run is drawn over and its
// seed, as a slice holds them, with the future's place in the run and
// what it is tried at.
export interface Tried extends Omit<Slice, "count" | "from"> {
  readonly future: number;
  readonly trial: Trial;
}

// A worker drawing the plan's futures off the page's thread: handed a
// slice of a run, it draws the futures the run holds there and hands
// them back, in the order the run holds them, and handed a future to
// try, whether it lasts so. What it is handed is typed rather than
// parsed: it is the page's own values, typed where the page posted them
// and copied across whole, not anything from outside the app.
addEventListener("message", ({ data }: MessageEvent<Slice | Tried>) => {
  if ("trial" in data) {
    postMessage(lastsTried(data.accounts, data.schedule, data));
    return;
  }
  const stream = futuresOf(data.accounts, data.schedule, data);
  postMessage(Array.from({ length: data.count }, () => stream.next().value));
});
