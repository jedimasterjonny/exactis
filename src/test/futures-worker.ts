import { vi } from "vitest";

import type { Future } from "@/engine/futures";
import type { Slice } from "@/hooks/futures.worker";

import { futuresOf } from "@/engine/futures";

// jsdom has no Worker, and the one worker the app starts draws a slice
// of a run of futures, so this stands in for it on the test's own
// thread: a slice posted to it is drawn as the worker draws it and
// handed back on a later turn, as a worker's answer is. An answer on its
// way lands whether or not the worker has been terminated since, as a
// real worker's may, and only a handler taken off hears nothing of it.
// It answers on the next turn unless a test gives it longer to take.
export class FuturesWorker {
  public onmessage:
    ((event: { readonly data: readonly Future[] }) => void) | null = null;

  public readonly terminate = vi.fn();

  protected readonly took: number = 0;

  public postMessage(slice: Slice): void {
    setTimeout(() => {
      this.onmessage?.({
        data: futuresOf(slice.accounts, slice.schedule, slice)
          .take(slice.count)
          .toArray(),
      });
    }, this.took);
  }
}
