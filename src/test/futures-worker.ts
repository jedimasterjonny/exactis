import { vi } from "vitest";

import type { Future } from "@/engine/futures";
import type { Slice, Tried } from "@/hooks/futures.worker";

import { futuresOf, lastsTried } from "@/engine/futures";

// jsdom has no Worker, and the one worker the app starts draws a slice
// of a run of futures or tries one future again, so this stands in for
// it on the test's own thread: what is posted to it is answered as the
// worker answers it and handed back on a later turn, as a worker's
// answer is. An answer on its way lands whether or not the worker has
// been terminated since, as a real worker's may, and only a handler
// taken off hears nothing of it. It answers on the next turn unless a
// test gives it longer to take.
export class FuturesWorker {
  public onmessage:
    ((event: { readonly data: boolean | readonly Future[] }) => void) | null =
    null;

  public readonly terminate = vi.fn();

  protected readonly took: number = 0;

  public postMessage(posted: Slice | Tried): void {
    setTimeout(() => {
      this.onmessage?.({
        data:
          "trial" in posted
            ? lastsTried(posted.accounts, posted.schedule, posted)
            : futuresOf(posted.accounts, posted.schedule, posted)
                .take(posted.count)
                .toArray(),
      });
    }, this.took);
  }
}

// Stands the test's workers in for the browser's: the Worker global as
// the stand-in given, this one unless another is, in a browser saying it
// has two cores, so how many workers a run is drawn on, and which slices
// each is handed, is the test's to say rather than the host's.
export function stubWorkers(
  worker: typeof FuturesWorker = FuturesWorker,
): void {
  vi.stubGlobal("Worker", worker);
  vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(2);
}
