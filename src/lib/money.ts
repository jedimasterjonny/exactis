// Money is en-GB currency, never abbreviated but on a chart's axis and
// never carrying pence in a balance. The sign is a real minus, U+2212,
// never the hyphen Intl writes, and only on what is below nothing once
// rounded: by default Intl signs minus nothing, and a few pence going
// out, as "-£0".
const gbp = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  maximumFractionDigits: 0,
  signDisplay: "negative",
  style: "currency",
});

// A count of millions or thousands, to two places where it needs them.
const scaled = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

// A sum shortened for a chart's axis, the one place money is abbreviated:
// a tick marks a place on the scale rather than a sum to be read to the
// pound, and written in full the ticks took a quarter of a phone's plot.
// Millions read "£7m" and thousands "£500k", to two places where the
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

// A sum of money or security quote to two (or up to six) decimal
// places: en-GB grouping, a real minus (U+2212) only on sums below
// nothing once rounded, pence marked "p" for GBX, and a safe
// plain-decimal fallback for any code Intl rejects as an ISO currency.
const decimals = {
  2: new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    signDisplay: "negative",
  }),
  6: new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    signDisplay: "negative",
  }),
};

const currencies = new Map<string, Intl.NumberFormat | null>();

// A count of fund shares or units, to up to eight decimal places
// matching Portfolio Performance's 1e8 precision, with no trailing
// zeroes and a real minus on negative counts.
const sharesFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 8,
  signDisplay: "negative",
});

export function formatCurrency(value: number, currency: string): string {
  return formatDecimalCurrency(value, currency, 2);
}

export function formatGbp(value: number): string {
  return gbp.format(value).replace(/^-/, "−");
}

export function formatPrice(value: number, currency: string): string {
  return formatDecimalCurrency(value, currency, 6);
}

export function formatShares(value: number): string {
  return sharesFormat.format(value).replace(/^-/, "−");
}

// The Intl format options PriceField hands Base UI to format and parse
// quotes in the currency given: currency style for ISO codes Intl
// accepts, or plain decimals for GBX pence and any non-ISO code so
// NumberField never throws RangeError.
export function priceFormatOf(currency: string): Intl.NumberFormatOptions {
  if (currency !== "GBX" && isoFormatter(currency, 6) !== null) {
    return {
      currency,
      maximumFractionDigits: 6,
      minimumFractionDigits: 2,
      style: "currency",
    };
  }
  return { maximumFractionDigits: 6, minimumFractionDigits: 2 };
}

// A move in pounds, signed whichever way it went, as a figure standing
// for a change is written: "+£1,250", "−£300", and a move that rounds
// to nothing as "£0", unsigned.
const signedGbp = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
  style: "currency",
});

export function formatSignedGbp(value: number): string {
  return signedGbp.format(value).replace(/^-/, "−");
}

// The figure with its sign turned, and nothing left as nothing rather
// than as minus nothing, which a money field formatting with Intl's own
// sign writes with its minus: a car or house owing nothing would open
// its dialog with "-£0" owed.
export function negated(figure: number): number {
  return figure === 0 ? 0 : -figure;
}

// A rate is held as a fraction and shown as a percentage to two places,
// so 0 reads 0.00% and 0.021 reads 2.10%, and a fall too small to show
// reads 0.00% rather than -0.00%. The options are one statement
// the ledger formats with and the rate field hands Base UI to format and
// parse with, so what a row shows and what a field takes agree.
export const percentFormat: Intl.NumberFormatOptions = {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  signDisplay: "negative",
  style: "percent",
};

const percent = new Intl.NumberFormat("en-GB", percentFormat);

// A rate read off a market curve is quoted a place finer than a rate
// the plan is set at, so 0.03365 reads 3.365%, and a fall too small to
// show reads 0.000%.
const curveRate = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 3,
  minimumFractionDigits: 3,
  signDisplay: "negative",
  style: "percent",
});

export function formatCurveRate(value: number): string {
  return curveRate.format(value).replace(/^-/, "−");
}

// A chance, a share of a count of futures, is shown as a whole
// percentage, since a run of a thousand pins it no closer than a point
// or two: 0.881 reads 88%. A share short of all reads as 99% at the
// most, and one more than none as 1% at the least, so only all reads
// as 100% and only none as 0%.
const wholePercent = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
  style: "percent",
});

export function formatPercent(value: number): string {
  return percent.format(value).replace(/^-/, "−");
}

export function formatWholePercent(value: number): string {
  return wholePercent.format(
    value > 0 && value < 1 ? Math.min(Math.max(value, 0.01), 0.99) : value,
  );
}

// The chance of success is rounded down rather than to the nearest, so
// it reads 90% only once 9 in 10 futures last, as the breaking points
// count them: 0.899 reads 89%. One more than none still reads 1%.
const chancePercent = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
  roundingMode: "floor",
  style: "percent",
});

export function formatChance(value: number): string {
  return chancePercent.format(value > 0 ? Math.max(value, 0.01) : value);
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

function formatDecimalCurrency(
  value: number,
  currency: string,
  maximumFractionDigits: keyof typeof decimals,
): string {
  if (currency === "GBX") {
    return `${decimals[maximumFractionDigits].format(value).replace(/^-/, "−")}p`;
  }
  const formatter = isoFormatter(currency, maximumFractionDigits);
  if (formatter === null) {
    const figure = decimals[maximumFractionDigits]
      .format(value)
      .replace(/^-/, "−");
    return currency === "" ? figure : `${figure} ${currency}`;
  }
  return formatter.format(value).replace(/^-/, "−");
}

// An en-GB currency formatter cached by ISO code and precision, or null
// for a code Intl rejects so bookkeeping displays never throw.
function isoFormatter(
  currency: string,
  maximumFractionDigits: keyof typeof decimals,
): Intl.NumberFormat | null {
  const key = `${currency}:${String(maximumFractionDigits)}`;
  const cached = currencies.get(key);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const formatter = new Intl.NumberFormat("en-GB", {
      currency,
      maximumFractionDigits,
      minimumFractionDigits: 2,
      signDisplay: "negative",
      style: "currency",
    });
    currencies.set(key, formatter);
    return formatter;
  } catch {
    currencies.set(key, null);
    return null;
  }
}
