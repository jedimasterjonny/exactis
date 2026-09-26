import { useState } from "react";

import type { Answer } from "@/lib/answer";

import { useSender } from "@/hooks/use-sender";

// An open dialog: the draft as it is, the draft as it opened, which the
// uncontrolled fields take as their defaults, and the id of the record it
// edits, or null for a new one. An editor holds one or none, so the entry
// doubles as the dialog's open state.
export interface Entry<TDraft> {
  readonly draft: TDraft;
  readonly id: null | number;
  readonly initial: TDraft;
}

// What a caller that opens from a row gets back: the entry it renders
// the dialog on, the four things that move it, and whether a save is in
// flight, which is what holds the save button.
interface Editor<TDraft> extends MountedEditor<TDraft> {
  readonly dismiss: () => void;
  readonly open: (draft: TDraft, id: null | number) => void;
}

// What the editor is given: the store action a save goes to, the noun the
// toast reports under, how to describe what came back, given what was
// sent, since a record may not say what the draft did, and anything
// else the caller does with the record it wrote.
interface EditorProps<TDraft, TSaved> {
  readonly describe: (saved: TSaved, values: TDraft) => string;
  readonly noun: string;
  readonly onSaved?: (saved: TSaved) => void;
  readonly save: (id: null | number, values: TDraft) => Promise<Answer<TSaved>>;
}

// What the edit dialog is handed for an entry, which every editor's
// dialog was handed the same way: the eyebrow saying whether the record
// is new or edited, in the noun the toasts carry, whether a save is on
// its way, and the save of the entry.
interface EntryDialog {
  readonly eyebrow: string;
  readonly isSaving: boolean;
  readonly onSave: () => void;
}

// What a dialog open for as long as it is mounted gets back: the same,
// less the two it cannot use, since it is opened by being rendered and
// closed by being dropped.
interface MountedEditor<TDraft> {
  readonly amend: (current: Entry<TDraft>, patch: Partial<TDraft>) => void;
  readonly dialogOf: (current: Entry<TDraft>) => EntryDialog;
  readonly entry: Entry<TDraft> | null;
  readonly isSaving: boolean;
  readonly save: (current: Entry<TDraft>) => void;
}

// What such a dialog is given besides: the entry it opens on, which is
// required rather than optional. An editor that started closed would
// leave the dialog rendering nothing at all, which is a dead button and
// no error, so the type asks for it rather than defaulting.
interface MountedEditorProps<TDraft, TSaved> extends EditorProps<
  TDraft,
  TSaved
> {
  readonly opening: Entry<TDraft>;
}

// The entry every editor's dialog is opened, amended, dismissed and saved
// through, which the account ledger and the two schedules each held a
// copy of. What differs between them is not the machine but what it is
// pointed at: the draft is the caller's shape, named, since a save trims
// the name; the action is the caller's, as are the words the toast
// carries; and the account dialog brings a tab forward as it closes,
// which is what onSaved is for. What stays the caller's entirely is the
// fields, what a blank draft opens as, and what each choice does to it,
// all of which amend from here. A dialog that is open for as long as it
// is mounted opens on the entry it was mounted with rather than on a
// later call, so the first render has the fields it will show.
export function useEditor<TDraft extends { readonly name: string }, TSaved>(
  props: EditorProps<TDraft, TSaved>,
): Editor<TDraft> {
  return useEntry(props, null);
}

// The same machine for a dialog that is open for as long as it is
// mounted: it opens on the entry it was mounted with, so the first
// render has the fields it will show, and it never opens or dismisses
// itself, since the caller renders it while it holds something to edit
// and drops it otherwise. The opening is required, which is the whole
// point of the second entry point: a caller that forgot it would render
// nothing and say nothing about why.
export function useMountedEditor<
  TDraft extends { readonly name: string },
  TSaved,
>(props: MountedEditorProps<TDraft, TSaved>): MountedEditor<TDraft> {
  const { amend, dialogOf, entry, isSaving, save } = useEntry(
    props,
    props.opening,
  );
  return { amend, dialogOf, entry, isSaving, save };
}

// What both entry points are: the state, and the four or six things
// that move it. The entry it starts on is the only difference between
// them.
function useEntry<TDraft extends { readonly name: string }, TSaved>(
  { describe, noun, onSaved, save: store }: EditorProps<TDraft, TSaved>,
  opening: Entry<TDraft> | null,
): Editor<TDraft> {
  const [entry, setEntry] = useState<Entry<TDraft> | null>(opening);
  const { isSending: isSaving, send } = useSender();

  function amend(current: Entry<TDraft>, patch: Partial<TDraft>): void {
    setEntry({ ...current, draft: { ...current.draft, ...patch } });
  }

  // What the edit dialog is handed for the entry: "New income line" or
  // "Edit income line" above the title, the save held while one is on
  // its way, and the save.
  function dialogOf(current: Entry<TDraft>): EntryDialog {
    return {
      eyebrow: `${current.id === null ? "New" : "Edit"} ${noun.toLowerCase()}`,
      isSaving,
      onSave: (): void => {
        save(current);
      },
    };
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
  // the caller makes of the record. A store that refuses, or fails,
  // leaves the dialog open as it was, with the save free again, and the
  // sender says why.
  function save(current: Entry<TDraft>): void {
    const values = { ...current.draft, name: current.draft.name.trim() };
    send(async () => store(current.id, values), {
      failure: `${noun} not saved`,
      onAccepted: (record) => {
        onSaved?.(record);
        setEntry(null);
      },
      success: (record) => ({
        description: describe(record, values),
        title: `${noun} ${current.id === null ? "added" : "updated"}`,
      }),
    });
  }

  return { amend, dialogOf, dismiss, entry, isSaving, open, save };
}
