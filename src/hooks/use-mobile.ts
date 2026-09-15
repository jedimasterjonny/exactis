import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function getServerSnapshot(): boolean {
  return false;
}

function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

// Whether the viewport is below the medium breakpoint, read from the window
// as an external store so the first client render already knows, and so no
// state is set inside an effect. The server has no window and says no.
function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(
    `(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`,
  );
  query.addEventListener("change", onChange);
  return (): void => {
    query.removeEventListener("change", onChange);
  };
}
