import type { JSX } from "react";

import { Suspense, use } from "react";

import { Badge } from "@/components/kit/badge";

interface DueBadgeProps {
  readonly isDue: Promise<boolean>;
}

// The month end's badge: Due while last month is still to be closed, and
// nothing while it is not. The read is handed down unawaited, so what the
// badge sits in draws at once and the badge joins it, in a boundary of its
// own, when the read is in.
export function DueBadge({ isDue }: DueBadgeProps): JSX.Element {
  return (
    <Suspense fallback={null}>
      <Due isDue={isDue} />
    </Suspense>
  );
}

// The badge once the read is in.
function Due({ isDue }: DueBadgeProps): JSX.Element | null {
  return use(isDue) ? <Badge variant="caution">Due</Badge> : null;
}
