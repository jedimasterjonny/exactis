import type { JSX, ReactNode } from "react";

interface ScreenHeaderProps {
  readonly children?: ReactNode;
  readonly label: string;
  readonly title: string;
}

// The frame every screen opens with: a mono section label, the title in the
// heading face, and a meta line beneath when the screen has one. Actions
// arrive with the first screen that has any.
export function ScreenHeader({
  children,
  label,
  title,
}: ScreenHeaderProps): JSX.Element {
  // A conditional child that came out false, or an absent one, must not
  // leave an empty row under the title.
  const hasMeta =
    children !== undefined &&
    children !== null &&
    typeof children !== "boolean";
  return (
    <header className="grid gap-1.5 border-b bg-card px-8 pt-6 pb-5">
      <span className="label text-muted-foreground">{label}</span>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      {hasMeta && (
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {children}
        </div>
      )}
    </header>
  );
}
