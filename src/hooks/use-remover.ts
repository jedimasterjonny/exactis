import { useState } from "react";

import type { Answer } from "@/lib/answer";

import { useSender } from "@/hooks/use-sender";

// What the confirm dialog is handed for the record asked about, which
// every bin's was handed the same way: the title asking whether to
// delete it, by the words the toast describes it in, whether the
// deletion is on its way, and the two answers.
interface Question {
  readonly isBusy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
}

// What the caller gets back: the record the question is open on, which a
// screen holds one or none of, so it doubles as the confirm dialog's open
// state; the ask that opens it; and the question the dialog is handed,
// which carries the answers that close it and whether a deletion is in
// flight, which is what holds the confirm.
interface Remover<TDoomed> {
  readonly ask: (doomed: TDoomed) => void;
  readonly doomed: null | TDoomed;
  readonly questionOf: (current: TDoomed) => Question;
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
// caller's, as are the words the toast carries. The question is asked
// the same way of every record, "Delete" and the record as the toast
// describes it, but what stays the caller's is the sentence beneath it,
// which says what goes with the record, since what goes with an account
// is not what goes with an income line. Cancel and confirm are its words
// rather than the editor's dismiss and save, because the dialog they
// drive says Cancel and Delete.
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

  // What the confirm dialog is handed for the record: "Delete Lifetime
  // ISA?", the confirm held while the deletion is on its way, and the
  // two answers. What goes with the record stays the caller's to say.
  function questionOf(current: TDoomed): Question {
    return {
      isBusy: isRemoving,
      onCancel: cancel,
      onConfirm: (): void => {
        confirm(current);
      },
      title: `Delete ${describe(current)}?`,
    };
  }

  return { ask, doomed, questionOf };
}
