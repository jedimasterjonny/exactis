import type { JSX } from "react";

import { Field as FieldPrimitive } from "@base-ui/react/field";

import { Field } from "@/components/app/atoms/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/kit/native-select";
import { monthName } from "@/lib/months";

interface MonthFieldProps {
  readonly hint?: string | undefined;
  readonly label: string;
  readonly onValueChange?: (month: number) => void;
  readonly value: null | number;
}

// The twelve months by name, January being nought as the date gives it,
// each carrying its number as the option's value.
const months = Array.from({ length: 12 }, (_, month) => ({
  label: monthName(month, "long"),
  value: String(month),
}));

// A choice of a month of the year, held by value, for a month worked out
// from other figures: it shows the month it is given and follows it as
// it changes, and reports a picked one as its number rather than the
// option's string. A value of null shows nothing, for a month that
// could not be worked out, as a dash that cannot be picked back once a
// month has been. The select is Base UI's field control rendered as
// the native select, which is what ties it to the label the field
// draws, as the select field does; it is not that field because that
// one is uncontrolled and always holds a choice, and this one is
// controlled and can hold none.
export function MonthField({
  hint,
  label,
  onValueChange,
  value,
}: MonthFieldProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <FieldPrimitive.Control
        onChange={(event) => {
          const chosen = months.find(
            (month) => month.value === event.target.value,
          );
          if (chosen !== undefined) {
            onValueChange?.(Number(chosen.value));
          }
        }}
        render={
          <NativeSelect className="w-full">
            {value === null && (
              <NativeSelectOption disabled value="">
                —
              </NativeSelectOption>
            )}
            {months.map((month) => (
              <NativeSelectOption key={month.value} value={month.value}>
                {month.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        }
        value={value === null ? "" : String(value)}
      />
    </Field>
  );
}
