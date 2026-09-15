import type { JSX } from "react";

import { Field } from "@base-ui/react/field";

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

interface SelectFieldProps<TValue extends string> {
  readonly defaultValue: TValue;
  readonly hint?: string;
  readonly label: string;
  readonly onValueChange?: (value: TValue) => void;
  readonly options: readonly SelectOption<TValue>[];
}

interface SelectOption<TValue extends string> {
  readonly label: string;
  readonly value: TValue;
}

// A choice from a short fixed list, in the money field's form: a
// micro-label above, the native select in the input chrome, and a hint
// beneath. Base UI's field wires the label and the hint to the select
// through its control, rendered as the select. The change is reported as
// the option's typed value rather than the element's string, so a caller
// never parses what it already gave.
export function SelectField<TValue extends string>({
  defaultValue,
  hint,
  label,
  onValueChange,
  options,
}: SelectFieldProps<TValue>): JSX.Element {
  return (
    <Field.Root className="grid gap-1.5">
      <Field.Label className="label text-muted-foreground">{label}</Field.Label>
      <Field.Control
        defaultValue={defaultValue}
        onChange={(event) => {
          const chosen = options.find(
            (option) => option.value === event.target.value,
          );
          if (chosen !== undefined) {
            onValueChange?.(chosen.value);
          }
        }}
        render={
          <NativeSelect className="w-full">
            {options.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        }
      />
      {hint !== undefined && (
        <Field.Description className="text-xs text-muted-foreground">
          {hint}
        </Field.Description>
      )}
    </Field.Root>
  );
}
