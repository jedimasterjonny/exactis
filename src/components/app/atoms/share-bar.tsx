import type { JSX } from "react";

import { cn } from "cn";

interface ShareBarProps {
  readonly className?: string;
  readonly share: number;
}

// A share of a whole as a bar, such as the share of an asset's value its
// equity is: drawn, since the words beside it say the amount, and
// hidden from the accessibility tree for the same reason. A share below
// nothing, as a loan above the value leaves, draws none, and so does a
// whole of nothing. The bar is a stub unless the caller's class draws it
// the width of the row.
export function ShareBar({ className, share }: ShareBarProps): JSX.Element {
  const held = Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0;
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 ml-auto block h-1 w-16 overflow-hidden rounded-full bg-muted",
        className,
      )}
      data-slot="share-bar"
    >
      <span
        className="block h-full rounded-full bg-positive"
        data-slot="share-bar-fill"
        style={{ width: `${String(held * 100)}%` }}
      />
    </span>
  );
}
