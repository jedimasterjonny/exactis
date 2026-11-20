import type { JSX } from "react";

import { Field } from "@/components/app/atoms/field";
import { Input } from "@/components/kit/input";

interface TextFieldProps {
  readonly defaultValue?: string;
  readonly error?: string | undefined;
  readonly hint?: string;
  readonly label: string;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly value?: string;
}

// A line of text, such as a name or a note, which reports as it is typed,
// so a save can wait for one; every figure goes through a number field
// instead. It holds what it opened on, or the value given where the caller
// holds the text, as a draft restored after it is drawn needs, and shows
// the error given beneath the hint, as a field does.
export function TextField({
  defaultValue,
  error,
  hint,
  label,
  onValueChange,
  placeholder,
  value,
}: TextFieldProps): JSX.Element {
  return (
    <Field error={error} hint={hint} label={label}>
      <Input
        defaultValue={defaultValue}
        onChange={(event) => {
          onValueChange?.(event.target.value);
        }}
        placeholder={placeholder}
        value={value}
      />
    </Field>
  );
}
