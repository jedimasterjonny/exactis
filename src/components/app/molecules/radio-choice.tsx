import type { JSX } from "react";

import { cn } from "cn";
import { useId } from "react";

import { RadioGroupItem } from "@/components/kit/radio-group";

interface RadioChoiceProps {
  readonly children: string;
  readonly isDisabled?: boolean;
  readonly label: string;
  readonly value: string;
}

// One choice in a radio group: the radio, its name beside it and a line
// saying what it means beneath the name. The whole of it is the label,
// so a click anywhere on it chooses, but only the name names the radio
// and the line describes it, so a screen reader reads the two apart. A
// choice that cannot be made yet is drawn faint and refuses the pointer.
export function RadioChoice({
  children,
  isDisabled = false,
  label,
  value,
}: RadioChoiceProps): JSX.Element {
  const id = useId();
  return (
    <label
      className={cn(
        "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1",
        isDisabled && "cursor-not-allowed opacity-50",
      )}
    >
      <RadioGroupItem
        aria-describedby={`${id}-detail`}
        aria-labelledby={`${id}-name`}
        className="mt-0.5"
        disabled={isDisabled}
        value={value}
      />
      <span className="font-medium" id={`${id}-name`}>
        {label}
      </span>
      <span
        className="col-start-2 text-sm text-muted-foreground"
        id={`${id}-detail`}
      >
        {children}
      </span>
    </label>
  );
}
