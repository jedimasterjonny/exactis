import type { JSX } from "react";

import { NumberField } from "@base-ui/react/number-field";

import { Field } from "@/components/app/field";
import { Input } from "@/components/kit/input";

interface YearFieldProps {
  readonly defaultValue: number;
  readonly hint?: string;
  readonly label: string;
  readonly onValueCommitted?: (value: null | number) => void;
}

// A year is a whole number written without a separator, so 2026 never
// reads 2,026. The value commits on blur, as fields do in the product,
// and never on the wheel. Arrow keys step by a year, ten with shift.
const format: Intl.NumberFormatOptions = { useGrouping: false };

// A year input, drawn as the money field is: a mono right-aligned figure
// in the input chrome, under a hint that carries the age reached.
export function YearField({
  defaultValue,
  hint,
  label,
  onValueCommitted,
}: YearFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <NumberField.Root
        defaultValue={defaultValue}
        format={format}
        largeStep={10}
        locale="en-GB"
        onValueCommitted={onValueCommitted}
        step={1}
      >
        <NumberField.Group>
          <NumberField.Input render={<Input className="text-right figure" />} />
        </NumberField.Group>
      </NumberField.Root>
    </Field>
  );
}
