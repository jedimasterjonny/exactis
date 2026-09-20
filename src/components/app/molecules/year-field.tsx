import type { JSX } from "react";

import type { Figure } from "@/components/app/atoms/figure-input";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";

type YearFieldProps = Figure & {
  readonly hint?: string;
  readonly label: string;
  readonly max?: number;
  readonly min?: number;
  readonly onValueCommitted?: (value: number) => void;
};

// A year is a whole number written without a separator, so 2026 never
// reads 2,026. Arrow keys step by a year, ten with shift.
const format: Intl.NumberFormatOptions = { useGrouping: false };

// A year input, drawn as the money field is, under a hint that carries
// the age reached. The figure is held as the caller says, by default or
// by value, inside the bounds it gives if any, so a year worked out
// from other figures can be shown and one before the plan cannot be
// typed.
export function YearField({
  hint,
  label,
  max,
  min,
  onValueCommitted,
  ...figure
}: YearFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <FigureInput
        {...figure}
        format={format}
        largeStep={10}
        max={max}
        min={min}
        onValueCommitted={onValueCommitted}
        step={1}
      />
    </Field>
  );
}
