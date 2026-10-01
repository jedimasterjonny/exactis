import type { JSX } from "react";

import type { Option } from "@/lib/options";

import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/kit/native-select";

// Choices as a select heads them: the heading, and the choices beneath
// it in the order given.
export interface OptionGroup {
  readonly label: string;
  readonly options: readonly Option<string>[];
}

interface CellSelectProps {
  readonly groups: readonly OptionGroup[];
  readonly label: string;
  readonly none: string;
  readonly onValueChange: (value: null | string) => void;
  readonly value: null | string;
}

// A choice made in a cell of a table, where there is no room for a
// label: the native select at the small size, filling the cell, and
// named for a screen reader by what it chooses. It offers none of the
// choices first, in the words given, then each group under its heading.
// The choice shown is the one its caller gives rather than one it holds
// itself, so a caller saving a choice shows it at once and puts it back
// when the save is refused; a caller holding a choice no group offers
// offers it in a group of its own, or the select would show none. What
// is chosen is reported as its value, or as null for none.
export function CellSelect({
  groups,
  label,
  none,
  onValueChange,
  value,
}: CellSelectProps): JSX.Element {
  return (
    <NativeSelect
      aria-label={label}
      className="w-full"
      onChange={(event) => {
        const chosen = event.target.value;
        onValueChange(chosen === "" ? null : chosen);
      }}
      size="sm"
      value={value ?? ""}
    >
      <NativeSelectOption value="">{none}</NativeSelectOption>
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
  );
}
