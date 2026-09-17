import type { JSX } from "react";

import type { Figure } from "@/components/app/atoms/figure-input";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";

type TermFieldProps = Figure & {
  readonly hint?: string;
  readonly label: string;
  readonly onValueCommitted?: (value: number) => void;
};

// A term is a count of years, to a tenth, since one worked out from a
// loan's figures seldom lands on a whole one and the tenth is worth
// showing. Arrow keys step by a year, five with shift.
const format: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

// A term input, drawn as the money field is: how long a loan has left to
// run. The figure is held as the caller says, by default or by value.
export function TermField({
  hint,
  label,
  onValueCommitted,
  ...figure
}: TermFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <FigureInput
        {...figure}
        format={format}
        largeStep={5}
        onValueCommitted={onValueCommitted}
        step={1}
      />
    </Field>
  );
}
