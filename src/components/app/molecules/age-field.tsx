"use client";

import type { JSX } from "react";

import { useId } from "react";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";
import { Slider } from "@/components/kit/slider";
import { thumbOf } from "@/lib/slider";

interface AgeFieldProps {
  readonly hasSlider?: boolean;
  readonly hint?: string;
  readonly isDisabled?: boolean;
  readonly isSliderInFlow?: boolean;
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
// pressing the track leaves the focus inside and the panel open. Asked
// to hold the slider in the flow, as a card that clips what floats over
// its edge does, the field keeps it beneath the box, always shown and
// in the tab order after it, stepping five years with Shift or a page
// key as the box does, its track drawn in the box's border grey so it
// shows on a sunken panel, and its control 44px tall below the width of
// a tablet, so a finger has a target as tall as a row's. An age set on
// purpose rather than watched as it moves asks for no slider, and is
// the field alone, committing as it does with one. An age that cannot
// be tried yet is held: the box and the slider show the age given,
// dimmed, out of the tab order and read as unavailable, until the
// caller lets them be.
export function AgeField({
  hasSlider = true,
  hint,
  isDisabled = false,
  isSliderInFlow = false,
  label,
  max,
  min,
  onValueChange,
  onValueCommitted,
  value,
}: AgeFieldProps): JSX.Element {
  const sliderLabelId = useId();
  const field = (
    <Field hint={hint} label={label}>
      <FigureInput
        format={format}
        isDisabled={isDisabled}
        largeStep={5}
        max={max}
        min={min}
        onValueCommitted={onValueCommitted}
        step={1}
        value={value}
      />
    </Field>
  );
  if (!hasSlider) {
    return field;
  }
  const slider = (
    <>
      <span className="sr-only" id={sliderLabelId}>
        {label}
      </span>
      <Slider
        aria-labelledby={sliderLabelId}
        className={
          isSliderInFlow
            ? "max-md:*:h-11 [&_[data-slot=slider-track]]:bg-input"
            : undefined
        }
        disabled={isDisabled}
        largeStep={isSliderInFlow ? 5 : undefined}
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
    </>
  );
  if (isSliderInFlow) {
    return (
      <div className="grid gap-3">
        {field}
        <div data-slot="age-slider">{slider}</div>
      </div>
    );
  }
  return (
    <div className="group/age relative">
      {field}
      <div
        className="invisible absolute inset-x-0 top-full z-10 mt-2 rounded-md border bg-popover px-3 py-4 shadow-md group-focus-within/age:visible"
        data-slot="age-slider"
        tabIndex={-1}
      >
        {slider}
      </div>
    </div>
  );
}
