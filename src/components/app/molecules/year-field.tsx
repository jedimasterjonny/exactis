import type { JSX } from "react";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";

interface YearFieldProps {
  readonly defaultValue: number;
  readonly hint?: string;
  readonly label: string;
  readonly onValueCommitted?: (value: number) => void;
}

// A year is a whole number written without a separator, so 2026 never
// reads 2,026. Arrow keys step by a year, ten with shift.
const format: Intl.NumberFormatOptions = { useGrouping: false };

// A year input, drawn as the money field is, under a hint that carries
// the age reached.
export function YearField({
  defaultValue,
  hint,
  label,
  onValueCommitted,
}: YearFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <FigureInput
        defaultValue={defaultValue}
        format={format}
        largeStep={10}
        onValueCommitted={onValueCommitted}
        step={1}
      />
    </Field>
  );
}
