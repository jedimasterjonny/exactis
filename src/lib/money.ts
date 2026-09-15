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
