import type { JSX, ReactNode } from "react";

interface ScreenHeaderProps {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly label: string;
  readonly title: string;
}

// The frame every screen opens with: a mono section label, the title in the
// heading face, and a meta line beneath when the screen has one. Actions sit
// to the right, on the title's baseline row, and wrap beneath when the
// screen is too narrow for both.
export function ScreenHeader({
  actions,
  children,
  label,
  title,
}: ScreenHeaderProps): JSX.Element {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b bg-card px-8 pt-6 pb-5">
      <div className="grid gap-1.5">
        <span className="label text-muted-foreground">{label}</span>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        {isRendered(children) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {children}
          </div>
        )}
      </div>
      {isRendered(actions) && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

// A conditional slot that came out false, or an absent one, must not leave
// an empty row under the title or an empty column beside it.
function isRendered(node: ReactNode): boolean {
  return node !== undefined && node !== null && typeof node !== "boolean";
}
