import type { JSX, ReactNode } from "react";

interface ScreenBodyProps {
  readonly children: ReactNode;
}

// The body beneath a screen's header: its regions stacked down the
// screen at one gap, inside the screen's gutter. Every screen with
// something beneath its header lays it out this way, so the gutter and
// the gap are stated here once rather than on each page. The gutter
// halves on a phone, where 32px a side was a sixth of the width taken
// from the cards, and matches the bar above the screen there.
export function ScreenBody({ children }: ScreenBodyProps): JSX.Element {
  return <div className="grid gap-5 p-4 sm:p-8">{children}</div>;
}
