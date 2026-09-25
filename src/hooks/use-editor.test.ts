import type { Mock } from "vitest";

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Answer } from "@/lib/answer";

import { toast } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";

import { useEditor, useMountedEditor } from "./use-editor";

// The toast is the hook's one output that is not the entry, and a
// manager mounted for a hook with no tree of its own would be a Toaster
// rendered to read one call. The organisms mount it and read the toast
// as a dialog; here the call is the assertion.
vi.mock("@/components/kit/toast", () => ({ toast: { add: vi.fn() } }));

// A draft of the shape every editor's is: named, since a save trims the
// name, with one figure of its own beside it.
interface Draft {
  readonly amount: number;
  readonly name: string;
}

// What the store answers a save with: the draft as it now holds it,
// under an id.
interface Saved extends Draft {
  readonly id: number;
}

type Store = (id: null | number, values: Draft) => Promise<Answer<Saved>>;

const blank: Draft = { amount: 0, name: "" };

const written: Saved = { amount: 4000, id: 6, name: "Lifetime ISA" };

// A draft as the fields report it, with the space around the name the
// save is expected to drop.
const typed: Draft = { amount: 4000, name: "  Lifetime ISA  " };

describe("useEditor", () => {
  it("opens an entry on the draft it is given and drops it on dismiss", () => {
    const store = vi.fn<Store>();
    const { result } = renderHook(() =>
      useEditor({
        describe: (record) => record.name,
        noun: "Account",
        save: store,
      }),
    );

    expect(result.current.entry).toBeNull();

    act(() => {
      result.current.open(blank, null);
    });

    expect(result.current.entry).toStrictEqual({
      draft: blank,
      id: null,
      initial: blank,
    });
    expect(result.current.isSaving).toBe(false);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.entry).toBeNull();
    expect(store).not.toHaveBeenCalled();
  });

  // A dialog open for as long as it is mounted is given its entry
  // rather than opening one, so its first render has the fields it will
  // show. It is closed by being dropped, so it is handed neither open
  // nor dismiss, and the opening it is asked for is required: an editor
  // that started closed would leave such a dialog rendering nothing at
  // all, which is a dead button and no error to say why.
  it("mounts open on the entry it is given, with nothing to open or dismiss", () => {
    const store = vi.fn<Store>();
    const opening = { draft: blank, id: null, initial: blank };
    const { result } = renderHook(() =>
      useMountedEditor({
        describe: (record) => record.name,
        noun: "Account",
        opening,
        save: store,
      }),
    );

    expect(result.current.entry).toStrictEqual(opening);
    expect(result.current).not.toHaveProperty("dismiss");
    expect(result.current).not.toHaveProperty("open");
  });

  it("amends the draft and leaves the values it opened with", () => {
    const store = vi.fn<Store>();
    const { result } = renderHook(() =>
      useEditor({
        describe: (record) => record.name,
        noun: "Account",
        save: store,
      }),
    );
    const opened = { draft: typed, id: 3, initial: typed };

    act(() => {
      result.current.open(typed, 3);
    });

    expect(result.current.entry).toStrictEqual(opened);

    act(() => {
      result.current.amend(opened, { amount: 5000 });
    });

    expect(result.current.entry).toStrictEqual({
      draft: { amount: 5000, name: typed.name },
      id: 3,
      initial: typed,
    });
  });

  it("holds a new record's save in flight, then closes and reports it added", async () => {
    const store = vi.fn<Store>();
    // The store's answer is held back, so the save can be seen in flight.
    let answer!: (answered: Answer<Saved>) => void;
    store.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useEditor({
        describe: (record) => record.name,
        noun: "Account",
        save: store,
      }),
    );

    act(() => {
      result.current.open(typed, null);
    });
    act(() => {
      result.current.save({ draft: typed, id: null, initial: typed });
    });

    expect(store).toHaveBeenCalledExactlyOnceWith(null, {
      amount: 4000,
      name: "Lifetime ISA",
    });
    expect(result.current.isSaving).toBe(true);
    expect(result.current.entry).not.toBeNull();
    expect(toast.add).not.toHaveBeenCalled();

    answer(saved(written));

    await waitFor(() => {
      expect(result.current.entry).toBeNull();
    });
    expect(result.current.isSaving).toBe(false);
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "Lifetime ISA",
      title: "Account added",
      type: "success",
    });
  });

  // A refused save leaves the entry open and free to save again, and
  // reports the refusal in its words rather than throwing it to the
  // route; a save that fails outright is reported the same way.
  it.each([
    [
      "refused",
      (store: Mock<Store>): void => {
        store.mockResolvedValue(refused("A salary feeds a pension alone"));
      },
    ],
    [
      "failed",
      (store: Mock<Store>): void => {
        store.mockRejectedValue(new Error("A salary feeds a pension alone"));
      },
    ],
  ] as const)("keeps a %s save open and says why", async (_how, answer) => {
    const store = vi.fn<Store>();
    answer(store);
    const { result } = renderHook(() =>
      useEditor({
        describe: (record) => record.name,
        noun: "Income line",
        save: store,
      }),
    );

    act(() => {
      result.current.open(typed, 3);
    });
    act(() => {
      result.current.save({ draft: typed, id: 3, initial: typed });
    });

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false);
    });
    expect(result.current.entry).toStrictEqual({
      draft: typed,
      id: 3,
      initial: typed,
    });
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "A salary feeds a pension alone",
      title: "Income line not saved",
      type: "error",
    });
  });

  it("saves over a record, tells the caller what it wrote and reports it updated", async () => {
    const store = vi.fn<Store>().mockResolvedValue(saved(written));
    const onSaved = vi.fn<(record: Saved) => void>();
    const { result } = renderHook(() =>
      useEditor({
        describe: (record, sent) => `${record.name} · ${String(sent.amount)}`,
        noun: "Income line",
        onSaved,
        save: store,
      }),
    );

    act(() => {
      result.current.open(typed, 6);
    });
    act(() => {
      result.current.save({ draft: typed, id: 6, initial: typed });
    });
    await waitFor(() => {
      expect(result.current.entry).toBeNull();
    });

    expect(store).toHaveBeenCalledExactlyOnceWith(6, {
      amount: 4000,
      name: "Lifetime ISA",
    });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(written);
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "Lifetime ISA · 4000",
      title: "Income line updated",
      type: "success",
    });
  });
});
