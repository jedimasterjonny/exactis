import type { JSX } from "react";

import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";

interface TextFieldProps {
  readonly defaultValue?: string;
  readonly hint?: string;
  readonly label: string;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
}

// The only text a form takes is a name, which reports as it is typed, so a
// save can wait for one; every figure goes through a number field instead.
export function TextField({
  defaultValue,
  hint,
  label,
  onValueChange,
  placeholder,
}: TextFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <Input
        defaultValue={defaultValue}
        onChange={(event) => {
          onValueChange?.(event.target.value);
        }}
        placeholder={placeholder}
      />
    </Field>
  );
}
