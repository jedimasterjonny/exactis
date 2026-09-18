import type { JSX } from "react";

import type { Figure } from "@/components/app/atoms/figure-input";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";
import { percentFormat } from "@/lib/money";

type RateFieldProps = Figure & {
  readonly error?: string;
  readonly hint?: string;
  readonly label: string;
  readonly max?: number;
  readonly min?: number;
  readonly onValueCommitted?: (value: number) => void;
};

// A rate input, drawn as the money field is. The rate is held as a
// fraction and shown as a percentage, so 0.021 reads 2.10% and a typed
// 2.1 commits as 0.021: Intl formats the one way, with the options the
// ledger formats with, and the number field parses the other. Arrow keys
// step by a tenth of a point, a whole point with shift. The figure is
// held as the caller says, by default or by value, inside the bounds
// it gives if any, and an error is the caller's, for a rate it could
// not work out.
export function RateField({
  error,
  hint,
  label,
  max,
  min,
  onValueCommitted,
  ...figure
}: RateFieldProps): JSX.Element {
  return (
    <Field error={error} hint={hint} label={label}>
      <FigureInput
        {...figure}
        format={percentFormat}
        largeStep={0.01}
        max={max}
        min={min}
        onValueCommitted={onValueCommitted}
        step={0.001}
      />
    </Field>
  );
}
