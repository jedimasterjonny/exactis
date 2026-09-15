import type { JSX } from "react";

import { Field } from "@base-ui/react/field";

import { Input } from "@/components/ui/input";

interface TextFieldProps {
  readonly defaultValue?: string;
  readonly hint?: string;
  readonly label: string;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
}

// A text input in the money field's form: a micro-label above, the input
// chrome, and a hint beneath. Base UI's field wires the label and the hint
// to the input. The only text a form takes is a name, which reports as it
// is typed, so a save can wait for one; every figure goes through a number
// field instead.
export function TextField({
  defaultValue,
  hint,
  label,
  onValueChange,
  placeholder,
}: TextFieldProps): JSX.Element {
  return (
    <Field.Root className="grid gap-1.5">
      <Field.Label className="label text-muted-foreground">{label}</Field.Label>
      <Input
        defaultValue={defaultValue}
        onChange={(event) => {
          onValueChange?.(event.target.value);
        }}
        placeholder={placeholder}
      />
      {hint !== undefined && (
        <Field.Description className="text-xs text-muted-foreground">
          {hint}
        </Field.Description>
      )}
    </Field.Root>
  );
}
