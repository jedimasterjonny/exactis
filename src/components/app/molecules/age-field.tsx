"use client";

import type { JSX } from "react";

import { useId } from "react";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";
import { Slider } from "@/components/kit/slider";
import { thumbOf } from "@/lib/slider";

interface AgeFieldProps {
  readonly hint?: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onValueChange?: (age: number) => void;
  readonly onValueCommitted: (age: number) => void;
  readonly value: number;
}

// An age is a whole number of years, written as a figure is.
const format: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

// An age, typed into a box as every figure is, with a slider that
// floats beneath the field while either has the focus, over whatever
// the field sits above, so an age can be dragged through its range as
// well as typed. The two hold the one age the caller gives and within
// the bounds it gives: a typed age commits on blur or on each step of
// the arrow keys, clamped to the bounds; the slider reports each age it
// passes through as it is dragged, which is what a caller showing the
// age's effect as it moves listens to, and commits the one it is let go
// at. The slider sits beside the field rather than inside it, since
// inside it the thumb takes the field's control id and the box and the
// thumb share one id, so it is named by a label of its own that only a
// screen reader reads, saying what the field's label says. The panel is
// shown by the stylesheet while the focus is anywhere within the field
// or the panel and hidden otherwise, which takes the thumb out of the
// tab order and the accessibility tree with it, so the box and the
// panel need no state and no handlers between them; the panel takes
// the focus itself when it is pressed anywhere but the thumb, so
// pressing the track leaves the focus inside and the panel open.
export function AgeField({
  hint,
  label,
  max,
  min,
  onValueChange,
  onValueCommitted,
  value,
}: AgeFieldProps): JSX.Element {
  const sliderLabelId = useId();
  return (
    <div className="group/age relative">
      <Field hint={hint} label={label}>
        <FigureInput
          format={format}
          largeStep={5}
          max={max}
          min={min}
          onValueCommitted={onValueCommitted}
          step={1}
          value={value}
        />
      </Field>
      <div
        className="invisible absolute inset-x-0 top-full z-10 mt-2 rounded-md border bg-popover px-3 py-4 shadow-md group-focus-within/age:visible"
        data-slot="age-slider"
        tabIndex={-1}
      >
        <span className="sr-only" id={sliderLabelId}>
          {label}
        </span>
        <Slider
          aria-labelledby={sliderLabelId}
          max={max}
          min={min}
          onValueChange={(ages) => {
            onValueChange?.(thumbOf(ages));
          }}
          onValueCommitted={(ages) => {
            onValueCommitted(thumbOf(ages));
          }}
          step={1}
          value={[value]}
        />
      </div>
    </div>
  );
}
