import type { JSX } from "react";

import type { Slot } from "@/lib/slot";

import { ScreenTitle } from "@/components/app/atoms/screen-title";

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
// label shows at every width, so a phone, where the sidebar and its
// numerals are off canvas, still names the section. The title takes
// the focus when its screen is moved to, and when it is handed it, as a
// screen that takes away the control that had it hands it, and is never
// tabbed to.
export function ScreenHeader({
  actions,
  children,
  label,
  title,
}: ScreenHeaderProps): JSX.Element {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b bg-card px-4 pt-6 pb-5 sm:px-8">
      <div className="grid min-w-0 grid-cols-1 gap-1.5">
        <span className="label text-muted-foreground">{label}</span>
        <ScreenTitle>{title}</ScreenTitle>
        {children !== undefined && (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {children}
          </div>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
