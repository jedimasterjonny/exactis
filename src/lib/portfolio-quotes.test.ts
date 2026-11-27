// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchedQuote, QuotableSecurity } from "./portfolio-quotes";

import { fetchYahooQuotes, yahooFeeds } from "./portfolio-quotes";

function chartResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function makeSecurity(
  overrides: Partial<QuotableSecurity> & { readonly id: string },
): QuotableSecurity {
  return {
    currency: "GBP",
    feed: undefined,
    latestPrice: 100,
    ticker: "TESTA.L",
    ...overrides,
  };
}

describe("fetchYahooQuotes", () => {
  it("skips manual feeds, unsupported feeds, currency-less securities, missing tickers, and invalid tickers without calling fetch", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);

    expect([...yahooFeeds]).toStrictEqual(["YAHOO", "YAHOO-ADJUSTEDCLOSE"]);

    const results = await fetchYahooQuotes([
      makeSecurity({ feed: "MANUAL", id: "sec-manual" }),
      makeSecurity({ feed: "NO_DATA", id: "sec-nodata" }),
      makeSecurity({ feed: "FT", id: "sec-ft" }),
      makeSecurity({ currency: "", id: "sec-nocur" }),
      makeSecurity({ id: "sec-noticker", ticker: undefined }),
      makeSecurity({ id: "sec-blankticker", ticker: "   " }),
      makeSecurity({ id: "sec-badchars", ticker: "BAD/TICKER?x=1" }),
      makeSecurity({ id: "sec-traversal", ticker: "A..B" }),
      makeSecurity({ id: "sec-dot", ticker: "." }),
      makeSecurity({ id: "sec-toolong", ticker: "A".repeat(33) }),
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toStrictEqual([
      {
        reason: "Manual feed — enter manually",
        securityId: "sec-manual",
        status: "manual-feed",
      },
      {
        reason: "Manual feed — enter manually",
        securityId: "sec-nodata",
        status: "manual-feed",
      },
      {
        reason: "FT feed — enter manually",
        securityId: "sec-ft",
        status: "unsupported-feed",
      },
      {
        reason: "No currency set — enter manually",
        securityId: "sec-nocur",
        status: "currency-mismatch",
      },
      {
        reason: "No ticker — enter manually",
        securityId: "sec-noticker",
        status: "missing-ticker",
      },
      {
        reason: "No ticker — enter manually",
        securityId: "sec-blankticker",
        status: "missing-ticker",
      },
      {
        reason: "Ticker symbol is not supported",
        securityId: "sec-badchars",
        status: "failed",
      },
      {
        reason: "Ticker symbol is not supported",
        securityId: "sec-traversal",
        status: "failed",
      },
      {
        reason: "Ticker symbol is not supported",
        securityId: "sec-dot",
        status: "failed",
      },
      {
        reason: "Ticker symbol is not supported",
        securityId: "sec-toolong",
        status: "failed",
      },
    ]);
  });

  it("fetches Yahoo v8 quotes with encoded tickers and headers, normalizes GBp/GBX/GBP scaling to 6dp, and rejects currency mismatches", async () => {
    const longTicker = "A".repeat(32);
    const responses = new Map<string, Response>([
      [
        "^IDX",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBP",
                  exchangeTimezoneName: "Europe/London",
                  regularMarketPrice: 104.25,
                  // 2026-09-25T15:30:00Z -> 2026-09-25 in Europe/London
                  regularMarketTime: 1_790_350_200,
                },
              },
            ],
          },
        }),
      ],
      [
        "GBPUSD=X",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "USD",
                  exchangeTimezoneName: "America/New_York",
                  // 2026-09-26T02:00:00Z is still 2026-09-25 in America/New_York
                  regularMarketPrice: 210.5,
                  regularMarketTime: 1_790_388_000,
                },
              },
            ],
          },
        }),
      ],
      [
        "TESTB.L",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBp",
                  exchangeTimezoneName: "Europe/London",
                  regularMarketPrice: 11_450.123_456,
                  regularMarketTime: 1_790_350_200,
                },
              },
            ],
          },
        }),
      ],
      [
        "TESTC.L",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBp",
                  exchangeTimezoneName: "Europe/London",
                  regularMarketPrice: 9850,
                  regularMarketTime: 1_790_350_200,
                },
              },
            ],
          },
        }),
      ],
      [
        "TESTD.L",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBP",
                  exchangeTimezoneName: "Europe/London",
                  regularMarketPrice: 12.34,
                  regularMarketTime: 1_790_350_200,
                },
              },
            ],
          },
        }),
      ],
      [
        "TESTMISMATCH",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "USD",
                  exchangeTimezoneName: "America/New_York",
                  regularMarketPrice: 50,
                  regularMarketTime: 1_790_350_200,
                },
              },
            ],
          },
        }),
      ],
      [
        longTicker,
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBP",
                  exchangeTimezoneName: "Europe/London",
                  regularMarketPrice: 42,
                  regularMarketTime: 1_790_350_200,
                },
              },
            ],
          },
        }),
      ],
    ]);

    const seenRequests: Request[] = [];
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        seenRequests.push(request);
        const match = /\/chart\/([^?]+)/u.exec(request.url);
        const symbol =
          match?.[1] === undefined ? "" : decodeURIComponent(match[1]);
        return Promise.resolve(
          responses.get(symbol) ?? new Response("Not Found", { status: 404 }),
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const results: readonly FetchedQuote[] = await fetchYahooQuotes([
      makeSecurity({
        currency: "GBP",
        feed: "YAHOO",
        id: "sec-gbp",
        latestPrice: 100,
        ticker: "^IDX",
      }),
      makeSecurity({
        currency: "GBP",
        feed: "YAHOO-ADJUSTEDCLOSE",
        id: "sec-gbp-from-pence",
        latestPrice: 110,
        ticker: "TESTB.L",
      }),
      makeSecurity({
        currency: "GBX",
        id: "sec-gbx-exact",
        latestPrice: 9800,
        ticker: "TESTC.L",
      }),
      makeSecurity({
        currency: "GBX",
        id: "sec-gbx-from-pounds",
        latestPrice: 1200,
        ticker: "TESTD.L",
      }),
      makeSecurity({
        currency: "USD",
        id: "sec-usd",
        latestPrice: null,
        ticker: "GBPUSD=X",
      }),
      makeSecurity({
        currency: "GBP",
        id: "sec-mismatch",
        latestPrice: 50,
        ticker: "TESTMISMATCH",
      }),
      makeSecurity({
        currency: "GBP",
        id: "sec-max-ticker",
        latestPrice: 40,
        ticker: longTicker,
      }),
    ]);

    expect(seenRequests.map((req) => req.url)).toStrictEqual([
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EIDX?range=5d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/TESTB.L?range=5d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/TESTC.L?range=5d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/TESTD.L?range=5d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/GBPUSD%3DX?range=5d&interval=1d",
      "https://query1.finance.yahoo.com/v8/finance/chart/TESTMISMATCH?range=5d&interval=1d",
      `https://query1.finance.yahoo.com/v8/finance/chart/${longTicker}?range=5d&interval=1d`,
    ]);
    expect(seenRequests[0]?.headers.get("Accept")).toBe("application/json");
    expect(seenRequests[0]?.headers.get("User-Agent")).toBe(
      "Mozilla/5.0 (compatible; Exactis/1.0)",
    );

    expect(results).toStrictEqual([
      {
        date: "2026-09-25",
        price: 104.25,
        securityId: "sec-gbp",
        status: "fetched",
      },
      {
        convertedFrom: "GBp",
        date: "2026-09-25",
        price: 114.501_235,
        securityId: "sec-gbp-from-pence",
        status: "fetched",
      },
      {
        date: "2026-09-25",
        price: 9850,
        securityId: "sec-gbx-exact",
        status: "fetched",
      },
      {
        convertedFrom: "GBP",
        date: "2026-09-25",
        price: 1234,
        securityId: "sec-gbx-from-pounds",
        status: "fetched",
      },
      {
        date: "2026-09-25",
        price: 210.5,
        securityId: "sec-usd",
        status: "fetched",
      },
      {
        reason: "Provider returned USD (expected GBP)",
        securityId: "sec-mismatch",
        status: "currency-mismatch",
      },
      {
        date: "2026-09-25",
        price: 42,
        securityId: "sec-max-ticker",
        status: "fetched",
      },
    ]);
  });

  it("enforces exact 10x and 0.1x outlier circuit-breaker boundaries", async () => {
    const prices = new Map<string, readonly [number, string]>([
      ["AT10X.L", [1000, "GBP"]],
      ["ATPOINT1X.L", [10, "GBP"]],
      ["HIGH.L", [12_000, "GBX"]],
      ["JUSTOVER.L", [11, "GBP"]],
      ["JUSTUNDER.L", [999, "GBP"]],
      ["LOW.L", [1.1, "GBp"]],
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        const match = /\/chart\/([^?]+)/u.exec(url);
        const [price, currency] = prices.get(match?.[1] ?? "") ?? [0, "GBP"];
        return Promise.resolve(
          chartResponse({
            chart: {
              result: [
                {
                  meta: {
                    currency,
                    exchangeTimezoneName: "Europe/London",
                    regularMarketPrice: price,
                    regularMarketTime: 1_790_350_200,
                  },
                },
              ],
            },
          }),
        );
      }),
    );

    const results = await fetchYahooQuotes([
      makeSecurity({
        currency: "GBX",
        id: "sec-high",
        latestPrice: 120,
        ticker: "HIGH.L",
      }),
      makeSecurity({
        currency: "GBP",
        id: "sec-low",
        latestPrice: 100,
        ticker: "LOW.L",
      }),
      makeSecurity({
        currency: "GBP",
        id: "sec-at-10x",
        latestPrice: 100,
        ticker: "AT10X.L",
      }),
      makeSecurity({
        currency: "GBP",
        id: "sec-under-10x",
        latestPrice: 100,
        ticker: "JUSTUNDER.L",
      }),
      makeSecurity({
        currency: "GBP",
        id: "sec-at-0.1x",
        latestPrice: 100,
        ticker: "ATPOINT1X.L",
      }),
      makeSecurity({
        currency: "GBP",
        id: "sec-over-0.1x",
        latestPrice: 100,
        ticker: "JUSTOVER.L",
      }),
    ]);

    expect(results).toStrictEqual([
      {
        date: "2026-09-25",
        price: 12_000,
        securityId: "sec-high",
        status: "outlier",
      },
      {
        convertedFrom: "GBp",
        date: "2026-09-25",
        price: 0.011,
        securityId: "sec-low",
        status: "outlier",
      },
      {
        date: "2026-09-25",
        price: 1000,
        securityId: "sec-at-10x",
        status: "outlier",
      },
      {
        date: "2026-09-25",
        price: 999,
        securityId: "sec-under-10x",
        status: "fetched",
      },
      {
        date: "2026-09-25",
        price: 10,
        securityId: "sec-at-0.1x",
        status: "outlier",
      },
      {
        date: "2026-09-25",
        price: 11,
        securityId: "sec-over-0.1x",
        status: "fetched",
      },
    ]);
  });

  it("falls back across null/omitted Yahoo fields, handles UTC/invalid/rollover timezones, and reports exact failure reasons", async () => {
    const payloads = new Map<string, Response>([
      [
        "BADDATE",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBP",
                  regularMarketPrice: 50,
                  regularMarketTime: 300_000_000_000,
                },
              },
            ],
          },
        }),
      ],
      ["BADJSON", new Response("not json", { status: 200 })],
      [
        "BARONLY",
        chartResponse({
          chart: {
            result: [
              {
                indicators: { quote: [{ close: [null, 99.5, null] }] },
                meta: {
                  currency: "GBP",
                  exchangeTimezoneName: "Invalid/Zone",
                  regularMarketPrice: null,
                  regularMarketTime: null,
                },
                timestamp: [
                  1_790_100_000, 1_790_200_000, 1_790_300_000, 1_790_400_000,
                ],
              },
            ],
          },
        }),
      ],
      ["HTTP500", new Response("Error", { status: 500 })],
      [
        "HUGE",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBP",
                  regularMarketPrice: 90_000_001,
                  regularMarketTime: 1_790_200_000,
                },
              },
            ],
          },
        }),
      ],
      [
        "NOCUR",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: null,
                  regularMarketPrice: 50,
                  regularMarketTime: 1_790_200_000,
                },
              },
            ],
          },
        }),
      ],
      [
        "NOTIME",
        chartResponse({
          chart: {
            result: [
              {
                indicators: { quote: [{ close: [88] }] },
                meta: {
                  currency: "GBP",
                  exchangeTimezoneName: null,
                  regularMarketPrice: 89.25,
                  regularMarketTime: null,
                },
                timestamp: [1_790_200_000],
              },
            ],
          },
        }),
      ],
      [
        "NOTIMENOBAR",
        chartResponse({
          chart: {
            result: [
              {
                indicators: null,
                meta: { currency: "GBP", regularMarketPrice: 89.25 },
                timestamp: null,
              },
            ],
          },
        }),
      ],
      ["NULLRESULT", chartResponse({ chart: { result: null } })],
      [
        "ROLLOVER",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBP",
                  exchangeTimezoneName: "Asia/Tokyo",
                  regularMarketPrice: 50,
                  regularMarketTime: 253_402_300_799,
                },
              },
            ],
          },
        }),
      ],
      [
        "TINY",
        chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBP",
                  regularMarketPrice: 1e-8,
                  regularMarketTime: 1_790_200_000,
                },
              },
            ],
          },
        }),
      ],
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        const match = /\/chart\/([^?]+)/u.exec(url);
        const symbol = match?.[1] ?? "";
        return Promise.resolve(
          payloads.get(symbol) ?? new Response("Not Found", { status: 404 }),
        );
      }),
    );

    const results = await fetchYahooQuotes([
      makeSecurity({ id: "s1", ticker: "BARONLY" }),
      makeSecurity({ id: "s2", ticker: "NOTIME" }),
      makeSecurity({ id: "s3", ticker: "NOTIMENOBAR" }),
      makeSecurity({ id: "s4", ticker: "NULLRESULT" }),
      makeSecurity({ id: "s5", ticker: "BADJSON" }),
      makeSecurity({ id: "s6", ticker: "BADDATE" }),
      makeSecurity({ id: "s7", ticker: "NOCUR" }),
      makeSecurity({ id: "s8", ticker: "TINY" }),
      makeSecurity({ id: "s9", ticker: "HTTP500" }),
      makeSecurity({ id: "s10", ticker: "HUGE" }),
      makeSecurity({ id: "s11", ticker: "ROLLOVER" }),
    ]);

    expect(results).toStrictEqual([
      { date: "2026-09-23", price: 99.5, securityId: "s1", status: "fetched" },
      { date: "2026-09-23", price: 89.25, securityId: "s2", status: "fetched" },
      {
        reason: "Yahoo Finance returned no valid price",
        securityId: "s3",
        status: "failed",
      },
      {
        reason: "Yahoo Finance returned no quote data",
        securityId: "s4",
        status: "failed",
      },
      {
        reason: "Yahoo Finance returned no quote data",
        securityId: "s5",
        status: "failed",
      },
      {
        reason: "Yahoo Finance returned an unreadable quote date",
        securityId: "s6",
        status: "failed",
      },
      {
        reason: "Yahoo Finance omitted quote currency",
        securityId: "s7",
        status: "failed",
      },
      {
        reason: "Returned price is out of range",
        securityId: "s8",
        status: "failed",
      },
      {
        reason:
          "Yahoo Finance answered 500 rather than sending quote for HTTP500",
        securityId: "s9",
        status: "failed",
      },
      {
        reason: "Returned price is out of range",
        securityId: "s10",
        status: "failed",
      },
      {
        reason: "Yahoo Finance returned an unreadable quote date",
        securityId: "s11",
        status: "failed",
      },
    ]);
  });

  it("caps in-flight concurrency to the configured limit while preserving input order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        inFlight -= 1;
        const url = input instanceof Request ? input.url : String(input);
        const match = /\/chart\/T(\d+)/u.exec(url);
        const price = Number(match?.[1] ?? 1) + 100;
        return chartResponse({
          chart: {
            result: [
              {
                meta: {
                  currency: "GBP",
                  exchangeTimezoneName: "Europe/London",
                  regularMarketPrice: price,
                  regularMarketTime: 1_790_350_200,
                },
              },
            ],
          },
        });
      }),
    );

    const results = await fetchYahooQuotes(
      Array.from({ length: 6 }, (_, index) =>
        makeSecurity({ id: `s-${String(index)}`, ticker: `T${String(index)}` }),
      ),
      { concurrency: 2 },
    );

    expect(maxInFlight).toBe(2);
    expect(
      results.map((r) => (r.status === "fetched" ? r.price : null)),
    ).toStrictEqual([100, 101, 102, 103, 104, 105]);
  });

  it("enforces the overall batch time budget and aborts remaining unstarted or slow lookups cleanly", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async (_input, init) => {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        }),
    );

    const results = await fetchYahooQuotes(
      [
        makeSecurity({ id: "slow-1", ticker: "SLOW1.L" }),
        makeSecurity({ id: "slow-2", ticker: "SLOW2.L" }),
      ],
      { budgetMs: 10, concurrency: 1, patienceMs: 5000 },
    );

    expect(results).toStrictEqual([
      {
        reason: "Quote lookup timed out",
        securityId: "slow-1",
        status: "failed",
      },
      {
        reason: "Quote lookup timed out",
        securityId: "slow-2",
        status: "failed",
      },
    ]);
  });
});
