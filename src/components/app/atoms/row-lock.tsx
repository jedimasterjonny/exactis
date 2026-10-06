import type { JSX } from "react";

import { Lock } from "lucide-react";

interface RowLockProps {
  readonly reason: string;
}

// The lock a row draws where its actions would be when it is locked
// against editing here, named by the reason, since a lock alone says
// nothing to a screen reader, and muted, so it reads as a state rather
// than an action. Muted at full strength and no fainter, since an icon
// that says something needs 3:1 against its card, and the muted
// foreground at 60% fell to 2.35:1. The caller places it: in the
// actions column, in a box the size of the pencil it stands for, and on
// a folded row's first line, in the chevron's place, so the two draw the
// one lock.
export function RowLock({ reason }: RowLockProps): JSX.Element {
  return (
    <span
      aria-label={reason}
      className="inline-flex text-muted-foreground"
      role="img"
    >
      <Lock aria-hidden className="size-4" />
    </span>
  );
}
