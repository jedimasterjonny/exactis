// A choice as a select offers it: the value it reports and the label it
// shows.
export interface Option<TValue extends string> {
  readonly label: string;
  readonly value: TValue;
}

// Choices as a select heads them: the heading, and the choices beneath
// it in the order given.
export interface OptionGroup<TValue extends string = string> {
  readonly label: string;
  readonly options: readonly Option<TValue>[];
}

// The choices as a select takes them, in the order given, each named as
// its label says. The labels are a record so every value has one, and
// the order is a list so the dialog offers them as the reference does
// rather than as the record happens to be written.
export function optionsOf<TValue extends string>(
  labels: Record<TValue, string>,
  order: readonly TValue[],
): readonly Option<TValue>[] {
  return order.map((value) => ({ label: labels[value], value }));
}
