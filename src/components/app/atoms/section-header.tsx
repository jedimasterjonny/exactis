import type { JSX, ReactNode } from "react";

interface SectionHeaderProps {
  readonly actions?: ReactNode;
  readonly children?: string;
  readonly label: string;
  readonly title: string;
}

// The frame a card within a screen opens with, the screen header's at card
// scale: a mono section label, the title as the second-level heading in
// the heading face, and a meta line beneath when the card has one.
// Actions sit to the right of the title and wrap beneath when the card is
// too narrow for both. Composes nothing of ours and no kit; the caller
// puts it in the card's header.
export function SectionHeader({
  actions,
  children,
  label,
  title,
}: SectionHeaderProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1">
        <span className="label text-muted-foreground">{label}</span>
        <h2 className="font-heading text-base font-medium">{title}</h2>
        {children !== undefined && (
          <span className="text-sm text-muted-foreground">{children}</span>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
