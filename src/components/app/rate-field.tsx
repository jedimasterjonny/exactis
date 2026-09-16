import type { JSX } from "react";

import { NumberField } from "@base-ui/react/number-field";

import { Field } from "@/components/app/field";
import { Input } from "@/components/ui/input";

interface RateFieldProps {
  readonly defaultValue: number;
  readonly hint?: string;
  readonly label: string;
  readonly onValueCommitted?: (value: null | number) => void;
}

// A rate is held as a fraction and shown as a percentage to two places,
// so 0.021 reads 2.10% and a typed 2.1 commits as 0.021: Intl formats the
// one way and the number field parses the other. The value commits on
// blur, as fields do in the product. Arrow keys step by a tenth of a
// point, a whole point with shift.
const format: Intl.NumberFormatOptions = {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "percent",
};

// A rate input, drawn as the money field is: a mono right-aligned figure
// in the input chrome.
export function RateField({
  defaultValue,
  hint,
  label,
  onValueCommitted,
}: RateFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <NumberField.Root
        defaultValue={defaultValue}
        format={format}
        largeStep={0.01}
        locale="en-GB"
        onValueCommitted={onValueCommitted}
        step={0.001}
      >
        <NumberField.Group>
          <NumberField.Input render={<Input className="text-right figure" />} />
        </NumberField.Group>
      </NumberField.Root>
    </Field>
  );
}
