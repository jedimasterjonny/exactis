import type { JSX } from "react";

import type { Slot } from "@/lib/slot";

interface ScreenHeaderProps {
  readonly actions?: Slot;
  readonly children?: Slot;
  readonly label: string;
  readonly title: string;
}

// The frame every screen opens with: a mono section label, the title in the
// heading face, and a meta line beneath when the screen has one. Actions sit
// to the right, on the title's baseline row, and wrap beneath when the
// screen is too narrow for both. The side gutter is the screen body's,
// halving on a phone as it does, so the title stays over the cards. The
// label is left off below the md breakpoint, where the frame's phone bar
// carries it beside the sidebar's trigger.
export function ScreenHeader({
  actions,
  children,
  label,
  title,
}: ScreenHeaderProps): JSX.Element {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b bg-card px-4 pt-6 pb-5 sm:px-8">
      <div className="grid gap-1.5">
        <span className="label text-muted-foreground max-md:hidden">
          {label}
        </span>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        {children !== undefined && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {children}
          </div>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
