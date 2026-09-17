import type { JSX } from "react";

import { NumberField } from "@base-ui/react/number-field";

import { Input } from "@/components/kit/input";

interface FigureInputProps {
  readonly defaultValue: number;
  readonly format: Intl.NumberFormatOptions;
  readonly largeStep: number;
  readonly onValueCommitted?: ((value: null | number) => void) | undefined;
  readonly step: number;
}

// The control every figure in the product is entered through: Base UI's
// number field, drawing the input chrome as a mono right-aligned figure.
// The number field owns parsing, formatting and stepping; the caller says
// how the figure is written and how far a key steps it, with shift. The
// value commits on blur, as fields do in the product, and never on the
// wheel: a balance changing under a scroll is a hazard. Every money, rate
// and year value is entered through this rather than a text input.
export function FigureInput({
  defaultValue,
  format,
  largeStep,
  onValueCommitted,
  step,
}: FigureInputProps): JSX.Element {
  return (
    <NumberField.Root
      defaultValue={defaultValue}
      format={format}
      largeStep={largeStep}
      locale="en-GB"
      onValueCommitted={onValueCommitted}
      step={step}
    >
      <NumberField.Group>
        <NumberField.Input render={<Input className="text-right figure" />} />
      </NumberField.Group>
    </NumberField.Root>
  );
}
