import type { JSX } from "react";

import { NumberField } from "@base-ui/react/number-field";

import { Input } from "@/components/kit/input";

// How a figure is held: uncontrolled, mounting with a default and holding
// what is typed, or controlled, showing the value its caller gives, which
// is what a caller that works a figure out from others passes. A value of
// null shows nothing, for a figure that could not be worked out. Either
// way, what is typed over it commits on blur, so a caller shown a figure
// can take a typed one back.
export type Figure =
  | { readonly defaultValue: number; readonly value?: undefined }
  | { readonly defaultValue?: undefined; readonly value: null | number };

type FigureInputProps = Figure & {
  readonly format: Intl.NumberFormatOptions;
  readonly largeStep: number;
  readonly onValueCommitted?: ((value: number) => void) | undefined;
  readonly step: number;
};

// The control every figure in the product is entered through: Base UI's
// number field, drawing the input chrome as a mono right-aligned figure.
// The number field owns parsing, formatting and stepping; the caller says
// how the figure is written and how far a key steps it, with shift. The
// value commits on blur, as fields do in the product, and never on the
// wheel: a balance changing under a scroll is a hazard. A figure cleared
// to nothing commits null, which is dropped here rather than reported: a
// cleared figure is left as it was, never written as nothing, and every
// caller wanted the same. Every money, rate and year value is entered
// through this rather than a text input.
export function FigureInput({
  defaultValue,
  format,
  largeStep,
  onValueCommitted,
  step,
  value,
}: FigureInputProps): JSX.Element {
  return (
    <NumberField.Root
      defaultValue={defaultValue}
      format={format}
      largeStep={largeStep}
      locale="en-GB"
      onValueCommitted={(committed) => {
        if (committed !== null) {
          onValueCommitted?.(committed);
        }
      }}
      step={step}
      value={value}
    >
      <NumberField.Group>
        <NumberField.Input render={<Input className="text-right figure" />} />
      </NumberField.Group>
    </NumberField.Root>
  );
}
