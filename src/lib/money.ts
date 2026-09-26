// Money is en-GB currency, never abbreviated and never carrying pence in a
// balance. The sign is a real minus, U+2212, never the hyphen Intl writes.
const gbp = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  maximumFractionDigits: 0,
  style: "currency",
});

export function formatGbp(value: number): string {
  return gbp.format(value).replace(/^-/, "−");
}

// The figure with its sign turned, and nothing left as nothing rather
// than as minus nothing, which Intl writes with its minus: a balance of
// nothing owed would read "−£0", and a rate of nothing lost "-0.00%".
export function negated(figure: number): number {
  return figure === 0 ? 0 : -figure;
}

// A rate is held as a fraction and shown as a percentage to two places,
// so 0 reads 0.00% and 0.021 reads 2.10%. The options are one statement
// the ledger formats with and the rate field hands Base UI to format and
// parse with, so what a row shows and what a field takes agree.
export const percentFormat: Intl.NumberFormatOptions = {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "percent",
};

const percent = new Intl.NumberFormat("en-GB", percentFormat);

export function formatPercent(value: number): string {
  return percent.format(value);
}
