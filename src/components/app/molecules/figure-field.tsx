import type { ComponentProps, JSX } from "react";

import type { Figure } from "@/components/app/atoms/figure-input";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";
import { currencyFormatOf, percentFormat, priceFormatOf } from "@/lib/money";

type ClearableBounds = "max" | "min" | "onCleared" | "onValueChange";

type FigureFieldProps = ComponentProps<typeof FigureInput> & {
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly label: string;
};

// What a field may be given beside its figure. Each takes a label and a
// commit, and picks what else it forwards from the rest.
interface Forwarded {
  readonly error?: string;
  readonly hint?: string;
  readonly isReadOnly?: boolean;
  readonly label: string;
  readonly max?: number;
  readonly min?: number;
  readonly onCleared?: () => void;
  readonly onValueChange?: (value: null | number) => void;
  readonly onValueCommitted?: (value: number) => void;
}

type PresetProps<TForwarded extends keyof Forwarded> = Figure &
  Pick<Forwarded, "label" | "onValueCommitted" | TForwarded>;

// How each kind of figure is written, and how far an arrow key steps it,
// then with shift.
const presets = {
  // A count is whole, a fraction typed rounded to one. One at a time,
  // five with shift.
  count: { format: { maximumFractionDigits: 0 }, largeStep: 5, step: 1 },
  // Whole pounds are formatted by Intl, so the £ and the thousands
  // separators are the field's own and never typed.
  money: {
    format: { currency: "GBP", maximumFractionDigits: 0, style: "currency" },
    largeStep: 1000,
    step: 100,
  },
  // A multiple is written to two places where it needs them, so 25
  // reads 25 and 2.5 reads 2.5. One at a time, five with shift.
  multiple: { format: { maximumFractionDigits: 2 }, largeStep: 5, step: 1 },
  // A rate is held as a fraction and shown as a percentage, so 0.021
  // reads 2.10% and a typed 2.1 commits as 0.021: Intl formats the one
  // way, with the options the ledger formats with, and the number field
  // parses the other. A tenth of a point, a whole point with shift.
  rate: { format: percentFormat, largeStep: 0.01, step: 0.001 },
  // A count of fund shares or units, to up to eight decimal places as
  // Portfolio Performance writes them. One at a time, ten with shift.
  shares: { format: { maximumFractionDigits: 8 }, largeStep: 10, step: 1 },
  // A year is a whole number written without a separator, so 2026 never
  // reads 2,026, and a fraction typed is rounded to one, as an age is.
  year: {
    format: { maximumFractionDigits: 0, useGrouping: false },
    largeStep: 10,
    step: 1,
  },
} satisfies Record<
  string,
  Pick<FigureFieldProps, "format" | "largeStep" | "step">
>;

// A count input, of so many trades, held inside the bounds it is given
// if any.
export function CountField(props: PresetProps<"max" | "min">): JSX.Element {
  return <FigureField {...props} {...presets.count} />;
}

// A two-decimal currency input formatted in the ISO currency given, or
// plain decimals for GBX and non-ISO codes so Base UI never throws.
export function CurrencyField({
  currency,
  ...props
}: PresetProps<ClearableBounds> & {
  readonly currency: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
}): JSX.Element {
  return (
    <FigureField
      {...props}
      format={currencyFormatOf(currency)}
      largeStep={100}
      step={1}
    />
  );
}

// A money input, under a hint that carries the derivation. The figure is
// held inside the bounds it is given if any, which the number field
// clamps a typed sum to when it commits: what is owed on a loan is never
// less than nothing. A sum worked out elsewhere is shown read-only.
export function MoneyField(
  props: PresetProps<"isReadOnly" | "max" | "min"> & {
    readonly hint?: string | undefined;
  },
): JSX.Element {
  return <FigureField {...props} {...presets.money} />;
}

// A money input with no field of its own, for a caller that lays its
// label and its hint out around more than the input, as a worksheet's
// row does around the input and the press that checks it.
export function MoneyInput(
  props: Figure & Pick<Forwarded, "onValueCommitted">,
): JSX.Element {
  return <FigureInput {...props} {...presets.money} />;
}

// A multiple input, a goal's so many years of expenses or times the
// debt, held inside the bounds it is given if any, so one below nothing
// cannot be typed.
export function MultipleField(
  props: PresetProps<"max" | "min"> & { readonly hint?: string | undefined },
): JSX.Element {
  return <FigureField {...props} {...presets.multiple} />;
}

// A security's quote price, to between two and six decimal places:
// formatted in its ISO currency where Intl accepts it, or as plain
// decimals for GBX pence and any non-ISO code so Base UI never throws.
// Steps by a penny, or a unit with shift, and reports clearing so an
// optional quote can return to none.
export function PriceField({
  currency,
  ...props
}: PresetProps<ClearableBounds> & {
  readonly currency: string;
  readonly hint?: string | undefined;
}): JSX.Element {
  return (
    <FigureField
      {...props}
      format={priceFormatOf(currency)}
      largeStep={1}
      step={0.01}
    />
  );
}

// A rate input. An error is the caller's, for a rate it could not work
// out, and a rate worked out elsewhere is shown read-only.
export function RateField(
  props: PresetProps<"error" | "hint" | "isReadOnly" | "max" | "min">,
): JSX.Element {
  return <FigureField {...props} {...presets.rate} />;
}

// A share count input accepting up to eight decimal places.
export function SharesField(
  props: PresetProps<ClearableBounds> & { readonly hint?: string | undefined },
): JSX.Element {
  return <FigureField {...props} {...presets.shares} />;
}

// A year input, under a hint that carries the age reached, inside the
// bounds it is given if any, so one before the plan cannot be typed,
// and read-only when it is worked out elsewhere.
export function YearField(
  props: PresetProps<"hint" | "isReadOnly" | "max" | "min">,
): JSX.Element {
  return <FigureField {...props} {...presets.year} />;
}

// A count of whole years, or a year, with no field of its own, for a
// cell of a table, where there is no room for a label: written as a year
// is, whole and with no separator, named for a screen reader by what it
// counts, held inside the bounds it is given, and cleared to none where
// the caller takes a clearing.
export function YearsInput(
  props: Figure &
    Pick<Forwarded, "label" | "max" | "min" | "onCleared" | "onValueCommitted">,
): JSX.Element {
  return <FigureInput {...props} {...presets.year} />;
}

// What the fields share: a figure input under a label, a hint and,
// if the caller gives one, an error. The figure is held as the caller
// says, by default or by value.
function FigureField({
  error,
  hint,
  label,
  ...input
}: FigureFieldProps): JSX.Element {
  return (
    <Field error={error} hint={hint} label={label}>
      <FigureInput {...input} />
    </Field>
  );
}
