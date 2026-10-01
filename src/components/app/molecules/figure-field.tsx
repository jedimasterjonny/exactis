import type { ComponentProps, JSX } from "react";

import type { Figure } from "@/components/app/atoms/figure-input";

import { Field } from "@/components/app/atoms/field";
import { FigureInput } from "@/components/app/atoms/figure-input";
import { percentFormat } from "@/lib/money";

type FigureFieldProps = ComponentProps<typeof FigureInput> & {
  readonly error?: string;
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
  readonly onValueCommitted?: (value: number) => void;
}

type PresetProps<TForwarded extends keyof Forwarded> = Figure &
  Pick<Forwarded, "label" | "onValueCommitted" | TForwarded>;

// How each kind of figure is written, and how far an arrow key steps it,
// then with shift.
const presets = {
  // Whole pounds are formatted by Intl, so the £ and the thousands
  // separators are the field's own and never typed.
  money: {
    format: { currency: "GBP", maximumFractionDigits: 0, style: "currency" },
    largeStep: 1000,
    step: 100,
  },
  // A rate is held as a fraction and shown as a percentage, so 0.021
  // reads 2.10% and a typed 2.1 commits as 0.021: Intl formats the one
  // way, with the options the ledger formats with, and the number field
  // parses the other. A tenth of a point, a whole point with shift.
  rate: { format: percentFormat, largeStep: 0.01, step: 0.001 },
  // A term is a count of years, to a tenth, since one worked out from a
  // loan's figures seldom lands on a whole one and the tenth is worth
  // showing.
  term: { format: { maximumFractionDigits: 1 }, largeStep: 5, step: 1 },
  // A year is a whole number written without a separator, so 2026 never
  // reads 2,026.
  year: { format: { useGrouping: false }, largeStep: 10, step: 1 },
} satisfies Record<
  string,
  Pick<FigureFieldProps, "format" | "largeStep" | "step">
>;

// A money input, under a hint that carries the derivation. The figure is
// held inside the bounds it is given if any, which the number field
// clamps a typed sum to when it commits: what is owed on a loan is never
// less than nothing.
export function MoneyField(
  props: PresetProps<"max" | "min"> & { readonly hint?: string | undefined },
): JSX.Element {
  return <FigureField {...props} {...presets.money} />;
}

// A rate input. An error is the caller's, for a rate it could not work
// out, and a rate worked out elsewhere is shown read-only.
export function RateField(
  props: PresetProps<"error" | "hint" | "isReadOnly" | "max" | "min">,
): JSX.Element {
  return <FigureField {...props} {...presets.rate} />;
}

// A term input: how long a loan has left to run.
export function TermField(props: PresetProps<"hint">): JSX.Element {
  return <FigureField {...props} {...presets.term} />;
}

// A year input, under a hint that carries the age reached, inside the
// bounds it is given if any, so one before the plan cannot be typed.
export function YearField(
  props: PresetProps<"hint" | "max" | "min">,
): JSX.Element {
  return <FigureField {...props} {...presets.year} />;
}

// What the four fields share: a figure input under a label, a hint and,
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
