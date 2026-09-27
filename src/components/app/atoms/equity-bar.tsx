import type { JSX } from "react";

import { cn } from "cn";

interface EquityBarProps {
  readonly className?: string;
  readonly share: number;
}

// The share of an asset's value its equity is, as a bar beneath the
// equity's figure: drawn, since the figure beside it says the amount,
// and hidden from the accessibility tree for the same reason. A loan
// above the value leaves no equity to draw, and a value of nothing no
// share of it. The bar is a stub under a column's figure; the class is
// the caller's, for a folded row that draws it the width of the row.
export function EquityBar({ className, share }: EquityBarProps): JSX.Element {
  const held = Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0;
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 ml-auto block h-1 w-16 overflow-hidden rounded-full bg-muted",
        className,
      )}
      data-slot="equity-bar"
    >
      <span
        className="block h-full rounded-full bg-positive"
        data-slot="equity-bar-fill"
        style={{ width: `${String(held * 100)}%` }}
      />
    </span>
  );
}
