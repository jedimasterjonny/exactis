import type { JSX } from "react";

interface RowOpenerProps {
  readonly children: string;
  readonly onOpen: () => void;
}

// A row's name as the button that opens the row, for a row laid out in
// columns, as a folded row's name is on its lines: its press covers the
// nearest box the caller positions, which is the whole row, so the row
// opens from anywhere on it, as an account's does, and its focus ring is
// drawn around what it covers for the same reason. The chevron that
// says so is the caller's, at the row's end. The name stays the name,
// weighted and left-aligned, so the button reads as the row's title
// rather than as a control set into it.
export function RowOpener({ children, onOpen }: RowOpenerProps): JSX.Element {
  return (
    <button
      className="text-left font-medium after:absolute after:inset-0 focus-visible:outline-hidden focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
      onClick={onOpen}
      type="button"
    >
      {children}
    </button>
  );
}
