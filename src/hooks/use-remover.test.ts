import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { toast } from "@/components/kit/toast";

import { useRemover } from "./use-remover";

// The toast is the hook's one output that is not the doomed record, and a
// manager mounted for a hook with no tree of its own would be a Toaster
// rendered to read one call. The organisms mount it and read the toast
// as a dialog; here the call is the assertion.
vi.mock("@/components/kit/toast", () => ({ toast: { add: vi.fn() } }));

// A record of the shape every doomed one is: carrying the id the store is
// sent, with whatever the toast is to describe it by beside it.
interface Doomed {
  readonly id: number;
  readonly name: string;
}

type Store = (id: number) => Promise<void>;

const doomed: Doomed = { id: 6, name: "Lifetime ISA" };

describe("useRemover", () => {
  it("holds nothing until it is asked, and drops the question on cancel", () => {
    const store = vi.fn<Store>();
    const { result } = renderHook(() =>
      useRemover<Doomed>({
        describe: (record) => record.name,
        noun: "Account",
        remove: store,
      }),
    );

    expect(result.current.doomed).toBeNull();

    act(() => {
      result.current.ask(doomed);
    });

    expect(result.current.doomed).toStrictEqual(doomed);
    expect(result.current.isRemoving).toBe(false);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.doomed).toBeNull();
    expect(store).not.toHaveBeenCalled();
  });

  it("holds a deletion in flight, then closes and reports it deleted", async () => {
    const store = vi.fn<Store>();
    // The store's answer is held back, so the deletion can be seen in
    // flight.
    let answer!: () => void;
    store.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useRemover<Doomed>({
        describe: (record) => record.name,
        noun: "Account",
        remove: store,
      }),
    );

    act(() => {
      result.current.ask(doomed);
    });
    act(() => {
      result.current.confirm(doomed);
    });

    expect(store).toHaveBeenCalledExactlyOnceWith(6);
    expect(result.current.isRemoving).toBe(true);
    expect(result.current.doomed).not.toBeNull();
    expect(toast.add).not.toHaveBeenCalled();

    answer();

    await waitFor(() => {
      expect(result.current.doomed).toBeNull();
    });
    expect(result.current.isRemoving).toBe(false);
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "Lifetime ISA",
      title: "Account deleted",
      type: "success",
    });
  });

  // A refused deletion leaves the question open and free to confirm
  // again, and reports the refusal rather than throwing it to the route.
  it("keeps a refused deletion open and says why", async () => {
    const store = vi.fn<Store>();
    store.mockRejectedValue(new Error("No income line was written"));
    const { result } = renderHook(() =>
      useRemover<Doomed>({
        describe: (record) => record.name,
        noun: "Income line",
        remove: store,
      }),
    );

    act(() => {
      result.current.ask(doomed);
    });
    act(() => {
      result.current.confirm(doomed);
    });

    await waitFor(() => {
      expect(result.current.isRemoving).toBe(false);
    });
    expect(result.current.doomed).toStrictEqual(doomed);
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "No income line was written",
      title: "Income line not deleted",
      type: "error",
    });
  });
});
