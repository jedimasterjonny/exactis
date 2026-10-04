import type { JSX } from "react";

import { Slider } from "@base-ui/react/slider";
import { cn } from "cn";

import type { Plan } from "@/data/plan";

import { endYear } from "@/data/plan";
import { thumbOf } from "@/lib/slider";
import { placed } from "@/lib/span";

// A year as the strip draws it: what a month of it puts by, what it
// draws from the savings, and whether the savings run out in it.
export interface StripYear {
  readonly drawn: number;
  readonly isShort: boolean;
  readonly saved: number;
  readonly year: number;
}

interface YearStripProps {
  readonly label: string;
  readonly marks: readonly number[];
  readonly onValueChange: (year: number) => void;
  readonly plan: Plan;
  readonly value: number;
  readonly valueText: (year: number) => string;
  readonly years: readonly StripYear[];
}

// The plan's years as one strip on the plan's span, and the year chosen
// along it. Each year is a column centred where the year falls on the
// span, as a milestone's pin is, so the strip sits under the lanes it
// is read with: what a month of it puts by rises from a rule through the
// middle in jade, as money kept does everywhere, and what it draws from
// the savings hangs beneath it in ink, as spending is drawn, or in the
// loss tone in a year the savings run out in, since only then is the
// draw a failure. Both are drawn to the one scale, the most either
// reaches in any year, so a year's rise and a year's draw compare by
// height. The milestones rule the strip in faint oxide, as they rule
// every bar, the first and last years are half drawn, at the span's
// edges where they fall, and the chosen year is drawn whole while the
// rest fade.
// The strip is a slider: the chosen year is its thumb, a rule the
// strip's height, dragged or pressed along it or stepped with the arrow
// keys, Home and End, and a screen reader reads the year in the words
// it is given. The columns are its track's drawing and are hidden from
// the accessibility tree.
export function YearStrip({
  label,
  marks,
  onValueChange,
  plan,
  value,
  valueText,
  years,
}: YearStripProps): JSX.Element {
  const end = endYear(plan);
  const width = 100 / (end - plan.from);
  const most = Math.max(
    1,
    ...years.flatMap(({ drawn, saved }) => [drawn, saved]),
  );
  return (
    <Slider.Root
      className="w-full"
      max={end}
      min={plan.from}
      onValueChange={(year) => {
        onValueChange(thumbOf(year));
      }}
      step={1}
      thumbAlignment="center"
      value={value}
    >
      <Slider.Control
        className="relative h-24 w-full touch-none select-none"
        data-slot="year-strip"
      >
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
          {marks.map((mark) => (
            <span
              className="absolute inset-y-0 w-px bg-brand/40"
              data-slot="year-strip-mark"
              key={mark}
              style={{ left: `${String(placed(mark, plan))}%` }}
            />
          ))}
          {years.map(({ drawn, isShort, saved, year }) => (
            <span
              className={cn(
                "absolute inset-y-0 -translate-x-1/2 px-px",
                year !== value && "opacity-40",
              )}
              data-slot="year-strip-year"
              key={year}
              style={{
                left: `${String(placed(year, plan))}%`,
                width: `${String(width)}%`,
              }}
            >
              <span
                className="absolute inset-x-px bottom-1/2 rounded-t-xs bg-positive"
                data-slot="year-strip-saved"
                style={{ height: heightOf(saved, most) }}
              />
              <span
                className={cn(
                  "absolute inset-x-px top-1/2 rounded-b-xs",
                  isShort ? "bg-destructive" : "bg-foreground/50",
                )}
                data-slot="year-strip-drawn"
                style={{ height: heightOf(drawn, most) }}
              />
            </span>
          ))}
        </div>
        <Slider.Track className="absolute inset-0">
          <Slider.Thumb
            className="h-full w-0.5 bg-foreground outline-hidden after:absolute after:-inset-x-3 after:inset-y-0 focus-visible:ring-3 focus-visible:ring-ring/50"
            getAriaLabel={() => label}
            getAriaValueText={(_formatted, year) => valueText(year)}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

// How tall a sum stands from the strip's middle, as a share of the
// strip: half of it at the most any year reaches. Rounded to a hundredth
// of a percent, finer than any screen draws, since the sums come out of
// the engine's powers and logarithms, which the server's JavaScript and
// a browser's may work out a last digit apart, and a style written in
// full would then differ between the page as served and as hydrated.
function heightOf(sum: number, most: number): string {
  return `${String(Math.round((sum / most) * 5000) / 100)}%`;
}
