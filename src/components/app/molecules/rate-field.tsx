import type { JSX } from "react";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";

interface RateFieldProps {
  readonly defaultValue: number;
  readonly hint?: string;
  readonly label: string;
  readonly onValueCommitted?: (value: null | number) => void;
}

// A rate is held as a fraction and shown as a percentage to two places,
// so 0.021 reads 2.10% and a typed 2.1 commits as 0.021: Intl formats the
// one way and the number field parses the other. Arrow keys step by a
// tenth of a point, a whole point with shift.
const format: Intl.NumberFormatOptions = {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "percent",
};

// A rate input, drawn as the money field is.
export function RateField({
  defaultValue,
  hint,
  label,
  onValueCommitted,
}: RateFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <FigureInput
        defaultValue={defaultValue}
        format={format}
        largeStep={0.01}
        onValueCommitted={onValueCommitted}
        step={0.001}
      />
    </Field>
  );
}
