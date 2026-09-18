import { startTransition, useState, useTransition } from "react";

import { toast } from "@/components/kit/toast";

// An open dialog: the draft as it is, the draft as it opened, which the
// uncontrolled fields take as their defaults, and the id of the record it
// edits, or null for a new one. An editor holds one or none, so the entry
// doubles as the dialog's open state.
export interface Entry<TDraft> {
  readonly draft: TDraft;
  readonly id: null | number;
  readonly initial: TDraft;
}

// What the caller gets back: the entry it renders the dialog on, the
// four things that move it, and whether a save is in flight, which is
// what holds the save button.
interface Editor<TDraft> {
  readonly amend: (current: Entry<TDraft>, patch: Partial<TDraft>) => void;
  readonly dismiss: () => void;
  readonly entry: Entry<TDraft> | null;
  readonly isSaving: boolean;
  readonly open: (draft: TDraft, id: null | number) => void;
  readonly save: (current: Entry<TDraft>) => void;
}

// What the editor is given: the store action a save goes to, the noun the
// toast reports under, how to describe what came back, and anything else
// the caller does with the record it wrote.
interface EditorProps<TDraft, TSaved> {
  readonly describe: (saved: TSaved) => string;
  readonly noun: string;
  readonly onSaved?: (saved: TSaved) => void;
  readonly save: (id: null | number, values: TDraft) => Promise<TSaved>;
}

// The entry every editor's dialog is opened, amended, dismissed and saved
// through, which the account ledger and the two schedules each held a
// copy of. What differs between them is not the machine but what it is
// pointed at: the draft is the caller's shape, named, since a save trims
// the name; the action is the caller's, as are the words the toast
// carries; and the ledger brings a tab forward as it closes, which is
// what onSaved is for. What stays the caller's entirely is the fields,
// what a blank draft opens as, and what each choice does to it, all of
// which amend from here.
export function useEditor<TDraft extends { readonly name: string }, TSaved>({
  describe,
  noun,
  onSaved,
  save: store,
}: EditorProps<TDraft, TSaved>): Editor<TDraft> {
  const [entry, setEntry] = useState<Entry<TDraft> | null>(null);
  const [isSaving, startSaving] = useTransition();

  function amend(current: Entry<TDraft>, patch: Partial<TDraft>): void {
    setEntry({ ...current, draft: { ...current.draft, ...patch } });
  }

  function dismiss(): void {
    setEntry(null);
  }

  function open(draft: TDraft, id: null | number): void {
    setEntry({ draft, id, initial: draft });
  }

  // The name is saved as typed less the space around it, which is what
  // the title shows and what save waited for. The dialog stays open with
  // its save held until the store answers, then closes, onto whatever
  // the caller makes of the record; the close is a transition of its
  // own, since a state update after an await is not part of the one it
  // awaited in.
  function save(current: Entry<TDraft>): void {
    const values = { ...current.draft, name: current.draft.name.trim() };
    startSaving(async () => {
      const record = await store(current.id, values);
      startTransition(() => {
        onSaved?.(record);
        setEntry(null);
      });
      toast.add({
        description: describe(record),
        title: `${noun} ${current.id === null ? "added" : "updated"}`,
        type: "success",
      });
    });
  }

  return { amend, dismiss, entry, isSaving, open, save };
}
