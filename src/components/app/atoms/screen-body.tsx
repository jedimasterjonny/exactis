import type { JSX, ReactNode } from "react";

interface ScreenBodyProps {
  readonly children: ReactNode;
}

// The body beneath a screen's header: its regions stacked down the
// screen at one gap, inside the screen's gutter. Every screen with
// something beneath its header lays it out this way, so the gutter and
// the gap are stated here once rather than on each page.
export function ScreenBody({ children }: ScreenBodyProps): JSX.Element {
  return <div className="grid gap-5 p-8">{children}</div>;
}
