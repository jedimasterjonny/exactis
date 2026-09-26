import { useState } from "react";

import type { Answer } from "@/lib/answer";

import { useSender } from "@/hooks/use-sender";

// What the caller gets back: the record the question is open on, which a
// screen holds one or none of, so it doubles as the confirm dialog's open
// state; the three things that move it; and whether a deletion is in
// flight, which is what holds the confirm.
interface Remover<TDoomed> {
  readonly ask: (doomed: TDoomed) => void;
  readonly cancel: () => void;
  readonly confirm: (current: TDoomed) => void;
  readonly doomed: null | TDoomed;
  readonly isRemoving: boolean;
}

// What the remover is given: the store action a deletion goes to, the
// noun the toast reports under, and how to describe what went.
interface RemoverProps<TDoomed> {
  readonly describe: (doomed: TDoomed) => string;
  readonly noun: string;
  readonly remove: (id: number) => Promise<Answer<undefined>>;
}

// The question every bin asks through, which the account ledger and the
// income schedule each held a copy of, as they held a copy of the editor
// before it. What differs between them is not the machine but what it is
// pointed at: the record is the caller's shape, constrained only to have
// an id, since the id is all the store is sent; the action is the
// caller's, as are the words the toast carries. What stays the caller's
// is the question itself, since the dialog's title names the record and
// its sentence says what goes with it, and what goes with an account is
// not what goes with an income line. Cancel and confirm are its words
// rather than the editor's dismiss and save, because the dialog they
// drive says Cancel and Delete, and because an organism holding both
// hooks would otherwise have two dismisses to tell apart.
export function useRemover<TDoomed extends { readonly id: number }>({
  describe,
  noun,
  remove: store,
}: RemoverProps<TDoomed>): Remover<TDoomed> {
  const [doomed, setDoomed] = useState<null | TDoomed>(null);
  const { isSending: isRemoving, send } = useSender();

  function ask(next: TDoomed): void {
    setDoomed(next);
  }

  function cancel(): void {
    setDoomed(null);
  }

  // What the dialog asked about goes to the store by its id. The question
  // stays open with its confirm held until the store answers, then
  // closes, and the page re-read takes the row with it. What the toast
  // says went is described from the record asked about rather than from
  // anything the store answers with, since a deletion answers with
  // nothing. A store that refuses, or fails, leaves the question open as
  // it was, with the confirm free again, and the sender says why.
  function confirm(current: TDoomed): void {
    send(async () => store(current.id), {
      failure: `${noun} not deleted`,
      onAccepted: () => {
        setDoomed(null);
      },
      success: () => ({
        description: describe(current),
        title: `${noun} deleted`,
      }),
    });
  }

  return { ask, cancel, confirm, doomed, isRemoving };
}
