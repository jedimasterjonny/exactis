import type { JSX } from "react";

import { Lock } from "lucide-react";

interface RowLockProps {
  readonly reason: string;
}

// The lock a row draws where its actions would be when it is locked
// against editing here, named by the reason, since a lock alone says
// nothing to a screen reader, and faint, as a held action is. The
// caller places it: in the actions column, in a box the size of the
// pencil it stands for, and on a folded row's first line, in the
// chevron's place, so the two draw the one lock.
export function RowLock({ reason }: RowLockProps): JSX.Element {
  return (
    <span
      aria-label={reason}
      className="inline-flex text-muted-foreground/60"
      role="img"
    >
      <Lock aria-hidden className="size-4" />
    </span>
  );
}
