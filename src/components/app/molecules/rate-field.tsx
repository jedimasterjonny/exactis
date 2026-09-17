import type { JSX } from "react";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";
import { percentFormat } from "@/lib/money";

interface RateFieldProps {
  readonly defaultValue: number;
  readonly hint?: string;
  readonly label: string;
  readonly onValueCommitted?: (value: number) => void;
}

// A rate input, drawn as the money field is. The rate is held as a
// fraction and shown as a percentage, so 0.021 reads 2.10% and a typed
// 2.1 commits as 0.021: Intl formats the one way, with the options the
// ledger formats with, and the number field parses the other. Arrow keys
// step by a tenth of a point, a whole point with shift.
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
        format={percentFormat}
        largeStep={0.01}
        onValueCommitted={onValueCommitted}
        step={0.001}
      />
    </Field>
  );
}
