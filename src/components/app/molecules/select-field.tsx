import type { JSX } from "react";

import { Field as FieldPrimitive } from "@base-ui/react/field";

import type { Option, OptionGroup } from "@/lib/options";

import { Field } from "@/components/app/atoms/field";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/kit/native-select";

type SelectChoice<TValue extends string> =
  | { readonly defaultValue: TValue; readonly value?: undefined }
  | { readonly defaultValue?: undefined; readonly value: TValue };

type SelectFieldProps<TValue extends string> = SelectChoice<TValue> & {
  readonly groups?: readonly OptionGroup<TValue>[];
  readonly hint?: string | undefined;
  readonly isDisabled?: boolean;
  readonly label: string;
  readonly onValueChange?: (value: TValue) => void;
  readonly options?: readonly Option<TValue>[];
};

// A choice from a short fixed list, flat or grouped under optgroup
// headings. The select is Base UI's field control rendered as the
// native select, which is what ties it to the label the field draws.
// The choice may be held uncontrolled via defaultValue or controlled
// via value for filters steered from elsewhere on the screen. The
// change is reported as the option's typed value rather than the
// element's string, so a caller never parses what it already gave. A
// disabled choice is shown as it stands and cannot be changed, for a
// caller whose hint says why.
export function SelectField<TValue extends string>({
  defaultValue,
  groups = [],
  hint,
  isDisabled = false,
  label,
  onValueChange,
  options = [],
  value,
}: SelectFieldProps<TValue>): JSX.Element {
  const allOptions = [...options, ...groups.flatMap((group) => group.options)];

  return (
    <Field hint={hint} label={label}>
      <FieldPrimitive.Control
        {...(value === undefined ? { defaultValue } : { value })}
        onChange={(event) => {
          const chosen = allOptions.find(
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
            {groups.map((group) => (
              <NativeSelectOptGroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
        }
      />
    </Field>
  );
}
