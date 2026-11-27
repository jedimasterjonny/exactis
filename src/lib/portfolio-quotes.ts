import { strFromU8 } from "fflate";
import * as z from "zod";

import { isIsoCalendarDate, maxPortfolioScaled } from "@/data/portfolio";
import { downloadBounded } from "@/lib/download";

// Outcome of an automated online quote lookup for a single security.
export type FetchedQuote =
  | {
      readonly convertedFrom?: string;
      readonly date: string;
      readonly price: number;
      readonly securityId: string;
      readonly status: "fetched" | "outlier";
    }
  | {
      readonly reason: string;
      readonly securityId: string;
      readonly status:
        | "currency-mismatch"
        | "failed"
        | "manual-feed"
        | "missing-ticker"
        | "unsupported-feed";
    };

// Minimal stored security metadata read directly from the owned
// .portfolio file on the server for online quote lookup.
export interface QuotableSecurity {
  readonly currency: string;
  readonly feed: string | undefined;
  readonly id: string;
  readonly latestPrice: null | number;
  readonly ticker: string | undefined;
}

// Portfolio Performance quote feed identifiers backed by Yahoo Finance.
export const yahooFeeds: ReadonlySet<string> = new Set([
  "YAHOO",
  "YAHOO-ADJUSTEDCLOSE",
]);

type Eligibility =
  | { readonly kind: "eligible"; readonly ticker: string }
  | { readonly kind: "skipped"; readonly quote: FetchedQuote };

interface EligibleSecurity {
  readonly index: number;
  readonly security: QuotableSecurity;
  readonly ticker: string;
}

interface FetchQuotesOptions {
  readonly budgetMs?: number;
  readonly concurrency?: number;
  readonly patienceMs?: number;
}

const yahooOrigin = "https://query1.finance.yahoo.com";
const defaultBudgetMs = 8000;
const defaultConcurrency = 5;
const defaultPatienceMs = 5000;
const maxResponseBytes = 512_000;

// Strict allowlist for Yahoo Finance ticker symbols (e.g. ABCD.L,
// 0P0000TEST.L, EXMP-B, ^IDX, GBPUSD=X) preventing path traversal or
// query injection.
const tickerPattern = /^[A-Za-z0-9.^=-]{1,32}$/u;

const manualFeeds = new Set(["MANUAL", "NO_DATA"]);

// Safe UTC epoch-second range producing four-digit ISO years.
const minMarketSeconds = -30_610_224_000;
const maxMarketSeconds = 253_402_300_799;

const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          indicators: z
            .object({
              quote: z
                .array(
                  z.object({ close: z.array(z.number().nullable()).nullish() }),
                )
                .nullish(),
            })
            .nullish(),
          meta: z.object({
            currency: z.string().nullish(),
            exchangeTimezoneName: z.string().nullish(),
            regularMarketPrice: z.number().nullish(),
            regularMarketTime: z.number().nullish(),
          }),
          timestamp: z.array(z.number()).nullish(),
        }),
      )
      .nullable(),
  }),
});

type ChartResult = NonNullable<
  z.infer<typeof chartSchema>["chart"]["result"]
>[number];

// Fetches latest market quotes from Yahoo Finance's v8 chart endpoint
// for each eligible security using only server-stored tickers, bounded
// concurrency, per-symbol timeouts, byte caps, an overall serverless
// batch deadline, and GBX/GBP + 10x outlier safeguards. Results preserve
// input order.
export async function fetchYahooQuotes(
  securities: readonly QuotableSecurity[],
  {
    budgetMs = defaultBudgetMs,
    concurrency = defaultConcurrency,
    patienceMs = defaultPatienceMs,
  }: FetchQuotesOptions = {},
): Promise<readonly FetchedQuote[]> {
  const results = new Array<FetchedQuote>(securities.length);
  const queue: EligibleSecurity[] = [];

  for (const [index, security] of securities.entries()) {
    const check = checkEligibility(security);
    if (check.kind === "eligible") {
      queue.push({ index, security, ticker: check.ticker });
    } else {
      results[index] = check.quote;
    }
  }

  if (queue.length === 0) {
    return results;
  }

  const budget = new AbortController();
  const timer = setTimeout(() => {
    budget.abort();
  }, budgetMs);

  const workerCount = Math.min(Math.max(1, concurrency), queue.length);

  async function runWorker(): Promise<void> {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      results[item.index] = budget.signal.aborted
        ? {
            reason: "Quote lookup timed out",
            securityId: item.security.id,
            status: "failed",
          }
        : await fetchOneQuote(item, { patienceMs, signal: budget.signal });
    }
  }

  try {
    await Promise.all(Array.from({ length: workerCount }, runWorker));
  } finally {
    clearTimeout(timer);
  }
  return results;
}

