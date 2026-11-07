import type { JSX } from "react";

import { cn } from "cn";
import { Suspense, use } from "react";

import { Badge } from "@/components/kit/badge";

interface DueBadgeProps {
  readonly className?: string | undefined;
  readonly isDue: Promise<boolean>;
  readonly shape?: Shape;
}

// The pill, beside a label with room for the word, or the dot, for a mark
// too small to hold it, as a tab's icon is.
type Shape = "dot" | "pill";

// The month end's badge: Due while last month is still to be closed, and
// nothing while it is not. The read is handed down unawaited, so what the
// badge sits in draws at once and the badge joins it, in a boundary of its
// own, when the read is in. The pill says Due. The dot is a caution mark
// ringed in the card's colour, hidden from a screen reader, which hears
// Due in its place; the dot is set where the caller's class places it,
// out of the flow, so the word comes after whatever the badge follows and
// a link holding both is named by its label and then Due.
export function DueBadge({
  className,
  isDue,
  shape = "pill",
}: DueBadgeProps): JSX.Element {
  return (
    <Suspense fallback={null}>
      <Due className={className} isDue={isDue} shape={shape} />
    </Suspense>
  );
}

// The badge once the read is in.
function Due({
  className,
  isDue,
  shape,
}: Required<DueBadgeProps>): JSX.Element | null {
  if (!use(isDue)) {
    return null;
  }
  return shape === "dot" ? (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute size-2 rounded-full bg-caution ring-2 ring-card",
          className,
        )}
        data-slot="due-dot"
      />
      <span className="sr-only">Due</span>
    </>
  ) : (
    <Badge className={className} variant="caution">
      Due
    </Badge>
  );
}
