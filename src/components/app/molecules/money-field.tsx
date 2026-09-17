import type { JSX } from "react";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";

interface MoneyFieldProps {
  readonly defaultValue: number;
  readonly hint?: string;
  readonly label: string;
  readonly onValueCommitted?: (value: number) => void;
}

// Whole pounds are formatted by Intl, so the £ and the thousands separators
// are the field's own and never typed. Arrow keys step by a hundred, a
// thousand with shift.
const format: Intl.NumberFormatOptions = {
  currency: "GBP",
  maximumFractionDigits: 0,
  style: "currency",
};

// A money input: a figure input under a hint that carries the derivation.
export function MoneyField({
  defaultValue,
  hint,
  label,
  onValueCommitted,
}: MoneyFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <FigureInput
        defaultValue={defaultValue}
        format={format}
        largeStep={1000}
        onValueCommitted={onValueCommitted}
        step={100}
      />
    </Field>
  );
}
