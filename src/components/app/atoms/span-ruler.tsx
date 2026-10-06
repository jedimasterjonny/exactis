import type { JSX } from "react";

import type { Plan } from "@/data/plan";

import { ageIn } from "@/data/plan";
import { decadesOf, placed } from "@/lib/span";

interface SpanRulerProps {
  readonly plan: Plan;
}

// The plan's span ruled in decades, over the bars laid on it: each
// decade's year where it begins on the span, with the age reached in it
// beneath, so a pin or a bar's end is read off the ruler as much as off
// the figures beside it. The marks are the same mono, muted as the ages
// beside a row are, and centred on their year. Decorative, since every
// row writes its own years, so it is hidden from the accessibility
// tree.
export function SpanRuler({ plan }: SpanRulerProps): JSX.Element {
  return (
    <div aria-hidden className="relative h-8" data-slot="span-ruler">
      {decadesOf(plan).map((year) => (
        <span
          className="absolute top-0 grid -translate-x-1/2 justify-items-center"
          data-slot="span-ruler-mark"
          key={year}
          style={{ left: `${String(placed(year, plan))}%` }}
        >
          <span className="figure text-xs text-muted-foreground">{year}</span>
          <span className="label text-muted-foreground">
            {`Age ${String(ageIn(year, plan))}`}
          </span>
        </span>
      ))}
    </div>
  );
}
