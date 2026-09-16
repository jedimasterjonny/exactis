import type { JSX } from "react";

import { Field as FieldPrimitive } from "@base-ui/react/field";

import { Field } from "@/components/field";
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

// A choice from a short fixed list. The select is Base UI's field control
// rendered as the native select, which is what ties it to the label the
// field draws. The change is reported as the option's typed value rather
// than the element's string, so a caller never parses what it already
// gave.
export function SelectField<TValue extends string>({
  defaultValue,
  hint,
  label,
  onValueChange,
  options,
}: SelectFieldProps<TValue>): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <FieldPrimitive.Control
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
    </Field>
  );
}
