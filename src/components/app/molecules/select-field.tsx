import type { JSX } from "react";

import { Field as FieldPrimitive } from "@base-ui/react/field";

import type { Option } from "@/lib/options";

import { Field } from "@/components/app/atoms/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/kit/native-select";

interface SelectFieldProps<TValue extends string> {
  readonly defaultValue: TValue;
  readonly hint?: string | undefined;
  readonly isDisabled?: boolean;
  readonly label: string;
  readonly onValueChange?: (value: TValue) => void;
  readonly options: readonly Option<TValue>[];
}

// A choice from a short fixed list. The select is Base UI's field control
// rendered as the native select, which is what ties it to the label the
// field draws. The change is reported as the option's typed value rather
// than the element's string, so a caller never parses what it already
// gave. A disabled choice is shown as it stands and cannot be changed,
// for a caller whose hint says why.
export function SelectField<TValue extends string>({
  defaultValue,
  hint,
  isDisabled = false,
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
          <NativeSelect className="w-full" disabled={isDisabled}>
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
