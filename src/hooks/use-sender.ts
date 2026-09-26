import { startTransition, useTransition } from "react";

import type { Answer } from "@/lib/answer";

import { toast } from "@/components/kit/toast";
import { acceptedOf } from "@/lib/answer";
import { reasonOf } from "@/lib/errors";

// What the caller gets back: whether a call is on its way to the store,
// which is what holds a save or a confirm, and the one way to send one.
interface Sender {
  readonly isSending: boolean;
  readonly send: <TValue>(
    call: () => Promise<Answer<TValue>>,
    sent: Sent<TValue>,
  ) => void;
}

// What a call is sent with: the title the toast says it was not done
// under; what lands once the store accepts it, given what the store
// answered with, and what lands once it does not; and what the toast
// says was done, or nothing for a call whose landing says so itself.
interface Sent<TValue> {
  readonly failure: string;
  readonly onAccepted?: (value: TValue) => void;
  readonly onRejected?: () => void;
  readonly success?: (value: TValue) => Toasted;
}

// What a toast says: a title, and the line beneath it.
interface Toasted {
  readonly description: string;
  readonly title: string;
}

// The one way a screen sends a call to the store and hears back, which
// the editor, the remover, the balances month, the assumptions and the
// retirement age each held a copy of. What differs between them is not
// the machine but what it is pointed at: the call is the caller's, as
// are the words the toasts carry and what lands with either answer, a
// dialog closing or a draft dropped. The call runs inside the
// transition, so an optimistic update made in it is held until the
// store answers. What lands is a transition of its own, since a state
// update after an await is not part of the one it awaited in. A store
// that refuses, or fails, leaves everything as it was, save what the
// caller drops, and says why under a toast, a refusal in its own words:
// a rejection left to the transition would reach the nearest error
// boundary, which is the route's, and take the whole screen with it.
export function useSender(): Sender {
  const [isSending, startSending] = useTransition();

  function send<TValue>(
    call: () => Promise<Answer<TValue>>,
    { failure, onAccepted, onRejected, success }: Sent<TValue>,
  ): void {
    startSending(async () => {
      try {
        const value = acceptedOf(await call());
        if (onAccepted !== undefined) {
          startTransition(() => {
            onAccepted(value);
          });
        }
        if (success !== undefined) {
          toast.add({ ...success(value), type: "success" });
        }
      } catch (error: unknown) {
        if (onRejected !== undefined) {
          startTransition(onRejected);
        }
        toast.add({
          description: reasonOf(error),
          title: failure,
          type: "error",
        });
      }
    });
  }

  return { isSending, send };
}
