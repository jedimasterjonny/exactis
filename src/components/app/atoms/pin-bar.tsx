import type { JSX } from "react";

import type { Plan } from "@/data/plan";

import { placed } from "@/lib/span";

interface PinBarProps {
  readonly plan: Plan;
  readonly year: number;
}

// Where a milestone falls on the plan's span: a pin in oxide, which the
// palette keeps for milestones, over the track a line's bar is drawn on,
// where the milestone's year begins, so a line starting at it starts at
// the pin and one ending at it ends there. A year outside the span is
// held to its edge. The pin is ringed in the card's colour, so it reads
// as sitting on the track rather than cut into it. Decorative, since
// the year is written beside it: the bar is hidden from the
// accessibility tree.
export function PinBar({ plan, year }: PinBarProps): JSX.Element {
  return (
    <div
      aria-hidden
      className="relative h-1.5 rounded-full bg-muted"
      data-slot="pin-bar"
    >
      <span
        className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-brand ring-2 ring-card"
        data-slot="pin-bar-pin"
        style={{ left: `${String(placed(year, plan))}%` }}
      />
    </div>
  );
}
