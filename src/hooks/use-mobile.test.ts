import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "./use-mobile";

function Probe(): string {
  return String(useIsMobile());
}

// jsdom has no matchMedia, so the stub records the change listener the hook
// registers and lets a test fire it as the viewport crosses the breakpoint.
function stubMedia(width: number): { fire: () => void; removed: () => number } {
  let listener: (() => void) | undefined;
  const removeEventListener = vi.fn();
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: (_event: string, handler: () => void): void => {
        listener = handler;
      },
      removeEventListener,
    })),
  );
  return {
    fire: (): void => {
      listener?.();
    },
    removed: (): number => removeEventListener.mock.calls.length,
  };
}

describe("useIsMobile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a viewport below the breakpoint and follows it across", () => {
    const media = stubMedia(1024);
    const { result, unmount } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    vi.stubGlobal("innerWidth", 375);
    act(() => {
      media.fire();
    });

    expect(result.current).toBe(true);

    unmount();

    expect(media.removed()).toBe(1);
  });

  it("says no on the server, where there is no viewport", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe("false");
  });
});
