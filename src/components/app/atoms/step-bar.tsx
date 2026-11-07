import type { JSX } from "react";

interface StepBarProps {
  readonly from?: number;
  readonly to: number;
}

// Where a running total stands after a step, and the step that took it
// there, as places on a track from 0 to 100: a pin in ink at the place
// it leaves the total, ringed in the card's colour, as a milestone's pin
// is; and, given where the step started, a bar in ink at half strength
// from there to the pin, so the bar runs towards the dot whichever way
// it went, and a step of nothing is the pin alone. A pin at either end
// overhangs the track by half its width rather than being held inside
// it, since the ends are the scale's. Decorative, since the figures are
// written beside it: the bar is hidden from the accessibility tree.
export function StepBar({ from, to }: StepBarProps): JSX.Element {
  return (
    <div
      aria-hidden
      className="relative h-1.5 rounded-full bg-muted"
      data-slot="step-bar"
    >
      {from !== undefined && (
        <span
          className="absolute inset-y-0 rounded-full bg-foreground/50"
          data-slot="step-bar-fill"
          style={{
            left: `${String(Math.min(from, to))}%`,
            width: `${String(Math.abs(to - from))}%`,
          }}
        />
      )}
      <span
        className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-foreground ring-2 ring-card"
        data-slot="step-bar-pin"
        style={{ left: `${String(to)}%` }}
      />
    </div>
  );
}
