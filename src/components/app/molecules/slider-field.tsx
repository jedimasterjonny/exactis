import type { JSX } from "react";

import { Field } from "@/components/app/atoms/field";
import { Slider } from "@/components/kit/slider";
import { thumbOf } from "@/lib/slider";

interface SliderFieldProps {
  readonly hint?: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onValueChange: (value: number) => void;
  readonly value: number;
}

// A whole number picked by dragging along a range, under a label and
// over a hint. It holds the number its caller gives and reports each one
// it passes through as it moves, as a number rather than the list of
// one a slider holds. The slider is the field's one control, so the
// field names the thumb by its label and describes it by its hint, as it
// does a box. A number typed as well as dragged is the age field's,
// whose slider sits beside the field rather than in it, since there the
// box is the control the field names.
export function SliderField({
  hint,
  label,
  max,
  min,
  onValueChange,
  value,
}: SliderFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <Slider
        max={max}
        min={min}
        onValueChange={(values) => {
          onValueChange(thumbOf(values));
        }}
        step={1}
        value={[value]}
      />
    </Field>
  );
}
