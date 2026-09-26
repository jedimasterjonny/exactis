import type { Mock } from "vitest";

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Answer } from "@/lib/answer";

import { toast } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";

import { useSender } from "./use-sender";

// The toast is the hook's one output that is not a callback, and a
// manager mounted for a hook with no tree of its own would be a Toaster
// rendered to read one call. The organisms mount it and read the toast
// as a dialog; here the call is the assertion.
vi.mock("@/components/kit/toast", () => ({ toast: { add: vi.fn() } }));

type Call = () => Promise<Answer<string>>;

describe("useSender", () => {
  it("holds a call in flight, then lands it and says it was done", async () => {
    const call = vi.fn<Call>();
    // The store's answer is held back, so the call can be seen in
    // flight.
    let answer!: (answered: Answer<string>) => void;
    call.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const onAccepted = vi.fn<(value: string) => void>();
    const { result } = renderHook(() => useSender());

    act(() => {
      result.current.send(call, {
        failure: "Owner not saved",
        onAccepted,
        success: (value) => ({ description: value, title: "Owner added" }),
      });
    });

    expect(call).toHaveBeenCalledOnce();
    expect(result.current.isSending).toBe(true);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(toast.add).not.toHaveBeenCalled();

    answer(saved("Me"));

    await waitFor(() => {
      expect(result.current.isSending).toBe(false);
    });
    expect(onAccepted).toHaveBeenCalledExactlyOnceWith("Me");
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "Me",
      title: "Owner added",
      type: "success",
    });
  });

  it("lands a quiet call without a word, having nothing to land", async () => {
    const call = vi.fn<Call>().mockResolvedValue(saved("Me"));
    const { result } = renderHook(() => useSender());

    act(() => {
      result.current.send(call, { failure: "Retirement age not saved" });
    });

    await waitFor(() => {
      expect(result.current.isSending).toBe(false);
    });
    expect(call).toHaveBeenCalledOnce();
    expect(toast.add).not.toHaveBeenCalled();
  });

  // A refused call lands what the caller drops, and reports the refusal
  // in its words rather than throwing it to the route; a call that
  // fails outright is reported the same way.
  it.each([
    [
      "refused",
      (call: Mock<Call>): void => {
        call.mockResolvedValue(refused("No owner has the id"));
      },
    ],
    [
      "failed",
      (call: Mock<Call>): void => {
        call.mockRejectedValue(new Error("No owner has the id"));
      },
    ],
  ] as const)(
    "lands a %s call's rejection and says why",
    async (_how, answer) => {
      const call = vi.fn<Call>();
      answer(call);
      const onAccepted = vi.fn<(value: string) => void>();
      const onRejected = vi.fn<() => void>();
      const { result } = renderHook(() => useSender());

      act(() => {
        result.current.send(call, {
          failure: "Owner not saved",
          onAccepted,
          onRejected,
        });
      });

      await waitFor(() => {
        expect(result.current.isSending).toBe(false);
      });
      expect(onAccepted).not.toHaveBeenCalled();
      expect(onRejected).toHaveBeenCalledOnce();
      expect(toast.add).toHaveBeenCalledExactlyOnceWith({
        description: "No owner has the id",
        title: "Owner not saved",
        type: "error",
      });
    },
  );

  it("says why a call was rejected with nothing to drop", async () => {
    const call = vi
      .fn<Call>()
      .mockResolvedValue(refused("No owner has the id"));
    const { result } = renderHook(() => useSender());

    act(() => {
      result.current.send(call, { failure: "Owner not deleted" });
    });

    await waitFor(() => {
      expect(result.current.isSending).toBe(false);
    });
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "No owner has the id",
      title: "Owner not deleted",
      type: "error",
    });
  });
});