// Checks feed, currency, and ticker eligibility before touching the
// network; returns the trimmed Yahoo ticker when eligible or the
// terminal FetchedQuote result when skipped/rejected.
function checkEligibility(security: QuotableSecurity): Eligibility {
  if (security.feed !== undefined) {
    if (manualFeeds.has(security.feed)) {
      return {
        kind: "skipped",
        quote: {
          reason: "Manual feed — enter manually",
          securityId: security.id,
          status: "manual-feed",
        },
      };
    }
    if (!yahooFeeds.has(security.feed)) {
      return {
        kind: "skipped",
        quote: {
          reason: `${security.feed} feed — enter manually`,
          securityId: security.id,
          status: "unsupported-feed",
        },
      };
    }
  }
  if (security.currency === "") {
    return {
      kind: "skipped",
      quote: {
        reason: "No currency set — enter manually",
        securityId: security.id,
        status: "currency-mismatch",
      },
    };
  }
  const ticker = security.ticker?.trim() ?? "";
  if (ticker === "") {
    return {
      kind: "skipped",
      quote: {
        reason: "No ticker — enter manually",
        securityId: security.id,
        status: "missing-ticker",
      },
    };
  }
  if (!tickerPattern.test(ticker) || ticker === "." || ticker.includes("..")) {
    return {
      kind: "skipped",
      quote: {
        reason: "Ticker symbol is not supported",
        securityId: security.id,
        status: "failed",
      },
    };
  }
  return { kind: "eligible", ticker };
}

// Extracts the latest positive market price and epoch-second timestamp
// from a Yahoo chart result, falling back from regularMarketPrice/Time
// to the latest valid non-null daily close bar.
function extractQuotePoint(
  result: ChartResult,
): null | { readonly price: number; readonly timestamp: number } {
  const latestBar = latestBarOf(result);
  const marketPrice = result.meta.regularMarketPrice;
  const marketTime = result.meta.regularMarketTime;
  if (marketPrice !== undefined && marketPrice !== null && marketPrice > 0) {
    const timestamp =
      marketTime !== undefined && marketTime !== null && marketTime > 0
        ? marketTime
        : latestBar?.timestamp;
    return timestamp === undefined ? null : { price: marketPrice, timestamp };
  }
  return latestBar;
}

