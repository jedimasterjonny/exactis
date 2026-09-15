import type { JSX } from "react";

import { Field } from "@base-ui/react/field";
import { NumberField } from "@base-ui/react/number-field";

import { Input } from "@/components/ui/input";

interface MoneyFieldProps {
  readonly defaultValue: number;
  readonly hint?: string;
  readonly label: string;
  readonly onValueCommitted?: (value: null | number) => void;
}

// Whole pounds are formatted by Intl, so the £ and the thousands separators
// are the field's own and never typed. The value commits on blur, as fields
// do in the product, and never on the wheel: a balance changing under a
// scroll is a hazard. Arrow keys step by a hundred, a thousand with shift.
const format: Intl.NumberFormatOptions = {
  currency: "GBP",
  maximumFractionDigits: 0,
  style: "currency",
};

// A money input: a micro-label above, a mono right-aligned figure in the
// input chrome, and a hint beneath that carries the derivation. Base UI's
// field wires the label and the hint to the input; its number field owns
// parsing, formatting and stepping. Every money, rate and year value in the
// product is entered through a number field rather than a text input.
export function MoneyField({
  defaultValue,
  hint,
  label,
  onValueCommitted,
}: MoneyFieldProps): JSX.Element {
  return (
    <Field.Root className="grid gap-1.5">
      <Field.Label className="label text-muted-foreground">{label}</Field.Label>
      <NumberField.Root
        defaultValue={defaultValue}
        format={format}
        largeStep={1000}
        locale="en-GB"
        onValueCommitted={onValueCommitted}
        step={100}
      >
        <NumberField.Group>
          <NumberField.Input render={<Input className="text-right figure" />} />
        </NumberField.Group>
      </NumberField.Root>
      {hint !== undefined && (
        <Field.Description className="text-xs text-muted-foreground">
          {hint}
        </Field.Description>
      )}
    </Field.Root>
  );
}
