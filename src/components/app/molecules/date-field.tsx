import type { JSX } from "react";

import { Field } from "@/components/app/atoms/field";
import { Input } from "@/components/kit/input";

interface DateFieldProps {
  readonly hint?: string | undefined;
  readonly label: string;
  readonly onValueChange?: (value: string) => void;
  readonly value: string;
}

// A native ISO calendar date input wrapped in Field so its label and
// hint wire through Base UI context. scheme-light and dark:scheme-dark
// keep the browser's calendar icon legible in both themes.
export function DateField({
  hint,
  label,
  onValueChange,
  value,
}: DateFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <Input
        className="figure scheme-light dark:scheme-dark"
        max="9999-12-31"
        min="1000-01-01"
        onChange={(event) => {
          onValueChange?.(event.target.value);
        }}
        type="date"
        value={value}
      />
    </Field>
  );
}
