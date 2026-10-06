import type { JSX } from "react";

import { cn } from "cn";

import type { Outcome } from "@/engine/futures";

import { lastingOutcomes, outcomeTones, shortOutcomes } from "@/lib/outcomes";

interface OutcomeMeterProps {
  readonly count: number;
  readonly outcomes: Readonly<Record<Outcome, number>>;
}

// A run of futures graded, as one bar: the futures that lasted from the
// best of them, a wider gap, then those that fell short from the
// nearest miss, each outcome as long as its share of the run, and while
// the run is drawn the futures still to come as a muted rest, so the
// bar fills as the run comes in. Drawn, since the shares are written
// beside it, and hidden from the accessibility tree for the same
// reason. An outcome no future came to draws nothing, and one too few
// to see is drawn as a sliver all the same, so the bar misses no
// outcome its shares name.
export function OutcomeMeter({
  count,
  outcomes,
}: OutcomeMeterProps): JSX.Element {
  const drawn = Object.values(outcomes).reduce((sum, each) => sum + each, 0);
  return (
    <span aria-hidden className="flex h-3 gap-1" data-slot="outcome-meter">
      {[lastingOutcomes, shortOutcomes].map((group) => {
        const held = group.filter((outcome) => outcomes[outcome] > 0);
        const total = held.reduce((sum, outcome) => sum + outcomes[outcome], 0);
        return (
          total > 0 && (
            <span
              className="flex basis-0 gap-0.5"
              key={group[0]}
              style={{ flexGrow: total }}
            >
              {held.map((outcome) => (
                <span
                  className={cn(
                    "min-w-1 basis-0 rounded-sm",
                    outcomeTones[outcome],
                  )}
                  data-outcome={outcome}
                  data-slot="outcome-meter-share"
                  key={outcome}
                  style={{ flexGrow: outcomes[outcome] }}
                />
              ))}
            </span>
          )
        );
      })}
      {drawn < count && (
        <span
          className="basis-0 rounded-sm bg-muted"
          data-slot="outcome-meter-rest"
          style={{ flexGrow: count - drawn }}
        />
      )}
    </span>
  );
}