async function fetchOneQuote(
  { security, ticker }: EligibleSecurity,
  {
    patienceMs,
    signal,
  }: { readonly patienceMs: number; readonly signal: AbortSignal },
): Promise<FetchedQuote> {
  const url = `${yahooOrigin}/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
  const request = new Request(url, {
    headers: [
      ["Accept", "application/json"],
      ["User-Agent", "Mozilla/5.0 (compatible; Exactis/1.0)"],
    ],
  });
  const sent = await downloadBounded(request, {
    limit: maxResponseBytes,
    patience: patienceMs,
    signal,
    what: `quote for ${ticker}`,
    who: "Yahoo Finance",
  });
  if (typeof sent === "string") {
    return {
      reason: signal.aborted ? "Quote lookup timed out" : sent,
      securityId: security.id,
      status: "failed",
    };
  }
  return parseYahooChart(sent, security);
}

// Formats a UTC epoch-second timestamp as YYYY-MM-DD in the exchange's
// IANA timezone, falling back to UTC if the timezone is omitted or
// unrecognized by Intl.
function isoDateInZone(
  timestampSeconds: number,
  timeZone: null | string | undefined,
): null | string {
  if (
    timestampSeconds < minMarketSeconds ||
    timestampSeconds > maxMarketSeconds
  ) {
    return null;
  }
  const instant = new Date(timestampSeconds * 1000);
  let formatted = instant.toISOString().slice(0, 10);
  if (timeZone !== undefined && timeZone !== null && timeZone !== "") {
    try {
      formatted = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
      }).format(instant);
    } catch {
      // Unrecognized IANA timezone falls back to UTC above.
    }
  }
  return isIsoCalendarDate(formatted) ? formatted : null;
}

function isOutlierPrice(price: number, latestPrice: null | number): boolean {
  return (
    latestPrice !== null &&
    (price >= latestPrice * 10 || price * 10 <= latestPrice)
  );
}

function latestBarOf(
  result: ChartResult,
): null | { readonly price: number; readonly timestamp: number } {
  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  if (
    timestamps === undefined ||
    timestamps === null ||
    closes === undefined ||
    closes === null
  ) {
    return null;
  }
  let latest: null | { readonly price: number; readonly timestamp: number } =
    null;
  for (const [index, ts] of timestamps.entries()) {
    const close = closes.at(index);
    if (close !== null && close !== undefined && close > 0 && ts > 0) {
      latest = { price: close, timestamp: ts };
    }
  }
  return latest;
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    return null;
  }
}

function parseYahooChart(
  bytes: Uint8Array,
  security: QuotableSecurity,
): FetchedQuote {
  const parsed = chartSchema.safeParse(parseJson(bytes));
  const result = parsed.success ? parsed.data.chart.result?.[0] : undefined;
  if (result === undefined) {
    return {
      reason: "Yahoo Finance returned no quote data",
      securityId: security.id,
      status: "failed",
    };
  }
  const point = extractQuotePoint(result);
  if (point === null) {
    return {
      reason: "Yahoo Finance returned no valid price",
      securityId: security.id,
      status: "failed",
    };
  }
  const date = isoDateInZone(point.timestamp, result.meta.exchangeTimezoneName);
  if (date === null) {
    return {
      reason: "Yahoo Finance returned an unreadable quote date",
      securityId: security.id,
      status: "failed",
    };
  }
  return scaleAndValidateQuote({
    date,
    rawCurrency: result.meta.currency?.trim(),
    rawPrice: point.price,
    security,
  });
}

// Normalizes Yahoo's case-sensitive GBp/GBX pence currency before any
// uppercasing, applies GBP <-> GBX scaling when needed, enforces the
// schema price range, and trips the 10x outlier circuit breaker.
function scaleAndValidateQuote({
  date,
  rawCurrency,
  rawPrice,
  security,
}: {
  readonly date: string;
  readonly rawCurrency: string | undefined;
  readonly rawPrice: number;
  readonly security: QuotableSecurity;
}): FetchedQuote {
  if (rawCurrency === undefined || rawCurrency === "") {
    return {
      reason: "Yahoo Finance omitted quote currency",
      securityId: security.id,
      status: "failed",
    };
  }
  const normalized =
    rawCurrency === "GBp" || rawCurrency === "GBX"
      ? "GBX"
      : rawCurrency.toUpperCase();
  let scaledPrice: number;
  let convertedFrom: string | undefined;
  if (normalized === security.currency) {
    scaledPrice = rawPrice;
  } else if (normalized === "GBX" && security.currency === "GBP") {
    scaledPrice = rawPrice / 100;
    convertedFrom = rawCurrency;
  } else if (normalized === "GBP" && security.currency === "GBX") {
    scaledPrice = rawPrice * 100;
    convertedFrom = rawCurrency;
  } else {
    return {
      reason: `Provider returned ${rawCurrency} (expected ${security.currency})`,
      securityId: security.id,
      status: "currency-mismatch",
    };
  }
  const price = Math.round(scaledPrice * 1e6) / 1e6;
  if (Math.round(price * 1e6) < 1 || price > maxPortfolioScaled) {
    return {
      reason: "Returned price is out of range",
      securityId: security.id,
      status: "failed",
    };
  }
  if (isOutlierPrice(price, security.latestPrice)) {
    return {
      ...(convertedFrom !== undefined && { convertedFrom }),
      date,
      price,
      securityId: security.id,
      status: "outlier",
    };
  }
  return {
    ...(convertedFrom !== undefined && { convertedFrom }),
    date,
    price,
    securityId: security.id,
    status: "fetched",
  };
}
