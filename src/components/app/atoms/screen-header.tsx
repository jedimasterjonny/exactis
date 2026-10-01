import type { JSX, ReactNode } from "react";

interface ScreenHeaderProps {
  readonly actions?: Slot;
  readonly children?: Slot;
  readonly label: string;
  readonly title: string;
}

// What a slot takes: anything React draws but what a condition that came
// out false gives, so a slot filled as cond && <x /> is a type error rather
// than an empty row under the title or an empty column beside it.
type Slot = Exclude<ReactNode, boolean | null>;

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
