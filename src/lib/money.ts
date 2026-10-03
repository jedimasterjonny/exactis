// Money is en-GB currency, never abbreviated but on a chart's axis and
// never carrying pence in a balance. The sign is a real minus, U+2212,
// never the hyphen Intl writes.
const gbp = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  maximumFractionDigits: 0,
  style: "currency",
});

// A count of millions or thousands, to two places where it needs them.
const scaled = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

// A sum shortened for a chart's axis, the one place money is abbreviated:
// a tick marks a place on the scale rather than a sum to be read to the
// pound, and written in full the ticks took a quarter of a phone's plot.
// Millions read "£12m" and thousands "£500k", to two places where the
// tick needs them, "£2.5m", and less than a thousand in full.
export function formatAxisGbp(value: number): string {
  const size = Math.abs(value);
  if (size < 1000) {
    return formatGbp(value);
  }
  const sign = value < 0 ? "−" : "";
  return size < 1_000_000
    ? `${sign}£${scaled.format(size / 1000)}k`
    : `${sign}£${scaled.format(size / 1_000_000)}m`;
}

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

// A rate read off a market curve is quoted a place finer than a rate
// the plan is set at, so 0.03365 reads 3.365%.
const curveRate = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 3,
  minimumFractionDigits: 3,
  style: "percent",
});

export function formatCurveRate(value: number): string {
  return curveRate.format(value).replace(/^-/, "−");
}

export function formatPercent(value: number): string {
  return percent.format(value);
}

// A difference between two rates, in percentage points and written pp,
// never %, to three places or two: 0.00111 taken off a rate reads
// −0.111pp, and 0.0065 to two places 0.65pp. negative signs only what
// is below nothing once rounded, so a sliver taken off reads 0.000pp
// rather than minus nothing, and a rise carries no plus.
const points = {
  2: new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    signDisplay: "negative",
  }),
  3: new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
    signDisplay: "negative",
  }),
};

export function formatPoints(
  value: number,
  places: keyof typeof points = 3,
): string {
  const text = points[places].format(value * 100);
  return `${text.replace(/^-/, "−")}pp`;
}
