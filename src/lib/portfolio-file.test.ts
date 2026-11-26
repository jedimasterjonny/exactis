// @vitest-environment node
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { Written } from "@/lib/protobuf.fixture";

import { Refusal } from "@/lib/answer";
import {
  clientOf,
  portfolioFile,
  reference,
  samplePortfolioFile,
  taxonomyOf,
} from "@/lib/portfolio-file.fixture";
import {
  int32At,
  int64At,
  joined,
  messageOf,
  messagesAt,
  textAt,
} from "@/lib/protobuf";
import { protobufOf } from "@/lib/protobuf.fixture";

import {
  appendAccount,
  appendSecurity,
  appendTransaction,
  readPortfolios,
  readPortfolioSnapshot,
  readPortfolioTargets,
  readTargets,
  reweighted,
  updateQuotes,
} from "./portfolio-file";

// A transaction as a test writes it out: the security it is on, or
// none, the currency it was made in, sterling unless said, and when it
// has them, the day it was made and its gross value as a unit, as
// Portfolio Performance writes one: the amount in the transaction's
// currency, and for a security priced in another, the same in that
// currency beside it.
interface Made {
  readonly currency?: string;
  readonly day?: number;
  readonly on?: null | string;
  readonly unit?: Written;
}

// A file holding one category, Cash, the whole of the allocation, with
// the holdings given assigned to it by vehicle and weight, among the
// securities and transactions given.
function holding(
  assignments: readonly (readonly [vehicle: string, weight: number])[],
  securities: readonly Written[],
  transactions: readonly Written[],
): Uint8Array {
  return portfolioFile(holdingClient(assignments, securities, transactions));
}

// The client of a file holding, as holding gives it.
function holdingClient(
  assignments: readonly (readonly [vehicle: string, weight: number])[],
  securities: readonly Written[],
  transactions: readonly Written[],
): Written {
  return [
    ...securities.map((each) => [2, each] as const),
    ...transactions.map((each) => [5, each] as const),
    [
      8,
      [
        [2, "Asset Allocation"],
        [5, [[1, "root"]]],
        [
          5,
          [
            [1, "cash"],
            [2, "root"],
            [3, "Cash"],
            [6, 10_000],
            ...assignments.map(
              ([vehicle, weight]) =>
                [
                  9,
                  [
                    [1, vehicle],
                    [2, weight],
                  ],
                ] as const,
            ),
          ],
        ],
      ],
    ],
  ];
}

// A security as a test writes one: its id, a name from it, the
// currency it is priced in, or none, and a close a day, the last its
// price, in hundred-millionths as written.
function security(
  id: string,
  currency: null | string,
  ...closes: readonly number[]
): Written {
  return [
    [1, id],
    [3, `Fund ${id}`],
    ...(currency === null ? [] : [[4, currency] as const]),
    ...closes.map(
      (close, day) =>
        [
          13,
          [
            [1, 20_000 + day],
            [2, close],
          ],
        ] as const,
    ),
  ];
}

// A transaction as a test writes one: its type, its shares in
// hundred-millionths, and the security it is on, or none, or the
// transaction written out.
function transaction(
  kind: number,
  shares: number,
  on: Made | null | string,
): Written {
  const {
    currency = "GBP",
    day,
    on: security = null,
    unit,
  }: Made = on === null || typeof on === "string" ? { on } : on;
  return [
    [2, kind],
    ...(day === undefined ? [] : [[9, [[1, day * 86_400]]] as const]),
    [10, currency],
    [12, shares],
    ...(security === null ? [] : [[14, security] as const]),
    ...(unit === undefined ? [] : [[15, unit] as const]),
  ];
}

// The weight written on each class of a file's Asset Allocation
// taxonomy, by the class's id, read back off the file as Portfolio
// Performance would read it.
function weightsIn(file: Uint8Array): ReadonlyMap<string, number> {
  const client = messageOf(
    (unzipSync(file)["data.portfolio"] ?? new Uint8Array()).subarray(6),
  );
  const taxonomy = messagesAt(client, 8).find(
    (each) => textAt(each, 2) === "Asset Allocation",
  );
  return new Map(
    messagesAt(taxonomy ?? new Map(), 5).map((each) => [
      textAt(each, 1) ?? "",
      int32At(each, 6),
    ]),
  );
}

describe("readPortfolios", () => {
  // A cash account as a test writes one: its id, a name from it, and
  // the currency it is kept in.
  const account = (id: string, currency: string): Written => [
    [1, id],
    [2, `Cash ${id}`],
    [3, currency],
  ];
  // A securities account: its id, its name and the cash account it
  // takes as its reference, or none.
  const portfolio = (id: string, name: string, reference?: string): Written => [
    [1, id],
    [2, name],
    ...(reference === undefined ? [] : [[5, reference] as const]),
  ];
  // A transaction moving cash: its type, the cash account it names, the
  // day it was made, its amount in pence, as Portfolio Performance
  // writes every amount above nothing, and the other account it moves
  // cash to, if any.
  const moving = (
    type: number,
    from: string,
    { day, pence, to }: { day: string; pence: number; to?: string },
  ): Written => [
    [2, type],
    [3, from],
    ...(to === undefined ? [] : [[5, to] as const]),
    [9, [[1, Date.parse(`${day}T09:30:00Z`) / 1000]]],
    [10, "GBP"],
    [11, pence],
  ];

  // The ISA pays in £1,500 on the 25th of August, buys £1,200 of a fund,
  // takes a dividend of £12.34, pays a fee of £2 and takes a delivery of
  // shares naming it, which moves no cash; on the 25th of
  // September it is paid £500 from a current account the file keeps,
  // and moves £100 to the GIA, which is paid into neither. The GIA has
  // £30 taken out on the 1st of October, and £50 paid in and taken out
  // again on the 2nd. A junior account sharing the ISA's name and
  // reference account is read with it, once. An account kept in
  // dollars, one taking no reference account and one with no name are
  // left out.
  it("reads each securities account's cash and what was paid into its reference account by the day", () => {
    const file = portfolioFile([
      ...[
        account("isa-cash", "GBP"),
        account("gia-cash", "GBP"),
        account("bank", "GBP"),
        account("usd-cash", "USD"),
      ].map((each) => [3, each] as const),
      ...[
        portfolio("isa", "ISA", "isa-cash"),
        portfolio("junior", "ISA", "isa-cash"),
        portfolio("gia", "GIA", "gia-cash"),
        portfolio("us", "US", "usd-cash"),
        portfolio("spare", "Spare"),
        portfolio("nameless", "", "gia-cash"),
      ].map((each) => [4, each] as const),
      ...[
        moving(6, "isa-cash", { day: "2026-08-25", pence: 150_000 }),
        [
          ...moving(0, "isa-cash", { day: "2026-08-26", pence: 120_000 }),
          [4, "isa"] as const,
        ],
        moving(8, "isa-cash", { day: "2026-09-01", pence: 1234 }),
        moving(13, "isa-cash", { day: "2026-09-01", pence: 200 }),
        moving(2, "isa-cash", { day: "2026-09-01", pence: 99_999 }),
        moving(5, "bank", { day: "2026-09-25", pence: 50_000, to: "isa-cash" }),
        moving(5, "isa-cash", {
          day: "2026-09-25",
          pence: 10_000,
          to: "gia-cash",
        }),
        moving(7, "gia-cash", { day: "2026-10-01", pence: 3000 }),
        moving(6, "gia-cash", { day: "2026-10-02", pence: 5000 }),
        moving(7, "gia-cash", { day: "2026-10-02", pence: 5000 }),
        moving(6, "usd-cash", { day: "2026-10-02", pence: 5000 }),
        transaction(2, 100_000_000, "security-1"),
      ].map((each) => [5, each] as const),
    ]);

    expect(readPortfolios(file)).toStrictEqual([
      {
        cash: 710,
        name: "ISA",
        paid: [
          { amount: 1500, on: "2026-08-25" },
          { amount: 500, on: "2026-09-25" },
        ],
      },
      { cash: 70, name: "GIA", paid: [{ amount: -30, on: "2026-10-01" }] },
    ]);
  });

  it("refuses what it could not read, as reading the targets does", () => {
    expect(() => readPortfolios(strToU8("Account,Balance\nISA,1000"))).toThrow(
      new Refusal(
        "The file is not a zip, as a Portfolio Performance file saved in binary is",
      ),
    );
  });
});

describe("readPortfolioSnapshot", () => {
  // Epoch day 20_718 is 2026-09-22; 20_720 is 2026-09-24; 20_721 is 2026-09-25.
  it("reads securities accounts, cash accounts, notes, retired flags, FX conversions, and latest quote date", () => {
    const file = portfolioFile([
      [1, 66],
      // Sterling fund priced via historical close on 2026-09-22, then a newer latest quote on 2026-09-25.
      [
        2,
        [
          [1, "sec-gbp"],
          [3, "Global Equity Index"],
          [4, "GBP"],
          [6, "  Core equity tracker  "],
          [7, "GB00TEST0001"],
          [8, "GEIDX"],
          [
            13,
            [
              [1, 20_718],
              [2, 10_000_000_000],
            ],
          ],
          [
            13,
            [
              [1, 20_719],
              [2, 0],
            ],
          ],
          [
            16,
            [
              [1, 20_721],
              [2, 12_550_000_000],
            ],
          ],
        ],
      ],
      // Pence fund where historical close on 2026-09-24 beats a stale latest quote on 2026-09-22.
      [
        2,
        [
          [1, "sec-gbx"],
          [3, "UK Gilts Fund"],
          [4, "GBX"],
          [
            13,
            [
              [1, 20_720],
              [2, 25_000_000_000],
            ],
          ],
          [
            16,
            [
              [1, 20_718],
              [2, 20_000_000_000],
            ],
          ],
        ],
      ],
      // USD fund priced via latest quote alone; FX rate comes from GBP purchase unit (£75 / $100 = 0.75).
      [
        2,
        [
          [1, "sec-usd"],
          [3, "North America ETF"],
          [4, "USD"],
          [
            16,
            [
              [1, 20_718],
              [2, 10_000_000_000],
            ],
          ],
        ],
      ],
      // JPY fund with no GBP FX rate: counted in holdingsCount, valued at 0 without refusing the file.
      [
        2,
        [
          [1, "sec-jpy"],
          [3, "Tokyo Tracker"],
          [4, "JPY"],
          [
            13,
            [
              [1, 20_718],
              [2, 100_000_000_000],
            ],
          ],
        ],
      ],
      // Unpriced retired fund with a zero-close latest quote and omitted currency.
      [
        2,
        [
          [1, "sec-zero"],
          [3, "Pending Launch"],
          [
            16,
            [
              [1, 20_718],
              [2, 0],
            ],
          ],
          [20, 1],
        ],
      ],
      // Cash accounts: GBP reference, USD with known rate, EUR without rate, empty CHF, retired GBP.
      [
        3,
        [
          [1, "cash-isa"],
          [2, "Northstar ISA Cash"],
          [3, "GBP"],
          [4, "  Settled cash  "],
        ],
      ],
      [
        3,
        [
          [1, "cash-usd"],
          [2, "Dollar Cash"],
          [3, "USD"],
        ],
      ],
      [
        3,
        [
          [1, "cash-eur"],
          [2, "Euro Cash"],
          [3, "EUR"],
        ],
      ],
      [
        3,
        [
          [1, "cash-chf"],
          [2, "Swiss Cash"],
          [3, "CHF"],
        ],
      ],
      [
        3,
        [
          [1, "cash-old"],
          [2, "Closed Cash"],
          [3, ""],
          [4, "   "],
          [5, 1],
        ],
      ],
      // Securities accounts: active ISA, retired GIA, empty unlinked.
      [
        4,
        [
          [1, "port-isa"],
          [2, "Northstar ISA"],
          [3, "Tax wrapper"],
          [5, "cash-isa"],
        ],
      ],
      [
        4,
        [
          [1, "port-old"],
          [2, "Closed Dealing"],
          [4, 1],
          [5, "cash-old"],
        ],
      ],
      [
        4,
        [
          [1, "port-empty"],
          [2, "Unfunded"],
        ],
      ],
      // Transactions:
      // Deposit £2,000 into cash-isa.
      [
        5,
        [
          [2, 6],
          [3, "cash-isa"],
          [10, "GBP"],
          [11, 200_000],
        ],
      ],
      // Purchase 10 shares of sec-gbp (£125.50 each = £1,255.00) from cash-isa into port-isa for £1,255.00.
      [
        5,
        [
          [2, 0],
          [3, "cash-isa"],
          [4, "port-isa"],
          [10, "GBP"],
          [11, 125_500],
          [12, 1_000_000_000],
          [14, "sec-gbp"],
        ],
      ],
      // Purchase 40 shares of sec-gbx (250p = £2.50 each = £100.00) from cash-isa into port-isa for £100.00.
      [
        5,
        [
          [2, 0],
          [3, "cash-isa"],
          [4, "port-isa"],
          [10, "GBP"],
          [11, 10_000],
          [12, 4_000_000_000],
          [14, "sec-gbx"],
        ],
      ],
      // Purchase 2 shares of sec-usd ($100 each * 0.75 = £150.00) in GBP with FX unit into port-isa for £150.00.
      [
        5,
        [
          [2, 0],
          [3, "cash-isa"],
          [4, "port-isa"],
          [9, [[1, 1_789_000_000]]],
          [10, "GBP"],
          [11, 15_000],
          [12, 200_000_000],
          [14, "sec-usd"],
          [
            15,
            [
              [2, 15_000],
              [4, 20_000],
              [5, "USD"],
            ],
          ],
        ],
      ],
      // Inbound delivery of 5 shares of sec-jpy naming cash-isa (no cash impact, counts as a transaction).
      [
        5,
        [
          [2, 2],
          [3, "cash-isa"],
          [4, "port-isa"],
          [10, "GBP"],
          [11, 50_000],
          [12, 500_000_000],
          [14, "sec-jpy"],
        ],
      ],
      // Buy and sell all shares of sec-zero in port-isa (net 0 shares, not counted in holdingsCount).
      [
        5,
        [
          [2, 2],
          [4, "port-isa"],
          [12, 100_000_000],
          [14, "sec-zero"],
        ],
      ],
      [
        5,
        [
          [2, 3],
          [4, "port-isa"],
          [12, 100_000_000],
          [14, "sec-zero"],
        ],
      ],
      // Delivery of an unlisted security and 1 share of sec-gbp (£125.50) into retired port-old
      // (excluded from active totalInvested).
      [
        5,
        [
          [2, 2],
          [4, "port-old"],
          [12, 100_000_000],
          [14, "sec-missing"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-old"],
          [12, 100_000_000],
          [14, "sec-gbp"],
        ],
      ],
      // Cash transfer of £100 from cash-isa to cash-old (counts on both accounts).
      [
        5,
        [
          [2, 5],
          [3, "cash-isa"],
          [5, "cash-old"],
          [10, "GBP"],
          [11, 10_000],
        ],
      ],
      // Cash transfer with no destination account (outflow from cash-isa only).
      [
        5,
        [
          [2, 5],
          [3, "cash-isa"],
          [10, "GBP"],
          [11, 500],
        ],
      ],
      // Deposit $200 into cash-usd (£150 at 0.75) and €400 into cash-eur (no rate).
      [
        5,
        [
          [2, 6],
          [3, "cash-usd"],
          [10, "USD"],
          [11, 20_000],
        ],
      ],
      [
        5,
        [
          [2, 6],
          [3, "cash-eur"],
          [10, "EUR"],
          [11, 40_000],
        ],
      ],
      // Optional Asset Allocation taxonomy with nested leaves and multi-assigned security.
      [
        8,
        [
          [1, "tax-regions"],
          [2, "Regions"],
        ],
      ],
      [
        8,
        [
          [1, "tax-aa"],
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "aa-root"],
              [3, "Asset Allocation"],
            ],
          ],
          [
            5,
            [
              [1, "aa-eq"],
              [2, "aa-root"],
              [3, "Equities"],
            ],
          ],
          [
            5,
            [
              [1, "aa-dev"],
              [2, "aa-eq"],
              [3, "  Global equity  "],
              [
                9,
                [
                  [1, "sec-gbp"],
                  [2, 5000],
                ],
              ],
              [
                9,
                [
                  [1, "sec-usd"],
                  [2, 10_000],
                ],
              ],
            ],
          ],
          [
            5,
            [
              [1, "aa-bonds"],
              [2, "aa-root"],
              [3, "UK gilts"],
              [
                9,
                [
                  [1, "sec-gbp"],
                  [2, 5000],
                ],
              ],
              [
                9,
                [
                  [1, "sec-gbx"],
                  [2, 10_000],
                ],
              ],
            ],
          ],
          [
            5,
            [
              [1, "aa-blank"],
              [2, "aa-root"],
              [3, "   "],
            ],
          ],
        ],
      ],
      [12, "GBP"],
    ]);

    const { transactions, ...rest } = readPortfolioSnapshot(
      file,
      "household.portfolio",
    );

    expect(transactions).toHaveLength(13);
    expect(rest).toStrictEqual({
      baseCurrency: "GBP",
      cashAccounts: [
        {
          balance: 390,
          balanceGbp: 390,
          currency: "GBP",
          id: "cash-isa",
          isRetired: false,
          name: "Northstar ISA Cash",
          note: "Settled cash",
          transactionCount: 7,
        },
        {
          balance: 200,
          balanceGbp: 150,
          currency: "USD",
          id: "cash-usd",
          isRetired: false,
          name: "Dollar Cash",
          transactionCount: 1,
        },
        {
          balance: 400,
          balanceGbp: null,
          currency: "EUR",
          id: "cash-eur",
          isRetired: false,
          name: "Euro Cash",
          transactionCount: 1,
        },
        {
          balance: 0,
          balanceGbp: 0,
          currency: "CHF",
          id: "cash-chf",
          isRetired: false,
          name: "Swiss Cash",
          transactionCount: 0,
        },
        {
          balance: 100,
          balanceGbp: 100,
          currency: "GBP",
          id: "cash-old",
          isRetired: true,
          name: "Closed Cash",
          transactionCount: 1,
        },
      ],
      categories: [
        { id: "aa-dev", name: "Global equity" },
        { id: "aa-bonds", name: "UK gilts" },
      ],
      fileName: "household.portfolio",
      holdings: [
        {
          category: "Global equity, UK gilts",
          currency: "GBP",
          gbpRate: 1,
          id: "sec-gbp",
          isin: "GB00TEST0001",
          isRetired: false,
          latestPrice: 125.5,
          latestPriceDate: "2026-09-25",
          name: "Global Equity Index",
          note: "Core equity tracker",
          shares: 10,
          sharesByAccount: [{ portfolioId: "port-isa", shares: 10 }],
          ticker: "GEIDX",
        },
        {
          category: "UK gilts",
          currency: "GBX",
          gbpRate: 0.01,
          id: "sec-gbx",
          isRetired: false,
          latestPrice: 250,
          latestPriceDate: "2026-09-24",
          name: "UK Gilts Fund",
          shares: 40,
          sharesByAccount: [{ portfolioId: "port-isa", shares: 40 }],
        },
        {
          category: "Global equity",
          currency: "USD",
          gbpRate: 0.75,
          id: "sec-usd",
          isRetired: false,
          latestPrice: 100,
          latestPriceDate: "2026-09-22",
          name: "North America ETF",
          shares: 2,
          sharesByAccount: [{ portfolioId: "port-isa", shares: 2 }],
        },
        {
          currency: "JPY",
          gbpRate: null,
          id: "sec-jpy",
          isRetired: false,
          latestPrice: 1000,
          latestPriceDate: "2026-09-22",
          name: "Tokyo Tracker",
          shares: 5,
          sharesByAccount: [{ portfolioId: "port-isa", shares: 5 }],
        },
        {
          currency: "",
          gbpRate: null,
          id: "sec-zero",
          isRetired: true,
          latestPrice: null,
          latestPriceDate: null,
          name: "Pending Launch",
          shares: 0,
          sharesByAccount: [],
        },
      ],
      latestQuoteDate: "2026-09-25",
      securitiesAccounts: [
        {
          holdingsCount: 4,
          id: "port-isa",
          isRetired: false,
          marketValue: 1505,
          name: "Northstar ISA",
          note: "Tax wrapper",
          referenceAccountId: "cash-isa",
        },
        {
          holdingsCount: 1,
          id: "port-old",
          isRetired: true,
          marketValue: 125.5,
          name: "Closed Dealing",
          referenceAccountId: "cash-old",
        },
        {
          holdingsCount: 0,
          id: "port-empty",
          isRetired: false,
          marketValue: 0,
          name: "Unfunded",
        },
      ],
      totalCash: 540,
      totalInvested: 1505,
    });
  });

  it("defaults baseCurrency to GBP when omitted and handles undated or missing quotes", () => {
    const file = portfolioFile([
      [
        2,
        [
          [1, "sec-undated"],
          [3, "Undated Fund"],
          [4, "GBP"],
          [13, [[2, 5_000_000_000]]],
          [16, [[2, 6_000_000_000]]],
        ],
      ],
      [
        4,
        [
          [1, "port-1"],
          [2, "Dealing"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-1"],
          [12, 200_000_000],
          [14, "sec-undated"],
        ],
      ],
    ]);

    expect(readPortfolioSnapshot(file, "plain.portfolio")).toStrictEqual({
      baseCurrency: "GBP",
      cashAccounts: [],
      categories: [],
      fileName: "plain.portfolio",
      holdings: [
        {
          currency: "GBP",
          gbpRate: 1,
          id: "sec-undated",
          isRetired: false,
          latestPrice: 60,
          latestPriceDate: null,
          name: "Undated Fund",
          shares: 2,
          sharesByAccount: [{ portfolioId: "port-1", shares: 2 }],
        },
      ],
      latestQuoteDate: null,
      securitiesAccounts: [
        {
          holdingsCount: 1,
          id: "port-1",
          isRetired: false,
          marketValue: 120,
          name: "Dealing",
        },
      ],
      totalCash: 0,
      totalInvested: 120,
      transactions: [
        {
          amount: 0,
          currency: "GBP",
          date: "1970-01-01",
          fees: 0,
          id: "tx-0",
          portfolioId: "port-1",
          portfolioName: "Dealing",
          securityId: "sec-undated",
          securityName: "Undated Fund",
          shares: 2,
          taxes: 0,
          timestamp: 0,
          type: "inbound-delivery",
        },
      ],
    });
  });

  it("preserves a non-GBP baseCurrency and keeps dated quotes ahead of undated ones", () => {
    const file = portfolioFile([
      [
        2,
        [
          [1, "sec-dated"],
          [3, "Dated Fund"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_720],
              [2, 5_000_000_000],
            ],
          ],
          [16, [[2, 9_000_000_000]]],
        ],
      ],
      [
        4,
        [
          [1, "port-1"],
          [2, "Dealing"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-1"],
          [12, 100_000_000],
          [14, "sec-dated"],
        ],
      ],
      [12, "USD"],
    ]);

    expect(readPortfolioSnapshot(file, "dollar.portfolio")).toStrictEqual({
      baseCurrency: "USD",
      cashAccounts: [],
      categories: [],
      fileName: "dollar.portfolio",
      holdings: [
        {
          currency: "GBP",
          gbpRate: 1,
          id: "sec-dated",
          isRetired: false,
          latestPrice: 50,
          latestPriceDate: "2026-09-24",
          name: "Dated Fund",
          shares: 1,
          sharesByAccount: [{ portfolioId: "port-1", shares: 1 }],
        },
      ],
      latestQuoteDate: "2026-09-24",
      securitiesAccounts: [
        {
          holdingsCount: 1,
          id: "port-1",
          isRetired: false,
          marketValue: 50,
          name: "Dealing",
        },
      ],
      totalCash: 0,
      totalInvested: 50,
      transactions: [
        {
          amount: 0,
          currency: "USD",
          date: "1970-01-01",
          fees: 0,
          id: "tx-0",
          portfolioId: "port-1",
          portfolioName: "Dealing",
          securityId: "sec-dated",
          securityName: "Dated Fund",
          shares: 1,
          taxes: 0,
          timestamp: 0,
          type: "inbound-delivery",
        },
      ],
    });
  });

  it("handles cross-currency and self cash transfers, skips unknown types, and prefers positive gross FX units", () => {
    const file = portfolioFile([
      [
        2,
        [
          [1, "sec-usd"],
          [3, "Dollar Tracker"],
          [4, "USD"],
          [
            13,
            [
              [1, 20_720],
              [2, 10_000_000_000],
            ],
          ],
          // Older price written after newer price proves sort-agnostic quote picking.
          [
            13,
            [
              [1, 20_700],
              [2, 9_000_000_000],
            ],
          ],
        ],
      ],
      [
        2,
        [
          [1, "sec-eur"],
          [3, "Euro Tracker"],
          [4, "EUR"],
          [16, [[2, 10_000_000_000]]],
        ],
      ],
      [
        3,
        [
          [1, "cash-gbp"],
          [2, "Sterling Cash"],
          [3, "GBP"],
        ],
      ],
      [
        3,
        [
          [1, "cash-usd"],
          [2, "Dollar Cash"],
          [3, "USD"],
        ],
      ],
      [
        3,
        [
          [1, "cash-eur"],
          [2, "Euro Cash"],
          [3, "EUR"],
        ],
      ],
      [
        4,
        [
          [1, "port-main"],
          [2, "Dealing"],
        ],
      ],
      // Cross-currency cash transfer: £100 out of cash-gbp, $125 into cash-usd.
      // Includes a non-gross fee unit before the gross unit and a zero-fx gross unit.
      [
        5,
        [
          [2, 5],
          [3, "cash-gbp"],
          [5, "cash-usd"],
          [9, [[1, 1_789_000_000]]],
          [10, "GBP"],
          [11, 10_000],
          [
            15,
            [
              [1, 2],
              [2, 500],
              [4, 900],
              [5, "USD"],
            ],
          ],
          [
            15,
            [
              [1, 0],
              [2, 10_000],
              [4, 12_500],
              [5, "USD"],
            ],
          ],
          // Noisy tax unit written AFTER gross unit must not overwrite gross FX rate (0.8).
          [
            15,
            [
              [1, 1],
              [2, 1],
              [4, 2],
              [5, "USD"],
            ],
          ],
          // 0p fee unit must never write a 0 FX rate.
          [
            15,
            [
              [1, 2],
              [2, 0],
              [4, 100],
              [5, "USD"],
            ],
          ],
        ],
      ],
      // Transaction with ONLY a tax unit giving EUR rate (0.85) falls back to non-gross unit.
      [
        5,
        [
          [2, 11],
          [3, "cash-gbp"],
          [9, [[1, 1_789_100_000]]],
          [10, "GBP"],
          [11, 850],
          [
            15,
            [
              [1, 1],
              [2, 850],
              [4, 1000],
              [5, "EUR"],
            ],
          ],
        ],
      ],
      // Self-transfer on cash-gbp counts once and leaves balance unchanged.
      [
        5,
        [
          [2, 5],
          [3, "cash-gbp"],
          [5, "cash-gbp"],
          [10, "GBP"],
          [11, 2500],
          [
            15,
            [
              [1, 0],
              [2, 2500],
              [4, 0],
            ],
          ],
        ],
      ],
      // Unknown future transaction enum values are skipped from cash ledger counts.
      [
        5,
        [
          [2, 99],
          [3, "cash-gbp"],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      [
        5,
        [
          [2, -1],
          [3, "cash-gbp"],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      // Deposit €100 into cash-eur to verify tax-unit fallback rate (0.85 -> £85).
      [
        5,
        [
          [2, 6],
          [3, "cash-eur"],
          [10, "EUR"],
          [11, 10_000],
        ],
      ],
      // 1 share of sec-usd ($100 * 0.8 = £80) and 1 share of sec-eur (€100 * 0.85 = £85).
      [
        5,
        [
          [2, 2],
          [4, "port-main"],
          [12, 100_000_000],
          [14, "sec-usd"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-main"],
          [12, 100_000_000],
          [14, "sec-eur"],
        ],
      ],
      [12, "GBP"],
    ]);

    const snapshot = readPortfolioSnapshot(file, "fx.portfolio");

    expect(snapshot.latestQuoteDate).toBe("2026-09-24");
    expect(snapshot.securitiesAccounts).toStrictEqual([
      {
        holdingsCount: 2,
        id: "port-main",
        isRetired: false,
        marketValue: 165,
        name: "Dealing",
      },
    ]);
    expect(snapshot.cashAccounts).toStrictEqual([
      {
        balance: -108.5,
        balanceGbp: -108.5,
        currency: "GBP",
        id: "cash-gbp",
        isRetired: false,
        name: "Sterling Cash",
        transactionCount: 3,
      },
      {
        balance: 125,
        balanceGbp: 100,
        currency: "USD",
        id: "cash-usd",
        isRetired: false,
        name: "Dollar Cash",
        transactionCount: 1,
      },
      {
        balance: 100,
        balanceGbp: 85,
        currency: "EUR",
        id: "cash-eur",
        isRetired: false,
        name: "Euro Cash",
        transactionCount: 1,
      },
    ]);
  });

  it("guards out-of-range quote epoch days, rounds each holding lot to the penny, falls back missing UUIDs, and defaults omitted account currency to baseCurrency", () => {
    const file = portfolioFile([
      // Two securities whose fractional lots each round down from £10.004 to £10.00 (total £20.00, not £20.01).
      [
        2,
        [
          [1, "sec-a"],
          [3, "Fund A"],
          [4, "GBP"],
          [
            13,
            [
              [1, 5_000_000],
              [2, 1_000_400_000],
            ],
          ],
        ],
      ],
      [
        2,
        [
          [1, "sec-b"],
          [3, "Fund B"],
          [4, "GBP"],
          [
            13,
            [
              [1, -1_000_000],
              [2, 1_000_400_000],
            ],
          ],
        ],
      ],
      // Blank UUID and whitespace-only currency on a security.
      [
        2,
        [
          [1, "   "],
          [3, "Blank Id Fund"],
          [4, "   "],
        ],
      ],
      // Cash account with missing UUID and omitted currency (inherits baseCurrency "EUR").
      [3, [[2, "Unnamed Id Cash"]]],
      // Portfolio with missing UUID.
      [4, [[2, "Unnamed Id Portfolio"]]],
      // Portfolio holding the two fractional lots.
      [
        4,
        [
          [1, "port-lots"],
          [2, "Lots Account"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-lots"],
          [12, 100_000_000],
          [14, "sec-a"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-lots"],
          [12, 100_000_000],
          [14, "sec-b"],
        ],
      ],
      [12, "EUR"],
    ]);

    expect(readPortfolioSnapshot(file, "edge.portfolio")).toStrictEqual({
      baseCurrency: "EUR",
      cashAccounts: [
        {
          balance: 0,
          balanceGbp: 0,
          currency: "EUR",
          id: "account-0",
          isRetired: false,
          name: "Unnamed Id Cash",
          transactionCount: 0,
        },
      ],
      categories: [],
      fileName: "edge.portfolio",
      holdings: [
        {
          currency: "GBP",
          gbpRate: 1,
          id: "sec-a",
          isRetired: false,
          latestPrice: 10.004,
          latestPriceDate: null,
          name: "Fund A",
          shares: 1,
          sharesByAccount: [{ portfolioId: "port-lots", shares: 1 }],
        },
        {
          currency: "GBP",
          gbpRate: 1,
          id: "sec-b",
          isRetired: false,
          latestPrice: 10.004,
          latestPriceDate: null,
          name: "Fund B",
          shares: 1,
          sharesByAccount: [{ portfolioId: "port-lots", shares: 1 }],
        },
        {
          currency: "",
          gbpRate: null,
          id: "security-2",
          isRetired: false,
          latestPrice: null,
          latestPriceDate: null,
          name: "Blank Id Fund",
          shares: 0,
          sharesByAccount: [],
        },
      ],
      latestQuoteDate: null,
      securitiesAccounts: [
        {
          holdingsCount: 0,
          id: "portfolio-0",
          isRetired: false,
          marketValue: 0,
          name: "Unnamed Id Portfolio",
        },
        {
          holdingsCount: 2,
          id: "port-lots",
          isRetired: false,
          marketValue: 20,
          name: "Lots Account",
        },
      ],
      totalCash: 0,
      totalInvested: 20,
      transactions: [
        {
          amount: 0,
          currency: "EUR",
          date: "1970-01-01",
          fees: 0,
          id: "tx-0",
          portfolioId: "port-lots",
          portfolioName: "Lots Account",
          securityId: "sec-a",
          securityName: "Fund A",
          shares: 1,
          taxes: 0,
          timestamp: 0,
          type: "inbound-delivery",
        },
        {
          amount: 0,
          currency: "EUR",
          date: "1970-01-01",
          fees: 0,
          id: "tx-1",
          portfolioId: "port-lots",
          portfolioName: "Lots Account",
          securityId: "sec-b",
          securityName: "Fund B",
          shares: 1,
          taxes: 0,
          timestamp: 0,
          type: "inbound-delivery",
        },
      ],
    });
  });

  it("lists securities with no transactions at zero shares", () => {
    const file = portfolioFile([
      [
        2,
        [
          [1, "sec-watch"],
          [3, "Watchlist Tracker"],
          [4, "GBP"],
        ],
      ],
    ]);

    expect(
      readPortfolioSnapshot(file, "watch.portfolio").holdings,
    ).toStrictEqual([
      {
        currency: "GBP",
        gbpRate: 1,
        id: "sec-watch",
        isRetired: false,
        latestPrice: null,
        latestPriceDate: null,
        name: "Watchlist Tracker",
        shares: 0,
        sharesByAccount: [],
      },
    ]);
  });

  it("sums integer shares across accounts without float drift and reads only root-reachable sorted taxonomy leaves", () => {
    const file = portfolioFile([
      [
        2,
        [
          [1, "sec-split"],
          [3, "Split Fund"],
          [4, "GBP"],
          [16, [[2, 10_000_000_000]]],
        ],
      ],
      [
        4,
        [
          [1, "port-1"],
          [2, "First"],
        ],
      ],
      [
        4,
        [
          [1, "port-2"],
          [2, "Second"],
        ],
      ],
      // 0.1 + 0.2 shares across two accounts must equal exact 0.3, not 0.30000000000000004.
      [
        5,
        [
          [2, 2],
          [4, "port-1"],
          [12, 10_000_000],
          [14, "sec-split"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-2"],
          [12, 20_000_000],
          [14, "sec-split"],
        ],
      ],
      [
        8,
        [
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "root"],
              [3, "Asset Allocation"],
            ],
          ],
          // Reverse alphabetical assignment order must still join sorted ("Alpha, Zebra").
          [
            5,
            [
              [1, "z"],
              [2, "root"],
              [3, "Zebra"],
              [
                9,
                [
                  [1, "sec-split"],
                  [2, 5000],
                ],
              ],
            ],
          ],
          [
            5,
            [
              [1, "a"],
              [2, "root"],
              [3, "Alpha"],
              [
                9,
                [
                  [1, "sec-split"],
                  [2, 5000],
                ],
              ],
            ],
          ],
          // Orphaned leaf beneath an unlisted parent is ignored.
          [
            5,
            [
              [1, "orphan"],
              [2, "missing-parent"],
              [3, "Orphan"],
              [
                9,
                [
                  [1, "sec-split"],
                  [2, 10_000],
                ],
              ],
            ],
          ],
          // Cyclic pointer back to root terminates cleanly.
          [
            5,
            [
              [1, "loop"],
              [2, "root"],
              [3, "Loop"],
            ],
          ],
          [
            5,
            [
              [1, "root"],
              [2, "loop"],
              [3, "Back"],
            ],
          ],
        ],
      ],
    ]);

    const snapshot = readPortfolioSnapshot(file, "tax.portfolio");
    expect(snapshot.categories).toStrictEqual([
      { id: "a", name: "Alpha" },
      { id: "loop", name: "Loop" },
      { id: "z", name: "Zebra" },
    ]);
    expect(String(snapshot.holdings[0]?.shares)).toBe("0.3");
    expect(snapshot.holdings[0]?.category).toBe("Alpha, Zebra");

    // Duplicate leaf names disambiguate by full ancestor path beneath the root
    // (skipping blank intermediate names), blank or duplicate ids are ignored,
    // and identical display labels tie-break deterministically by id.
    const disambiguated = portfolioFile([
      [
        2,
        [
          [1, "sec-both"],
          [3, "Multi Index"],
          [4, "GBP"],
        ],
      ],
      [
        8,
        [
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "root"],
              [3, "Asset Allocation"],
            ],
          ],
          [
            5,
            [
              [1, "eq"],
              [2, "root"],
              [3, "Equity"],
            ],
          ],
          [
            5,
            [
              [1, "eq-unnamed"],
              [2, "eq"],
              [3, "   "],
            ],
          ],
          [
            5,
            [
              [1, "eq-dom"],
              [2, "eq-unnamed"],
              [3, "Domestic"],
              [
                9,
                [
                  [1, "sec-both"],
                  [2, 5000],
                ],
              ],
            ],
          ],
          [
            5,
            [
              [1, "bd"],
              [2, "root"],
              [3, "Bonds"],
            ],
          ],
          [
            5,
            [
              [1, "bd-dom"],
              [2, "bd"],
              [3, "Domestic"],
              [
                9,
                [
                  [1, "sec-both"],
                  [2, 5000],
                ],
              ],
            ],
          ],
          // Duplicate leaf id is deduplicated cleanly.
          [
            5,
            [
              [1, "bd-dom"],
              [2, "bd"],
              [3, "Ignored duplicate id"],
            ],
          ],
          // Blank leaf id is ignored cleanly.
          [
            5,
            [
              [1, "   "],
              [2, "root"],
              [3, "No id"],
            ],
          ],
          // Two root-level leaves sharing the same name tie-break by id.
          [
            5,
            [
              [1, "tie-b"],
              [2, "root"],
              [3, "Cash"],
            ],
          ],
          [
            5,
            [
              [1, "tie-a"],
              [2, "root"],
              [3, "Cash"],
            ],
          ],
        ],
      ],
    ]);

    const disambiguatedSnapshot = readPortfolioSnapshot(
      disambiguated,
      "disambiguated.portfolio",
    );
    expect(disambiguatedSnapshot.categories).toStrictEqual([
      { id: "bd-dom", name: "Bonds · Domestic" },
      { id: "tie-a", name: "Cash" },
      { id: "tie-b", name: "Cash" },
      { id: "eq-dom", name: "Equity · Domestic" },
    ]);
    expect(disambiguatedSnapshot.holdings[0]?.category).toBe(
      "Bonds · Domestic, Equity · Domestic",
    );

    // Rootless and empty-root taxonomies return empty categories safely.
    const rootless = portfolioFile([
      [
        8,
        [
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "detached"],
              [2, "missing"],
              [3, "Detached"],
            ],
          ],
        ],
      ],
    ]);
    const emptyRoot = portfolioFile([
      [
        8,
        [
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "root"],
              [3, "Asset Allocation"],
            ],
          ],
        ],
      ],
    ]);

    expect(
      readPortfolioSnapshot(rootless, "rootless.portfolio").categories,
    ).toStrictEqual([]);
    expect(
      readPortfolioSnapshot(emptyRoot, "empty-root.portfolio").categories,
    ).toStrictEqual([]);
  });

  it("decodes transactions newest first with fee/tax units, notes, transfer targets, tie-breaking, and skips unknown types", () => {
    const file = portfolioFile([
      [
        2,
        [
          [1, "sec-world"],
          [3, "Global Equity Index"],
          [4, "GBP"],
        ],
      ],
      [
        3,
        [
          [1, "cash-isa"],
          [2, "Northstar ISA Cash"],
          [3, "GBP"],
        ],
      ],
      [
        3,
        [
          [1, "cash-reserve"],
          [2, "Reserve Cash"],
          [3, "GBP"],
        ],
      ],
      [
        4,
        [
          [1, "port-isa"],
          [2, "Northstar ISA"],
        ],
      ],
      [
        4,
        [
          [1, "port-gia"],
          [2, "Dealing Account"],
        ],
      ],
      // Earlier purchase with gross value, fee, tax units and note.
      [
        5,
        [
          [1, "tx-buy"],
          [2, 0],
          [3, "cash-isa"],
          [4, "port-isa"],
          [9, [[1, 1_789_000_000]]],
          [10, "GBP"],
          [11, 125_775],
          [12, 1_000_000_000],
          [13, "Monthly invest"],
          [14, "sec-world"],
          [
            15,
            [
              [1, 0],
              [2, 125_000],
            ],
          ],
          [
            15,
            [
              [1, 2],
              [2, 150],
            ],
          ],
          [
            15,
            [
              [1, 1],
              [2, 625],
            ],
          ],
        ],
      ],
      // Same timestamp tie-break: first written stays ahead of second written.
      [
        5,
        [
          [1, "tx-sec-transfer"],
          [2, 4],
          [4, "port-isa"],
          [6, "port-gia"],
          [9, [[1, 1_789_200_000]]],
          [10, "GBP"],
          [11, 50_000],
          [12, 400_000_000],
          [14, "sec-world"],
        ],
      ],
      [
        5,
        [
          [1, "tx-cash-transfer"],
          [2, 5],
          [3, "cash-isa"],
          [5, "cash-reserve"],
          [9, [[1, 1_789_200_000]]],
          [10, "GBP"],
          [11, 30_000],
        ],
      ],
      // Unknown future transaction enum value is safely ignored.
      [
        5,
        [
          [1, "tx-unknown"],
          [2, 99],
          [9, [[1, 1_789_300_000]]],
          [10, "GBP"],
          [11, 100],
        ],
      ],
      [12, "GBP"],
    ]);

    expect(
      readPortfolioSnapshot(file, "tx.portfolio").transactions,
    ).toStrictEqual([
      {
        amount: 500,
        currency: "GBP",
        date: "2026-09-12",
        fees: 0,
        id: "tx-sec-transfer",
        otherPortfolioId: "port-gia",
        otherPortfolioName: "Dealing Account",
        portfolioId: "port-isa",
        portfolioName: "Northstar ISA",
        securityId: "sec-world",
        securityName: "Global Equity Index",
        shares: 4,
        taxes: 0,
        timestamp: 1_789_200_000,
        type: "security-transfer",
      },
      {
        accountId: "cash-isa",
        accountName: "Northstar ISA Cash",
        amount: 300,
        currency: "GBP",
        date: "2026-09-12",
        fees: 0,
        id: "tx-cash-transfer",
        otherAccountId: "cash-reserve",
        otherAccountName: "Reserve Cash",
        shares: 0,
        taxes: 0,
        timestamp: 1_789_200_000,
        type: "cash-transfer",
      },
      {
        accountId: "cash-isa",
        accountName: "Northstar ISA Cash",
        amount: 1257.75,
        currency: "GBP",
        date: "2026-09-10",
        fees: 1.5,
        id: "tx-buy",
        note: "Monthly invest",
        portfolioId: "port-isa",
        portfolioName: "Northstar ISA",
        securityId: "sec-world",
        securityName: "Global Equity Index",
        shares: 10,
        taxes: 6.25,
        timestamp: 1_789_000_000,
        type: "purchase",
      },
    ]);
  });

  it("refuses a transaction whose timestamp falls outside four-digit ISO years", () => {
    const tooLate = portfolioFile([
      [
        5,
        [
          [2, 6],
          [9, [[1, 300_000_000_000]]],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
    ]);
    const tooEarly = portfolioFile([
      [
        5,
        [
          [2, 6],
          [9, [[1, -40_000_000_000]]],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
    ]);

    expect(() => readPortfolioSnapshot(tooLate, "late.portfolio")).toThrow(
      new Refusal("A transaction carries an unreadable date"),
    );
    expect(() => readPortfolioSnapshot(tooEarly, "early.portfolio")).toThrow(
      new Refusal("A transaction carries an unreadable date"),
    );
  });

  it("refuses files that are not unencrypted binary Portfolio Performance files", () => {
    expect(() =>
      readPortfolioSnapshot(strToU8("<client></client>"), "bad.portfolio"),
    ).toThrow(
      new Refusal(
        "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
      ),
    );
  });
});

describe("readTargets", () => {
  // Equities' categories come first, the largest first, the tie
  // between emerging markets and UK equity in the taxonomy's order, as
  // is the tie between the two asking for nothing; then bonds'.
  it("reads each category of the Asset Allocation taxonomy, the classes above it and its share of the whole", () => {
    const file = portfolioFile(clientOf([["Asset Allocation", reference]]));

    expect(readTargets(file)).toStrictEqual([
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: ["Equity", "Developed"],
        id: "Asset Allocation/Equity/Developed/FTSE Global All Cap ex-UK",
        isImplemented: true,
        name: "FTSE Global All Cap ex-UK",
        share: 0.48,
        value: 21401,
      },
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: ["Equity"],
        id: "Asset Allocation/Equity/Global emerging markets",
        isImplemented: true,
        name: "Global emerging markets",
        share: 0.12,
        value: 21401,
      },
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: ["Equity", "UK"],
        id: "Asset Allocation/Equity/UK/UK equity",
        isImplemented: true,
        name: "UK equity",
        share: 0.12,
        value: 21401,
      },
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: ["Equity"],
        id: "Asset Allocation/Equity/Global small cap",
        isImplemented: true,
        name: "Global small cap",
        share: 0.08,
        value: 21401,
      },
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: ["Equity", "Developed"],
        id: "Asset Allocation/Equity/Developed/FTSE USA",
        isImplemented: true,
        name: "FTSE USA",
        share: 0,
        value: 21401,
      },
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: ["Equity", "UK"],
        id: "Asset Allocation/Equity/UK/FTSE All-Share",
        isImplemented: true,
        name: "FTSE All-Share",
        share: 0,
        value: 21401,
      },
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/Global bonds, hedged",
        isImplemented: true,
        name: "Global bonds, hedged",
        share: 0.14,
        value: 21401,
      },
      {
        accounts: [],
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/Index-linked gilts",
        isImplemented: false,
        name: "Index-linked gilts",
        share: 0.04,
        value: 0,
      },
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/Short-dated gilts",
        isImplemented: true,
        name: "Short-dated gilts",
        share: 0.02,
        value: 21401,
      },
    ]);
  });

  it("reads the Asset Allocation taxonomy wherever the file lists it among others", () => {
    const file = portfolioFile(
      clientOf([
        ["Asset Allocation", [{ assigned: 1, name: "Cash", weight: 10_000 }]],
        ["Regions", [{ assigned: 1, name: "Europe", weight: 10_000 }]],
      ]),
    );
    const reordered = portfolioFile(
      clientOf([
        ["Regions", [{ assigned: 1, name: "Europe", weight: 10_000 }]],
        ["Asset Allocation", [{ assigned: 1, name: "Cash", weight: 10_000 }]],
      ]),
    );

    expect(readTargets(file)).toStrictEqual(readTargets(reordered));
    expect(readTargets(file)).toStrictEqual([
      {
        accounts: [{ name: "Brokerage", value: 21401 }],
        classes: [],
        id: "Asset Allocation/Cash",
        isImplemented: true,
        name: "Cash",
        share: 1,
        value: 21401,
      },
    ]);
  });

  // Whether the shares add to the whole is the household's to hold.
  it("reads the shares as the weights make them, whatever they add to", () => {
    const file = portfolioFile(
      clientOf([
        [
          "Asset Allocation",
          [
            { name: "Equity", weight: 6000 },
            { name: "Bonds", weight: 3000 },
          ],
        ],
      ]),
    );

    expect(readTargets(file).map(({ share }) => share)).toStrictEqual([
      0.6, 0.3,
    ]);
  });

  // The root is the whole, whatever weight it was written with.
  it("takes no weight off the root", () => {
    const file = portfolioFile([
      [
        8,
        [
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "root"],
              [6, 5000],
            ],
          ],
          [
            5,
            [
              [1, "cash"],
              [2, "root"],
              [3, "Cash"],
              [6, 10_000],
            ],
          ],
        ],
      ],
    ]);

    expect(readTargets(file)).toStrictEqual([
      {
        accounts: [],
        classes: [],
        id: "cash",
        isImplemented: false,
        name: "Cash",
        share: 1,
        value: 0,
      },
    ]);
  });

  it("leaves out a class beneath none the taxonomy lists", () => {
    const file = portfolioFile([
      [
        8,
        [
          ...taxonomyOf("Asset Allocation", [{ name: "Cash", weight: 10_000 }]),
          [
            5,
            [
              [1, "stray"],
              [2, "gone"],
              [3, "Stray"],
              [6, 10_000],
            ],
          ],
        ],
      ],
    ]);

    expect(readTargets(file).map(({ name }) => name)).toStrictEqual(["Cash"]);
  });

  // A holds ten after a purchase, a delivery in, a sale and a delivery
  // out, a dividend moving none, at its last close of £250.46; B two at
  // 15,000p, the category taking half of it; C four of a security the
  // file does not price; and the account is no security. £2,504.60 and
  // £150, to the pound.
  it("reads what each category holds: each security assigned to it, at its last price in pounds, by what the transactions leave held", () => {
    const file = holding(
      [
        ["a", 10_000],
        ["b", 5000],
        ["c", 10_000],
        ["account", 10_000],
      ],
      [
        security("a", "GBP", 20_000_000_000, 25_046_000_000),
        security("b", "GBX", 1_500_000_000_000),
        security("c", "GBP"),
      ],
      [
        transaction(0, 1_000_000_000, "a"),
        transaction(2, 500_000_000, "a"),
        transaction(1, 300_000_000, "a"),
        transaction(3, 200_000_000, "a"),
        transaction(8, 100_000_000, "a"),
        transaction(0, 200_000_000, "b"),
        transaction(0, 400_000_000, "c"),
        transaction(6, 10_000_000_000, null),
      ],
    );

    expect(readTargets(file)).toStrictEqual([
      {
        accounts: [],
        classes: [],
        id: "cash",
        isImplemented: true,
        name: "Cash",
        share: 1,
        value: 2655,
      },
    ]);
  });

  // a is £10 a share and b £20. ISA buys 10 of a and moves 4 to GIA;
  // GIA buys 5 of b, of which the category takes half; Spare buys 3 of
  // a and sells them; Junior, a second account named ISA, buys 2 of a;
  // and a purchase naming no account, and one naming an account the
  // client does not list, buy 1 of a each. ISA holds £80, GIA £40 of a
  // and £50 of b, and Spare nothing; the whole is £190.
  it("reads what each securities account holds of a category, a transfer moving shares from one to the other", () => {
    const shares = 100_000_000;
    const inAccount = (
      written: Written,
      account: string,
      other?: string,
    ): Written => [
      ...written,
      [4, account],
      ...(other === undefined ? [] : [[6, other] as const]),
    ];
    const accounts = (
      [
        ["isa", "ISA"],
        ["gia", "GIA"],
        ["spare", "Spare"],
        ["junior", "ISA"],
      ] as const
    ).map(
      ([id, name]) =>
        [
          4,
          [
            [1, id],
            [2, name],
          ],
        ] as const,
    );
    const file = portfolioFile([
      ...accounts,
      ...holdingClient(
        [
          ["a", 10_000],
          ["b", 5000],
        ],
        [
          security("a", "GBP", 1_000_000_000),
          security("b", "GBP", 2_000_000_000),
        ],
        [
          inAccount(transaction(0, 10 * shares, "a"), "isa"),
          inAccount(transaction(4, 4 * shares, "a"), "isa", "gia"),
          inAccount(transaction(0, 5 * shares, "b"), "gia"),
          inAccount(transaction(0, 3 * shares, "a"), "spare"),
          inAccount(transaction(1, 3 * shares, "a"), "spare"),
          inAccount(transaction(0, 2 * shares, "a"), "junior"),
          transaction(0, shares, "a"),
          inAccount(transaction(0, shares, "a"), "unlisted"),
        ],
      ),
    ]);

    expect(readTargets(file)).toStrictEqual([
      expect.objectContaining({
        accounts: [
          { name: "ISA", value: 80 },
          { name: "GIA", value: 90 },
        ],
        value: 190,
      }),
    ]);
  });

  it("refuses a security held and assigned that is priced in a currency it has no pound for, by name", () => {
    const priced = (currency: null | string): Uint8Array =>
      holding(
        [["x", 10_000]],
        [security("x", currency, 10_000_000_000)],
        [transaction(0, 100_000_000, "x")],
      );

    expect(() => readTargets(priced("USD"))).toThrow(
      new Refusal(
        "The file holds Fund x, priced in USD, and no transaction in pounds gives a rate for it",
      ),
    );
    expect(() => readTargets(priced(null))).toThrow(
      new Refusal(
        "The file holds Fund x, priced in no currency, and no transaction in pounds gives a rate for it",
      ),
    );
  });

  // x is priced at $100 and ten are held: six bought on day 2 for £450,
  // $600, and four on day 1 for £320, $400, written in that order, so
  // the latest by date rather than the last written gives the rate,
  // £0.75 a dollar. A fee of £3.99 on day 3 in pounds alone, a tax of
  // £1 on day 3 naming dollars but with no figure in them, and a
  // dividend on day 3 of €900 that was $1,000, give none. £750.
  it("prices a security in another currency at the rate the latest transaction in pounds carrying that currency was made at", () => {
    const file = holding(
      [["x", 10_000]],
      [security("x", "USD", 10_000_000_000)],
      [
        transaction(0, 600_000_000, {
          day: 2,
          on: "x",
          unit: [
            [2, 45_000],
            [4, 60_000],
            [5, "USD"],
          ],
        }),
        transaction(0, 400_000_000, {
          day: 1,
          on: "x",
          unit: [
            [2, 32_000],
            [4, 40_000],
            [5, "USD"],
          ],
        }),
        transaction(13, 0, { day: 3, on: "x", unit: [[2, 399]] }),
        transaction(11, 0, {
          day: 3,
          on: "x",
          unit: [
            [2, 100],
            [5, "USD"],
          ],
        }),
        transaction(8, 0, {
          currency: "EUR",
          day: 3,
          on: "x",
          unit: [
            [2, 90_000],
            [4, 100_000],
            [5, "USD"],
          ],
        }),
      ],
    );

    expect(readTargets(file).map(({ value }) => value)).toStrictEqual([750]);
  });

  it("holds nothing of a security in another currency that nothing is held of, rather than refusing it", () => {
    const file = holding(
      [["x", 10_000]],
      [security("x", "USD", 10_000_000_000)],
      [transaction(0, 100_000_000, "x"), transaction(1, 100_000_000, "x")],
    );

    expect(readTargets(file).map(({ value }) => value)).toStrictEqual([0]);
  });

  it("refuses a file that is no zip", () => {
    expect(() => readTargets(strToU8("Account,Balance\nISA,1000"))).toThrow(
      new Refusal(
        "The file is not a zip, as a Portfolio Performance file saved in binary is",
      ),
    );
  });

  // Portfolio Performance writes PORTFOLIO, then the cipher and the
  // encrypted client.
  it("refuses a file saved with a password, saying so", () => {
    expect(() =>
      readTargets(
        new Uint8Array([...strToU8("PORTFOLIO"), 1, 0, 0, 0, 2, 0x8f, 0x3a]),
      ),
    ).toThrow(
      new Refusal(
        "The file is encrypted, and only a Portfolio Performance file saved in binary without a password can be read",
      ),
    );
  });

  it("refuses a file saved as XML, compressed or not, saying so", () => {
    const savedAsXml = new Refusal(
      "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
    );

    expect(() =>
      readTargets(strToU8('<?xml version="1.0"?><client></client>')),
    ).toThrow(savedAsXml);
    expect(() =>
      readTargets(zipSync({ "data.xml": strToU8("<client></client>") })),
    ).toThrow(savedAsXml);
  });

  it("refuses a zip holding no data.portfolio", () => {
    expect(() =>
      readTargets(zipSync({ "other.portfolio": strToU8("PPPBV1") })),
    ).toThrow(new Refusal("The file holds no data.portfolio"));
  });

  it("refuses data that does not open with Portfolio Performance's signature", () => {
    expect(() =>
      readTargets(
        portfolioFile(clientOf([["Asset Allocation", reference]]), "PPPBV2"),
      ),
    ).toThrow(
      new Refusal("The file is not in Portfolio Performance's binary format"),
    );
  });

  it("refuses a file with no Asset Allocation taxonomy, naming those it has with a name", () => {
    expect(() =>
      readTargets(
        portfolioFile(
          clientOf([
            ["Regions", reference],
            ["Security Type", reference],
          ]),
        ),
      ),
    ).toThrow(
      new Refusal(
        "The file has no Asset Allocation taxonomy, only Regions, Security Type",
      ),
    );
    expect(() => readTargets(portfolioFile(clientOf([])))).toThrow(
      new Refusal("The file has no Asset Allocation taxonomy, only none"),
    );
    expect(() => readTargets(portfolioFile([[8, [[1, "unnamed"]]]]))).toThrow(
      new Refusal("The file has no Asset Allocation taxonomy, only none"),
    );
  });

  it("refuses a taxonomy listing a class twice", () => {
    const file = portfolioFile([
      [
        8,
        [
          ...taxonomyOf("Asset Allocation", reference),
          [
            5,
            [
              [1, "Asset Allocation/Bonds"],
              [3, "Bonds"],
            ],
          ],
        ],
      ],
    ]);

    expect(() => readTargets(file)).toThrow(
      new Refusal("The Asset Allocation taxonomy lists a class twice"),
    );
  });

  it("refuses a taxonomy with a class of no id", () => {
    const file = portfolioFile([
      [
        8,
        [
          ...taxonomyOf("Asset Allocation", reference),
          [
            5,
            [
              [2, "Asset Allocation"],
              [3, "Cash"],
              [6, 0],
            ],
          ],
        ],
      ],
    ]);

    expect(() => readTargets(file)).toThrow(
      new Refusal("The Asset Allocation taxonomy has a class with no id"),
    );
  });

  it("trims leading and trailing spaces from leaf category names", () => {
    const file = portfolioFile(
      clientOf([
        [
          "Asset Allocation",
          [
            {
              beneath: [{ name: "  Global equity  ", weight: 10_000 }],
              name: "Equity",
              weight: 10_000,
            },
          ],
        ],
      ]),
    );

    expect(readTargets(file).map(({ name }) => name)).toStrictEqual([
      "Global equity",
    ]);
    expect(
      readPortfolioTargets(file).categories.map(({ name }) => name),
    ).toStrictEqual(["Global equity"]);
  });

  // A name of nothing but space is no name to the household either,
  // which trims it.
  it("refuses a category with no name, saying where it sits", () => {
    const named = (name: string): Uint8Array =>
      portfolioFile(
        clientOf([
          [
            "Asset Allocation",
            [
              {
                beneath: [{ name, weight: 10_000 }],
                name: "Equity",
                weight: 10_000,
              },
            ],
          ],
        ]),
      );

    expect(() => readTargets(named(" "))).toThrow(
      new Refusal(
        "The Asset Allocation taxonomy has a category with no name beneath Equity",
      ),
    );
    expect(() =>
      readTargets(
        portfolioFile([
          [
            8,
            [
              [2, "Asset Allocation"],
              [5, [[1, "root"]]],
              [
                5,
                [
                  [1, "unnamed"],
                  [2, "root"],
                  [6, 10_000],
                ],
              ],
            ],
          ],
        ]),
      ),
    ).toThrow(
      new Refusal(
        "The Asset Allocation taxonomy has a category with no name beneath its root",
      ),
    );
  });

  it("refuses a taxonomy with no root", () => {
    const file = portfolioFile([
      [
        8,
        [
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "cash"],
              [2, "root"],
              [3, "Cash"],
            ],
          ],
        ],
      ],
    ]);

    expect(() => readTargets(file)).toThrow(
      new Refusal("The Asset Allocation taxonomy has no root"),
    );
  });

  it("refuses a taxonomy with nothing beneath its root", () => {
    expect(() =>
      readTargets(portfolioFile(clientOf([["Asset Allocation", []]]))),
    ).toThrow(new Refusal("The Asset Allocation taxonomy holds no classes"));
  });
});

describe("reweighted", () => {
  const file = portfolioFile(
    clientOf([
      ["Asset Allocation", reference],
      ["Regions", [{ assigned: 1, name: "Europe", weight: 10_000 }]],
    ]),
  );
  const idOf = (name: string): string =>
    readTargets(file).find((category) => category.name === name)?.id ?? "";

  // Developed is the two beneath it added up, 0.7875 of the 0.9 in
  // equities, and its two split five sevenths to two, which no
  // hundredth of a per cent holds: 7142.86 and 2857.14 are rounded to
  // 7143 and 2857, the hundredth left over going to the larger
  // remainder.
  it("weights each class by its share over its parent's, rounded to add up to the whole beneath each parent", () => {
    const shares = new Map([
      [idOf("FTSE All-Share"), 0],
      [idOf("FTSE Global All Cap ex-UK"), 0.5625],
      [idOf("FTSE USA"), 0.225],
      [idOf("Global bonds, hedged"), 0.075],
      [idOf("Global emerging markets"), 0.05625],
      [idOf("Global small cap"), 0],
      [idOf("Index-linked gilts"), 0.025],
      [idOf("Short-dated gilts"), 0],
      [idOf("UK equity"), 0.05625],
    ]);

    const written = reweighted(file, shares);

    expect(weightsIn(written)).toStrictEqual(
      new Map([
        ["Asset Allocation", 10_000],
        ["Asset Allocation/Bonds", 1000],
        ["Asset Allocation/Bonds/Global bonds, hedged", 7500],
        ["Asset Allocation/Bonds/Index-linked gilts", 2500],
        ["Asset Allocation/Bonds/Short-dated gilts", 0],
        ["Asset Allocation/Equity", 9000],
        ["Asset Allocation/Equity/Developed", 8750],
        ["Asset Allocation/Equity/Developed/FTSE Global All Cap ex-UK", 7143],
        ["Asset Allocation/Equity/Developed/FTSE USA", 2857],
        ["Asset Allocation/Equity/Global emerging markets", 625],
        ["Asset Allocation/Equity/Global small cap", 0],
        ["Asset Allocation/Equity/UK", 625],
        ["Asset Allocation/Equity/UK/FTSE All-Share", 0],
        ["Asset Allocation/Equity/UK/UK equity", 10_000],
      ]),
    );
    const read = readTargets(written);
    expect(read.reduce((sum, { share }) => sum + share, 0)).toBeCloseTo(1, 12);
    expect(read.map(({ name, share }) => [name, share])).toStrictEqual([
      ["FTSE Global All Cap ex-UK", expect.closeTo(0.56251125, 12)],
      ["FTSE USA", expect.closeTo(0.22498875, 12)],
      ["Global emerging markets", expect.closeTo(0.05625, 12)],
      ["UK equity", expect.closeTo(0.05625, 12)],
      ["FTSE All-Share", 0],
      ["Global small cap", 0],
      ["Global bonds, hedged", expect.closeTo(0.075, 12)],
      ["Index-linked gilts", expect.closeTo(0.025, 12)],
      ["Short-dated gilts", 0],
    ]);
  });

  // Written back with the shares it already holds, the file is the file:
  // the weights land where they were written, a nought stays unwritten,
  // and the other taxonomy, the securities and the transactions are not
  // touched.
  it("keeps everything but the weights byte for byte, and the weights where they were written", () => {
    const shares = new Map(
      readTargets(file).map(({ id, share }) => [id, share] as const),
    );

    const written = reweighted(file, shares);

    expect(unzipSync(written)).toStrictEqual(unzipSync(file));
    expect(readTargets(written)).toStrictEqual(readTargets(file));
  });

  it("weighs every class beneath a parent holding nothing as nothing, and a category given no share as holding none", () => {
    const written = reweighted(
      file,
      new Map([
        [idOf("Global emerging markets"), 0.75],
        [idOf("UK equity"), 0.25],
      ]),
    );

    expect(weightsIn(written)).toStrictEqual(
      new Map([
        ["Asset Allocation", 10_000],
        ["Asset Allocation/Bonds", 0],
        ["Asset Allocation/Bonds/Global bonds, hedged", 0],
        ["Asset Allocation/Bonds/Index-linked gilts", 0],
        ["Asset Allocation/Bonds/Short-dated gilts", 0],
        ["Asset Allocation/Equity", 10_000],
        ["Asset Allocation/Equity/Developed", 0],
        ["Asset Allocation/Equity/Developed/FTSE Global All Cap ex-UK", 0],
        ["Asset Allocation/Equity/Developed/FTSE USA", 0],
        ["Asset Allocation/Equity/Global emerging markets", 7500],
        ["Asset Allocation/Equity/Global small cap", 0],
        ["Asset Allocation/Equity/UK", 2500],
        ["Asset Allocation/Equity/UK/FTSE All-Share", 0],
        ["Asset Allocation/Equity/UK/UK equity", 10_000],
      ]),
    );
  });

  // Three equal shares are 3333.33 each; the hundredth left over goes to
  // the first, their remainders being equal.
  it("gives the hundredths left over to the largest remainders, the earlier first among equals", () => {
    const thirds = portfolioFile(
      clientOf([
        [
          "Asset Allocation",
          [
            { name: "One", weight: 5000 },
            { name: "Two", weight: 3000 },
            { name: "Three", weight: 2000 },
          ],
        ],
      ]),
    );

    expect(
      weightsIn(
        reweighted(
          thirds,
          new Map([
            ["Asset Allocation/One", 1 / 3],
            ["Asset Allocation/Three", 1 / 3],
            ["Asset Allocation/Two", 1 / 3],
          ]),
        ),
      ),
    ).toStrictEqual(
      new Map([
        ["Asset Allocation", 10_000],
        ["Asset Allocation/One", 3334],
        ["Asset Allocation/Three", 3333],
        ["Asset Allocation/Two", 3333],
      ]),
    );
  });

  // Weighted each by its parent's, nine tenths would scale to the
  // whole without a word.
  it("refuses shares that do not add up to the whole, saying what they add up to", () => {
    expect(() =>
      reweighted(
        file,
        new Map([
          [idOf("FTSE Global All Cap ex-UK"), 0.6],
          [idOf("Global bonds, hedged"), 0.3],
        ]),
      ),
    ).toThrow(
      new Refusal("The shares given add up to 90.00% rather than 100%"),
    );
    expect(() => reweighted(file, new Map())).toThrow(
      new Refusal("The shares given add up to 0.00% rather than 100%"),
    );
  });

  it("refuses what it could not read, as reading does", () => {
    const whole = new Map([["Asset Allocation/Cash", 1]]);

    expect(() => reweighted(strToU8("<?xml version='1.0'?>"), whole)).toThrow(
      new Refusal(
        "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
      ),
    );
    expect(() =>
      reweighted(
        portfolioFile(clientOf([["Regions", [{ name: "UK", weight: 1 }]]])),
        whole,
      ),
    ).toThrow(
      new Refusal("The file has no Asset Allocation taxonomy, only Regions"),
    );
    expect(() =>
      reweighted(portfolioFile(clientOf([["Asset Allocation", []]])), whole),
    ).toThrow(new Refusal("The Asset Allocation taxonomy holds no classes"));
  });
});

function rawClientOf(file: Uint8Array): Uint8Array {
  const data = unzipSync(file)["data.portfolio"];
  if (data === undefined) {
    throw new Error("missing data.portfolio");
  }
  return data.subarray(6);
}

// Builds a zip holding data.portfolio with unknown fields (fixed64 field 101,
// fixed32 field 102, unknown varint field 98, extension bytes field 99) plus a
// sibling zip entry so tests verify byte-for-byte preservation across writers.
function richPortfolioFile(client: Written): Uint8Array<ArrayBuffer> {
  const unknownFields = new Uint8Array([
    0xa9, 0x06, 1, 2, 3, 4, 5, 6, 7, 8, 0xb5, 0x06, 9, 10, 11, 12,
  ]);
  const clientBytes = joined([
    protobufOf(client),
    protobufOf([
      [98, 42],
      [99, new Uint8Array([0xde, 0xad, 0xbe, 0xef])],
    ]),
    unknownFields,
  ]);
  return new Uint8Array(
    zipSync({
      "data.portfolio": joined([strToU8("PPPBV1"), clientBytes]),
      "sibling.txt": strToU8("keep me byte-for-byte"),
    }),
  );
}

describe("appendAccount", () => {
  it("appends cash and securities accounts while preserving existing bytes, unknown fields, and sibling zip parts", () => {
    const base = richPortfolioFile([
      [1, 66],
      [
        3,
        [
          [1, "cash-existing"],
          [2, "Existing Cash"],
          [3, "GBP"],
        ],
      ],
      [12, "GBP"],
    ]);
    const originalClient = rawClientOf(base);

    const cash = appendAccount(
      base,
      {
        currency: "USD",
        kind: "cash",
        name: "  Dollar Pot  ",
        note: "  FX reserve  ",
      },
      { now: new Date("2026-09-25T12:30:00.250Z"), uuid: () => "cash-new" },
    );

    expect(cash.id).toBe("cash-new");
    const afterCashParts = unzipSync(cash.content);
    expect(afterCashParts["sibling.txt"]).toStrictEqual(
      strToU8("keep me byte-for-byte"),
    );
    const afterCashClient = rawClientOf(cash.content);
    expect(afterCashClient.subarray(0, originalClient.length)).toStrictEqual(
      originalClient,
    );

    const cashMsg = messagesAt(messageOf(afterCashClient), 3).at(-1);
    expect(cashMsg).toBeDefined();
    const cashUpdated = messagesAt(cashMsg ?? new Map(), 7)[0];
    expect(int64At(cashUpdated ?? new Map(), 1)).toBe(1_790_339_400);
    expect(int32At(cashUpdated ?? new Map(), 2)).toBe(250_000_000);

    // Append a securities account linked to the newly added cash account, and
    // another unlinked securities account with default clock/uuid options.
    const linked = appendAccount(
      cash.content,
      {
        kind: "securities",
        name: "  Brokerage GIA  ",
        note: "  Core dealing  ",
        referenceAccountId: "cash-new",
      },
      { now: new Date(0), uuid: () => "port-new" },
    );
    expect(linked.id).toBe("port-new");

    const portMsg = messagesAt(messageOf(rawClientOf(linked.content)), 4).at(
      -1,
    );
    // Epoch-0 timestamp is still present on the wire as a zero-length submessage.
    expect(portMsg?.has(7)).toBe(true);
    expect(messagesAt(portMsg ?? new Map(), 7)).toStrictEqual([new Map()]);

    const unlinked = appendAccount(linked.content, {
      kind: "securities",
      name: "Direct Certs",
      note: "   ",
    });
    expect(unlinked.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );

    const snapshot = readPortfolioSnapshot(unlinked.content, "test.portfolio");
    expect(
      snapshot.cashAccounts.map((a) => [a.id, a.name, a.currency, a.note]),
    ).toStrictEqual([
      ["cash-existing", "Existing Cash", "GBP", undefined],
      ["cash-new", "Dollar Pot", "USD", "FX reserve"],
    ]);
    expect(
      snapshot.securitiesAccounts.map((a) => [
        a.id,
        a.name,
        a.referenceAccountId,
        a.note,
      ]),
    ).toStrictEqual([
      ["port-new", "Brokerage GIA", "cash-new", "Core dealing"],
      [unlinked.id, "Direct Certs", undefined, undefined],
    ]);

    // Default-level zip overflow retries at level 9 cleanly.
    const incompressible = new Uint8Array(4_010_000);
    let seed = 0x1234_5678;
    for (let i = 0; i < incompressible.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      incompressible[i] = seed & 0xff;
    }
    const largeZip = new Uint8Array(
      zipSync(
        {
          "blob.bin": incompressible,
          "data.portfolio": joined([strToU8("PPPBV1"), protobufOf([[1, 66]])]),
        },
        { level: 0 },
      ),
    );
    const rewrittenLarge = appendAccount(largeZip, {
      currency: "GBP",
      kind: "cash",
      name: "Large File Cash",
    });
    expect(
      readPortfolioSnapshot(rewrittenLarge.content, "large.portfolio")
        .cashAccounts[0]?.name,
    ).toBe("Large File Cash");
  });

  it("refuses blank names, unsupported currencies, and missing or synthetic reference accounts", () => {
    const fileWithSyntheticCash = portfolioFile([
      [1, 66],
      // Cash account without field 1 id gets synthetic "account-0" in snapshot.
      [
        3,
        [
          [2, "Nameless Id Cash"],
          [3, "GBP"],
        ],
      ],
      [12, "GBP"],
    ]);

    expect(() =>
      appendAccount(fileWithSyntheticCash, {
        currency: "GBP",
        kind: "cash",
        name: "   ",
      }),
    ).toThrow(new Refusal("Account name cannot be blank"));

    expect(() =>
      appendAccount(fileWithSyntheticCash, {
        currency: "GBX",
        kind: "cash",
        name: "Pence Cash",
      }),
    ).toThrow(new Refusal('Currency "GBX" is not supported'));

    expect(() =>
      appendAccount(fileWithSyntheticCash, {
        currency: "gbp",
        kind: "cash",
        name: "Lower Cash",
      }),
    ).toThrow(new Refusal('Currency "gbp" is not supported'));

    expect(() =>
      appendAccount(fileWithSyntheticCash, {
        kind: "securities",
        name: "Bad Link",
        referenceAccountId: "account-0",
      }),
    ).toThrow(new Refusal("The selected reference cash account was not found"));
  });

  it("refuses corrupted protobuf bytes even for cash or unlinked securities accounts", () => {
    const corrupt = new Uint8Array(
      zipSync({
        "data.portfolio": new Uint8Array([
          ...strToU8("PPPBV1"),
          0x12, // field 2, length-delimited
          0x10, // claims 16 bytes, truncated immediately
          0x01,
        ]),
      }),
    );

    expect(() =>
      appendAccount(corrupt, {
        currency: "GBP",
        kind: "cash",
        name: "Corrupt Cash",
      }),
    ).toThrow(new Refusal("The data is cut short partway through a field"));

    expect(() =>
      appendAccount(corrupt, {
        kind: "securities",
        name: "Corrupt Securities",
      }),
    ).toThrow(new Refusal("The data is cut short partway through a field"));
  });
});

describe("appendSecurity", () => {
  it("appends a security with optional dated initial price and Asset Allocation assignment while preserving other taxonomies and bytes", () => {
    const base = richPortfolioFile([
      [1, 66],
      [
        8,
        [
          [1, "tax-regions"],
          [2, "Regions"],
          [
            5,
            [
              [1, "reg-root"],
              [3, "Regions"],
            ],
          ],
        ],
      ],
      [
        8,
        [
          [1, "tax-aa"],
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "aa-root"],
              [3, "Asset Allocation"],
              [6, 10_000],
            ],
          ],
          [
            5,
            [
              [1, "aa-equity"],
              [2, "aa-root"],
              [3, "Global equity"],
              [6, 7000],
              [
                9,
                [
                  [1, "existing-sec"],
                  [2, 10_000],
                  [3, 4],
                ],
              ],
            ],
          ],
          [
            5,
            [
              [1, "aa-bonds"],
              [2, "aa-root"],
              [3, "UK gilts"],
              [6, 3000],
            ],
          ],
        ],
      ],
      [12, "GBP"],
    ]);

    const added = appendSecurity(
      base,
      {
        categoryId: "aa-equity",
        currency: "GBX",
        isin: "  GB00TEST0002  ",
        latestPrice: 214.015,
        name: "  UK Gilts Tracker  ",
        note: "  Accumulating  ",
        ticker: "  UKGT  ",
      },
      {
        now: new Date("2026-09-25T10:00:00Z"),
        today: "2026-09-25",
        uuid: () => "sec-new",
      },
    );

    expect(added.id).toBe("sec-new");
    const snapshot = readPortfolioSnapshot(added.content, "sec.portfolio");
    expect(snapshot.holdings).toStrictEqual([
      {
        category: "Global equity",
        currency: "GBX",
        gbpRate: 0.01,
        id: "sec-new",
        isin: "GB00TEST0002",
        isRetired: false,
        latestPrice: 214.015,
        latestPriceDate: "2026-09-25",
        name: "UK Gilts Tracker",
        note: "Accumulating",
        shares: 0,
        sharesByAccount: [],
        ticker: "UKGT",
      },
    ]);

    // Assignment rank increments past existing max rank (4 -> 5), and Regions taxonomy stays untouched.
    const client = messageOf(rawClientOf(added.content));
    const aaTax = messagesAt(client, 8)[1] ?? new Map();
    const eqClass = messagesAt(aaTax, 5)[1] ?? new Map();
    const assignments = messagesAt(eqClass, 9);
    expect(assignments).toHaveLength(2);
    expect(textAt(assignments[1] ?? new Map(), 1)).toBe("sec-new");
    expect(int32At(assignments[1] ?? new Map(), 2)).toBe(10_000);
    expect(int32At(assignments[1] ?? new Map(), 3)).toBe(5);

    // Minimal security with null price, explicit latestPriceDate=1970-01-01, and no category.
    const minimal = appendSecurity(
      added.content,
      { currency: "USD", latestPrice: null, name: "Minimal US ETF" },
      { uuid: () => "sec-min" },
    );
    const epochDated = appendSecurity(
      minimal.content,
      {
        categoryId: "aa-bonds",
        currency: "GBP",
        latestPrice: 100,
        latestPriceDate: "1970-01-01",
        name: "Epoch Fund",
      },
      { uuid: () => "sec-epoch" },
    );
    const finalSnapshot = readPortfolioSnapshot(
      epochDated.content,
      "sec.portfolio",
    );
    expect(
      finalSnapshot.holdings.find((h) => h.id === "sec-min")?.latestPrice,
    ).toBeNull();
    expect(
      finalSnapshot.holdings.find((h) => h.id === "sec-epoch"),
    ).toMatchObject({
      category: "UK gilts",
      latestPrice: 100,
      latestPriceDate: "1970-01-01",
    });

    // Empty class assignment list starts at rank 0.
    const bondClass = messagesAt(
      messagesAt(messageOf(rawClientOf(epochDated.content)), 8)[1] ?? new Map(),
      5,
    )[2];
    expect(
      int32At(messagesAt(bondClass ?? new Map(), 9)[0] ?? new Map(), 3),
    ).toBe(0);
  });

  it("refuses blank names, bad currencies, invalid dates or prices, and unknown or non-leaf Asset Allocation categories", () => {
    const file = samplePortfolioFile();
    expect(() =>
      appendSecurity(file, { currency: "GBP", latestPrice: null, name: "" }),
    ).toThrow(new Refusal("Security name cannot be blank"));

    expect(() =>
      appendSecurity(file, { currency: "123", latestPrice: null, name: "Bad" }),
    ).toThrow(new Refusal('Currency "123" is not supported'));

    expect(() =>
      appendSecurity(file, {
        currency: "GBP",
        latestPrice: 0,
        name: "Zero Price",
      }),
    ).toThrow(new Refusal("Latest price must be greater than zero"));

    expect(() =>
      appendSecurity(file, {
        currency: "GBP",
        latestPrice: 1e-10,
        name: "Sub-unit Price",
      }),
    ).toThrow(new Refusal("Latest price must be greater than zero"));

    expect(() =>
      appendSecurity(file, {
        currency: "GBP",
        latestPrice: 100_000_000,
        name: "Huge Price",
      }),
    ).toThrow(new Refusal("Latest price is out of range"));

    expect(() =>
      appendSecurity(file, {
        currency: "GBP",
        latestPrice: 10,
        latestPriceDate: "2026-02-31",
        name: "Bad Date",
      }),
    ).toThrow(new Refusal("Enter a valid calendar date"));

    // Rejects root (non-leaf) and unknown category ids.
    expect(() =>
      appendSecurity(file, {
        categoryId: "aa-root",
        currency: "GBP",
        latestPrice: null,
        name: "Root Assigned",
      }),
    ).toThrow(new Refusal("The selected asset class was not found"));

    expect(() =>
      appendSecurity(file, {
        categoryId: "missing",
        currency: "GBP",
        latestPrice: null,
        name: "Missing Assigned",
      }),
    ).toThrow(new Refusal("The selected asset class was not found"));
  });

  it("updates only the first Asset Allocation taxonomy when a duplicate taxonomy shares that name", () => {
    const duplicateTaxonomies = portfolioFile([
      [1, 66],
      [
        8,
        [
          [1, "tax-aa-first"],
          [2, "Asset Allocation"],
          [5, [[1, "aa-root-1"]]],
          [
            5,
            [
              [1, "aa-equity"],
              [2, "aa-root-1"],
              [3, "Global equity"],
              [6, 10_000],
            ],
          ],
        ],
      ],
      [
        8,
        [
          [1, "tax-aa-second"],
          [2, "Asset Allocation"],
          [5, [[1, "aa-root-2"]]],
          [
            5,
            [
              [1, "aa-equity"],
              [2, "aa-root-2"],
              [3, "Duplicate equity"],
              [6, 10_000],
            ],
          ],
        ],
      ],
      [12, "GBP"],
    ]);

    const added = appendSecurity(
      duplicateTaxonomies,
      {
        categoryId: "aa-equity",
        currency: "GBP",
        latestPrice: null,
        name: "First Only Fund",
      },
      { uuid: () => "sec-first-only" },
    );

    const taxonomies = messagesAt(messageOf(rawClientOf(added.content)), 8);
    const firstLeaf = messagesAt(taxonomies[0] ?? new Map(), 5)[1];
    const secondLeaf = messagesAt(taxonomies[1] ?? new Map(), 5)[1];
    expect(messagesAt(firstLeaf ?? new Map(), 9)).toHaveLength(1);
    expect(messagesAt(secondLeaf ?? new Map(), 9)).toHaveLength(0);
  });
});

describe("appendTransaction", () => {
  it("appends all 15 transaction types with cross-entry ids, fee/tax units, and clean round-trip through snapshot, targets, and portfolios", () => {
    const base = richPortfolioFile([
      [1, 66],
      [
        2,
        [
          [1, "sec-world"],
          [3, "Global Equity Index"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_718],
              [2, 10_000_000_000],
            ],
          ],
        ],
      ],
      [
        3,
        [
          [1, "cash-a"],
          [2, "ISA Cash"],
          [3, "GBP"],
        ],
      ],
      // Legacy cash account omitting field 3 resolves to baseCurrency (GBP).
      [
        3,
        [
          [1, "cash-b"],
          [2, "Reserve Cash"],
        ],
      ],
      [
        4,
        [
          [1, "port-a"],
          [2, "Northstar ISA"],
          [5, "cash-a"],
        ],
      ],
      [
        4,
        [
          [1, "port-b"],
          [2, "Harbour GIA"],
          [5, "cash-b"],
        ],
      ],
      [
        8,
        [
          [1, "tax-aa"],
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "aa-root"],
              [3, "Asset Allocation"],
              [6, 10_000],
            ],
          ],
          [
            5,
            [
              [1, "aa-eq"],
              [2, "aa-root"],
              [3, "Equities"],
              [6, 10_000],
              [
                9,
                [
                  [1, "sec-world"],
                  [2, 10_000],
                ],
              ],
            ],
          ],
        ],
      ],
      [12, "GBP"],
    ]);

    let nextId = 0;
    const opts = {
      now: new Date("2026-09-25T15:00:00Z"),
      uuid: (): string => `gen-${String(++nextId)}`,
    };

    const cases = [
      {
        accountId: "cash-a",
        amount: 2000,
        currency: "GBP",
        date: "2026-09-01",
        fees: 0,
        note: "Initial funding",
        shares: 0,
        taxes: 0,
        type: "deposit" as const,
      },
      {
        accountId: "cash-a",
        amount: 1005.5,
        currency: "GBP",
        date: "2026-09-02",
        fees: 3.5,
        portfolioId: "port-a",
        securityId: "sec-world",
        shares: 10,
        taxes: 2,
        type: "purchase" as const,
      },
      {
        accountId: "cash-a",
        amount: 200,
        currency: "GBP",
        date: "2026-09-03",
        fees: 1.5,
        portfolioId: "port-a",
        securityId: "sec-world",
        shares: 2,
        taxes: 0,
        type: "sale" as const,
      },
      {
        amount: 500,
        currency: "GBP",
        date: "2026-09-04",
        fees: 2.5,
        portfolioId: "port-a",
        securityId: "sec-world",
        shares: 5,
        taxes: 0,
        type: "inbound-delivery" as const,
      },
      {
        amount: 100,
        currency: "GBP",
        date: "2026-09-05",
        fees: 0,
        portfolioId: "port-a",
        securityId: "sec-world",
        shares: 1,
        taxes: 1,
        type: "outbound-delivery" as const,
      },
      {
        amount: 0,
        currency: "GBP",
        date: "2026-09-06",
        fees: 0,
        otherPortfolioId: "port-b",
        portfolioId: "port-a",
        securityId: "sec-world",
        shares: 2,
        taxes: 0,
        type: "security-transfer" as const,
      },
      {
        accountId: "cash-a",
        amount: 100,
        currency: "GBP",
        date: "2026-09-07",
        fees: 0,
        otherAccountId: "cash-b",
        shares: 0,
        taxes: 0,
        type: "cash-transfer" as const,
      },
      {
        accountId: "cash-a",
        amount: 50,
        currency: "GBP",
        date: "2026-09-08",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "removal" as const,
      },
      {
        accountId: "cash-a",
        amount: 25,
        currency: "GBP",
        date: "2026-09-09",
        fees: 0.5,
        securityId: "sec-world",
        shares: 0,
        taxes: 3.75,
        type: "dividend" as const,
      },
      {
        accountId: "cash-a",
        amount: 4.2,
        currency: "GBP",
        date: "2026-09-10",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "interest" as const,
      },
      {
        accountId: "cash-a",
        amount: 1.1,
        currency: "GBP",
        date: "2026-09-11",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "interest-charge" as const,
      },
      {
        accountId: "cash-a",
        amount: 6,
        currency: "GBP",
        date: "2026-09-12",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "tax" as const,
      },
      {
        accountId: "cash-a",
        amount: 2,
        currency: "GBP",
        date: "2026-09-13",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "tax-refund" as const,
      },
      {
        accountId: "cash-a",
        amount: 3,
        currency: "GBP",
        date: "2026-09-14",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "fee" as const,
      },
      {
        accountId: "cash-a",
        amount: 1,
        currency: "GBP",
        date: "1970-01-01",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "fee-refund" as const,
      },
    ];

    let file = base;
    for (const input of cases) {
      file = appendTransaction(file, input, opts).content;
    }

    const rawTxs = messagesAt(messageOf(rawClientOf(file)), 5);
    expect(rawTxs).toHaveLength(15);

    // Cross-entry types (purchase, sale, security-transfer, cash-transfer) carry distinct otherUuid + otherUpdatedAt.
    const crossIndices = [1, 2, 5, 6];
    for (const idx of crossIndices) {
      const tx = rawTxs[idx] ?? new Map();
      const txId = textAt(tx, 1);
      const otherId = textAt(tx, 7);
      expect(otherId).toBeDefined();
      expect(otherId).not.toBe(txId);
      expect(tx.has(8)).toBe(true);
    }
    // Non-cross-entry deposit omits field 7 and 8.
    expect(rawTxs[0]?.has(7)).toBe(false);
    expect(rawTxs[0]?.has(8)).toBe(false);

    // Purchase fee & tax units carry matching field 3 currencyCode and never GROSS_VALUE.
    const purchaseUnits = messagesAt(rawTxs[1] ?? new Map(), 15);
    expect(
      purchaseUnits.map((u) => [int32At(u, 1), int64At(u, 2), textAt(u, 3)]),
    ).toStrictEqual([
      [2, 350, "GBP"],
      [1, 200, "GBP"],
    ]);

    // Round-trip through all three readers.
    const snapshot = readPortfolioSnapshot(file, "all15.portfolio");
    expect(snapshot.transactions).toHaveLength(15);
    expect(snapshot.transactions.at(-1)?.date).toBe("1970-01-01");
    expect(snapshot.holdings[0]?.shares).toBe(12);
    expect(snapshot.holdings[0]?.sharesByAccount).toStrictEqual([
      { portfolioId: "port-a", shares: 10 },
      { portfolioId: "port-b", shares: 2 },
    ]);
    expect(snapshot.cashAccounts.find((a) => a.id === "cash-b")?.balance).toBe(
      100,
    );
    expect(readTargets(file)[0]?.value).toBe(1200);
    expect(readPortfolios(file)).toStrictEqual([
      {
        cash: 1067,
        name: "Northstar ISA",
        paid: [
          { amount: 2000, on: "2026-09-01" },
          { amount: -50, on: "2026-09-08" },
        ],
      },
    ]);
  });

  it("refuses mismatched currencies, cross-currency cash transfers, synthetic/missing ids, self-transfers, and invalid costs or shares", () => {
    const file = portfolioFile([
      [1, 66],
      [
        2,
        [
          [1, "sec-1"],
          [3, "Global Equity"],
          [4, "GBP"],
        ],
      ],
      [
        3,
        [
          [1, "cash-gbp"],
          [2, "GBP Cash"],
          [3, "GBP"],
        ],
      ],
      [
        3,
        [
          [1, "cash-usd"],
          [2, "USD Cash"],
          [3, "USD"],
        ],
      ],
      // Account with no field 1 id (synthetic fallback in snapshot) must be rejected.
      [
        3,
        [
          [2, "No Id Cash"],
          [3, "GBP"],
        ],
      ],
      [
        4,
        [
          [1, "port-1"],
          [2, "ISA"],
        ],
      ],
      [12, "GBP"],
    ]);

    const baseTx = {
      accountId: "cash-gbp",
      amount: 100,
      currency: "GBP",
      date: "2026-09-25",
      fees: 0,
      shares: 0,
      taxes: 0,
      type: "deposit" as const,
    };

    expect(() =>
      appendTransaction(file, { ...baseTx, currency: "USD" }),
    ).toThrow(
      new Refusal("Transaction currency must match the cash account currency"),
    );

    expect(() =>
      appendTransaction(file, { ...baseTx, accountId: "account-2" }),
    ).toThrow(new Refusal("The selected cash account was not found"));

    expect(() =>
      appendTransaction(file, {
        amount: 100,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "deposit",
      }),
    ).toThrow(new Refusal("The selected cash account was not found"));

    expect(() =>
      appendTransaction(file, {
        ...baseTx,
        otherAccountId: "cash-usd",
        type: "cash-transfer",
      }),
    ).toThrow(
      new Refusal(
        "Cash transfers between different currencies are not supported yet",
      ),
    );

    expect(() =>
      appendTransaction(file, {
        ...baseTx,
        otherAccountId: "cash-gbp",
        type: "cash-transfer",
      }),
    ).toThrow(new Refusal("Source and destination accounts must differ"));

    expect(() =>
      appendTransaction(file, { ...baseTx, type: "cash-transfer" }),
    ).toThrow(new Refusal("The destination cash account was not found"));

    expect(() =>
      appendTransaction(file, {
        amount: 0,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        otherPortfolioId: "port-1",
        portfolioId: "port-1",
        securityId: "sec-1",
        shares: 1,
        taxes: 0,
        type: "security-transfer",
      }),
    ).toThrow(new Refusal("Source and destination accounts must differ"));

    expect(() =>
      appendTransaction(file, {
        amount: 0,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        otherPortfolioId: "missing",
        portfolioId: "port-1",
        securityId: "sec-1",
        shares: 1,
        taxes: 0,
        type: "security-transfer",
      }),
    ).toThrow(new Refusal("The destination securities account was not found"));

    expect(() =>
      appendTransaction(file, {
        amount: 100,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        portfolioId: "missing",
        securityId: "sec-1",
        shares: 1,
        taxes: 0,
        type: "inbound-delivery",
      }),
    ).toThrow(new Refusal("The selected securities account was not found"));

    expect(() =>
      appendTransaction(file, {
        amount: 100,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        portfolioId: "port-1",
        securityId: "missing",
        shares: 1,
        taxes: 0,
        type: "inbound-delivery",
      }),
    ).toThrow(new Refusal("The selected security was not found"));

    expect(() => appendTransaction(file, { ...baseTx, amount: 0.001 })).toThrow(
      new Refusal("Amount must be greater than zero"),
    );

    expect(() => appendTransaction(file, { ...baseTx, amount: -5 })).toThrow(
      new Refusal("Amount is out of range"),
    );

    expect(() => appendTransaction(file, { ...baseTx, fees: 1 })).toThrow(
      new Refusal("This transaction type does not take fees or taxes"),
    );

    expect(() => appendTransaction(file, { ...baseTx, taxes: 1 })).toThrow(
      new Refusal("This transaction type does not take fees or taxes"),
    );

    expect(() => appendTransaction(file, { ...baseTx, shares: 1 })).toThrow(
      new Refusal("This transaction type does not take shares"),
    );

    expect(() =>
      appendTransaction(file, {
        accountId: "cash-gbp",
        amount: 10,
        currency: "GBP",
        date: "2026-09-25",
        fees: 6,
        portfolioId: "port-1",
        securityId: "sec-1",
        shares: 1,
        taxes: 4.01,
        type: "purchase",
      }),
    ).toThrow(
      new Refusal("Fees and taxes cannot exceed the transaction amount"),
    );

    // A file omitting baseCurrency falls back to GBP for legacy cash accounts.
    const noBase = portfolioFile([
      [
        3,
        [
          [1, "legacy-cash"],
          [2, "Legacy Cash"],
        ],
      ],
    ]);
    const legacyRes = appendTransaction(noBase, {
      ...baseTx,
      accountId: "legacy-cash",
    });
    expect(
      readPortfolioSnapshot(legacyRes.content, "legacy.portfolio")
        .cashAccounts[0]?.balance,
    ).toBe(100);
  });
});

describe("updateQuotes", () => {
  it("upserts sorted prices, preserves undated and untouched entries byte for byte, handles date=0, and clears only shadowed latest quotes", () => {
    const undatedPrice = protobufOf([[2, 9_000_000_000]]);
    const olderWithExtra = protobufOf([
      [1, 20_700],
      [2, 11_000_000_000],
      [99, "preserve-me"],
    ]);
    const newerPrice = protobufOf([
      [1, 20_720],
      [2, 13_000_000_000],
    ]);
    const sameDayOld = protobufOf([
      [1, 20_710],
      [2, 11_500_000_000],
    ]);

    const base = richPortfolioFile([
      [1, 66],
      // sec-shadowed: unsorted prices, undated entry, duplicate target day, and same-day latest (must be stripped).
      [
        2,
        [
          [1, "sec-shadowed"],
          [3, "Shadowed Fund"],
          [4, "GBP"],
          [13, newerPrice],
          [13, undatedPrice],
          [13, sameDayOld],
          [13, olderWithExtra],
          [
            16,
            [
              [1, 20_710],
              [2, 11_600_000_000],
            ],
          ],
          [98, 777],
        ],
      ],
      // sec-newer-latest: latest is strictly newer than quote date -> preserved byte for byte.
      [
        2,
        [
          [1, "sec-newer-latest"],
          [3, "Newer Latest Fund"],
          [4, "GBP"],
          [
            16,
            [
              [1, 20_750],
              [2, 15_000_000_000],
            ],
          ],
        ],
      ],
      // sec-bad-latest: undated latest or zero latest -> stripped.
      [
        2,
        [
          [1, "sec-undated-latest"],
          [3, "Undated Latest"],
          [4, "GBP"],
          [16, [[2, 12_000_000_000]]],
        ],
      ],
      [
        2,
        [
          [1, "sec-zero-latest"],
          [3, "Zero Latest"],
          [4, "GBP"],
          [
            16,
            [
              [1, 20_750],
              [2, 0],
            ],
          ],
        ],
      ],
      // sec-untouched + sec-no-id: kept byte for byte.
      [
        2,
        [
          [1, "sec-untouched"],
          [3, "Untouched Fund"],
          [4, "GBP"],
          [99, "still-here"],
        ],
      ],
      [2, [[3, "No Id Security"]]],
      [12, "GBP"],
    ]);

    const updated = updateQuotes(
      base,
      {
        date: "2026-09-17", // epoch day 20_713
        quotes: [
          { price: 120.25, securityId: "sec-shadowed" },
          { price: 140, securityId: "sec-newer-latest" },
          { price: 50, securityId: "sec-undated-latest" },
          { price: 60, securityId: "sec-zero-latest" },
        ],
      },
      { now: new Date("2026-09-17T18:00:00Z") },
    );

    expect(updated.updatedCount).toBe(4);
    expect(unzipSync(updated.content)["sibling.txt"]).toStrictEqual(
      strToU8("keep me byte-for-byte"),
    );

    // Replace existing same day (20_710 -> 2026-09-14) AND test date = 0 (1970-01-01).
    const replaceSameDay = updateQuotes(updated.content, {
      date: "2026-09-14",
      quotes: [{ price: 118, securityId: "sec-shadowed" }],
    });
    const withEpochZero = updateQuotes(replaceSameDay.content, {
      date: "1970-01-01",
      quotes: [{ price: 10, securityId: "sec-shadowed" }],
    });

    const client = messageOf(rawClientOf(withEpochZero.content));
    const securities = messagesAt(client, 2);

    // sec-shadowed: undated entry preserved first, dated entries strictly ascending [0, 20700, 20710, 20713, 20720],
    // unknown field 98 preserved, latest (field 16) stripped, updatedAt (field 21) written.
    const shadowed = securities[0] ?? new Map();
    expect(int32At(shadowed, 98)).toBe(777);
    expect(shadowed.has(16)).toBe(false);
    expect(shadowed.has(21)).toBe(true);
    const shadowedPrices = messagesAt(shadowed, 13);
    expect(
      shadowedPrices.map((p) => [
        p.has(1) ? int64At(p, 1) : null,
        int64At(p, 2),
      ]),
    ).toStrictEqual([
      [null, 9_000_000_000],
      [0, 1_000_000_000],
      [20_700, 11_000_000_000],
      [20_710, 11_800_000_000],
      [20_713, 12_025_000_000],
      [20_720, 13_000_000_000],
    ]);
    // Untouched older entry kept its unknown field 99 byte for byte.
    expect(textAt(shadowedPrices[2] ?? new Map(), 99)).toBe("preserve-me");

    // sec-newer-latest kept its strictly newer latest (field 16).
    expect(securities[1]?.has(16)).toBe(true);
    // sec-undated-latest and sec-zero-latest had their shadowed latest stripped.
    expect(securities[2]?.has(16)).toBe(false);
    expect(securities[3]?.has(16)).toBe(false);
    // sec-untouched preserved its unknown field 99 and had no updatedAt added.
    expect(textAt(securities[4] ?? new Map(), 99)).toBe("still-here");
    expect(securities[4]?.has(21)).toBe(false);

    const snapshot = readPortfolioSnapshot(
      withEpochZero.content,
      "q.portfolio",
    );
    expect(
      snapshot.holdings.find((h) => h.id === "sec-newer-latest")?.latestPrice,
    ).toBe(150);
    expect(
      snapshot.holdings.find((h) => h.id === "sec-undated-latest")?.latestPrice,
    ).toBe(50);
  });

  it("refuses empty batches, duplicate security ids, unknown or synthetic security ids, bad dates, and invalid prices", () => {
    const file = samplePortfolioFile();
    expect(() =>
      updateQuotes(file, { date: "2026-09-25", quotes: [] }),
    ).toThrow(new Refusal("Enter at least one security price"));

    expect(() =>
      updateQuotes(file, {
        date: "2026-09-25",
        quotes: [
          { price: 100, securityId: "sec-world" },
          { price: 101, securityId: "sec-world" },
        ],
      }),
    ).toThrow(new Refusal("Each security can only be updated once per batch"));

    expect(() =>
      updateQuotes(file, {
        date: "2026-09-25",
        quotes: [{ price: 100, securityId: "missing" }],
      }),
    ).toThrow(new Refusal("A selected security was not found"));

    expect(() =>
      updateQuotes(file, {
        date: "2026-02-31",
        quotes: [{ price: 100, securityId: "sec-world" }],
      }),
    ).toThrow(new Refusal("Enter a valid calendar date"));

    expect(() =>
      updateQuotes(file, {
        date: "2026-09-25",
        quotes: [{ price: 0, securityId: "sec-world" }],
      }),
    ).toThrow(new Refusal("Quote price must be greater than zero"));
  });

  it("round-trips pre-1970 dates using 10-byte negative varints for transactions and quotes", () => {
    const base = portfolioFile([
      [1, 66],
      [
        2,
        [
          [1, "sec-historic"],
          [3, "Historic Index"],
          [4, "GBP"],
        ],
      ],
      [
        3,
        [
          [1, "cash-gbp"],
          [2, "Historic Cash"],
          [3, "GBP"],
        ],
      ],
      [12, "GBP"],
    ]);

    const withPreEpochTx = appendTransaction(
      base,
      {
        accountId: "cash-gbp",
        amount: 250,
        currency: "GBP",
        date: "1969-12-31",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "deposit",
      },
      { now: new Date("1969-12-31T00:00:00Z"), uuid: () => "tx-pre-1970" },
    );

    const withPreEpochQuote = updateQuotes(withPreEpochTx.content, {
      date: "1969-12-31",
      quotes: [{ price: 42.5, securityId: "sec-historic" }],
    });
    const withEpochZeroQuote = updateQuotes(withPreEpochQuote.content, {
      date: "1970-01-01",
      quotes: [{ price: 43, securityId: "sec-historic" }],
    });

    const client = messageOf(rawClientOf(withEpochZeroQuote.content));
    const tx = messagesAt(client, 5)[0] ?? new Map();
    const txTimestamp = messagesAt(tx, 9)[0] ?? new Map();
    expect(int64At(txTimestamp, 1)).toBe(-86_400);

    const sec = messagesAt(client, 2)[0] ?? new Map();
    expect(
      messagesAt(sec, 13).map((entry) => [
        int64At(entry, 1),
        int64At(entry, 2),
      ]),
    ).toStrictEqual([
      [-1, 4_250_000_000],
      [0, 4_300_000_000],
    ]);

    const preEpochSnapshot = readPortfolioSnapshot(
      withPreEpochQuote.content,
      "historic.portfolio",
    );
    expect(preEpochSnapshot.transactions[0]).toMatchObject({
      date: "1969-12-31",
      id: "tx-pre-1970",
      timestamp: -86_400,
    });
    expect(preEpochSnapshot.holdings[0]).toMatchObject({
      latestPrice: 42.5,
      latestPriceDate: "1969-12-31",
    });

    const epochZeroSnapshot = readPortfolioSnapshot(
      withEpochZeroQuote.content,
      "historic.portfolio",
    );
    expect(epochZeroSnapshot.holdings[0]).toMatchObject({
      latestPrice: 43,
      latestPriceDate: "1970-01-01",
    });
  });
});

describe("readPortfolioTargets", () => {
  it("reads categories, portfolios, and latest active quote and transaction dates in a single pass", () => {
    const file = samplePortfolioFile();

    expect(readPortfolioTargets(file)).toStrictEqual({
      categories: readTargets(file),
      latestQuoteDate: "2026-09-22",
      latestTransactionDate: "2026-09-12",
      portfolios: readPortfolios(file),
    });
  });

  it("prefers active held security quotes over retired, zero-share, and retired-account quotes, falling back to active securities then null", () => {
    // Epoch days: 20_710 = 2026-09-14, 20_715 = 2026-09-19, 20_718 = 2026-09-22, 20_720 = 2026-09-24, 20_725 = 2026-09-29.
    const taxonomyNode: readonly [number, Written] = [
      8,
      [
        [2, "Asset Allocation"],
        [5, [[1, "root"]]],
        [
          5,
          [
            [1, "cat-1"],
            [2, "root"],
            [3, "Core"],
            [6, 10_000],
          ],
        ],
      ],
    ];

    const withStaleHeld = portfolioFile([
      // Active held securities: older then newer to cover comparison in both directions.
      [
        2,
        [
          [1, "sec-held-old"],
          [3, "Held Old"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_710],
              [2, 10_000_000_000],
            ],
          ],
        ],
      ],
      [
        2,
        [
          [1, "sec-held-new"],
          [3, "Held New"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_715],
              [2, 10_000_000_000],
            ],
          ],
        ],
      ],
      // Active zero-share security (no transactions) with a newer quote must not mask held quotes.
      [
        2,
        [
          [1, "sec-unheld"],
          [3, "Watchlist"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_720],
              [2, 10_000_000_000],
            ],
          ],
        ],
      ],
      // Active security sold down to zero shares with a newer quote must not mask held quotes.
      [
        2,
        [
          [1, "sec-sold"],
          [3, "Sold Out"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_720],
              [2, 10_000_000_000],
            ],
          ],
        ],
      ],
      // Active security held only in a retired portfolio must not mask active held quotes.
      [
        2,
        [
          [1, "sec-in-retired-port"],
          [3, "Retired Account Fund"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_720],
              [2, 10_000_000_000],
            ],
          ],
        ],
      ],
      // Retired security held in an active portfolio with the newest quote must be ignored.
      [
        2,
        [
          [1, "sec-retired"],
          [3, "Retired Fund"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_725],
              [2, 10_000_000_000],
            ],
          ],
          [20, 1],
        ],
      ],
      [
        4,
        [
          [1, "port-active"],
          [2, "Active ISA"],
        ],
      ],
      [
        4,
        [
          [1, "port-retired"],
          [2, "Closed GIA"],
          [4, 1],
        ],
      ],
      // Portfolio without field-1 id is skipped by activePortfolioIdsOf.
      [4, [[2, "Idless Portfolio"]]],
      [
        5,
        [
          [2, 2],
          [4, "port-active"],
          [12, 100_000_000],
          [14, "sec-held-old"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-active"],
          [12, 100_000_000],
          [14, "sec-held-new"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-active"],
          [12, 100_000_000],
          [14, "sec-sold"],
        ],
      ],
      [
        5,
        [
          [2, 3],
          [4, "port-active"],
          [12, 100_000_000],
          [14, "sec-sold"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-retired"],
          [12, 100_000_000],
          [14, "sec-in-retired-port"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-active"],
          [12, 100_000_000],
          [14, "sec-retired"],
        ],
      ],
      taxonomyNode,
    ]);

    expect(
      readPortfolioSnapshot(withStaleHeld, "held.portfolio").latestQuoteDate,
    ).toBe("2026-09-19");
    expect(readPortfolioTargets(withStaleHeld).latestQuoteDate).toBe(
      "2026-09-19",
    );

    // When no active held security has a quote, fall back to active unheld securities.
    const fallbackToActive = portfolioFile([
      [
        2,
        [
          [1, "sec-held-unpriced"],
          [3, "Unpriced Held"],
          [4, "GBP"],
        ],
      ],
      [
        2,
        [
          [1, "sec-active-watch"],
          [3, "Watchlist"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_718],
              [2, 10_000_000_000],
            ],
          ],
        ],
      ],
      [
        2,
        [
          [1, "sec-retired-newer"],
          [3, "Retired"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_725],
              [2, 10_000_000_000],
            ],
          ],
          [20, 1],
        ],
      ],
      [
        4,
        [
          [1, "port-active"],
          [2, "Active ISA"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-active"],
          [12, 100_000_000],
          [14, "sec-held-unpriced"],
        ],
      ],
      taxonomyNode,
    ]);

    expect(
      readPortfolioSnapshot(fallbackToActive, "fallback.portfolio")
        .latestQuoteDate,
    ).toBe("2026-09-22");
    expect(readPortfolioTargets(fallbackToActive).latestQuoteDate).toBe(
      "2026-09-22",
    );

    // When only retired securities carry quotes, return null.
    const onlyRetiredQuoted = portfolioFile([
      [
        2,
        [
          [1, "sec-retired-only"],
          [3, "Retired Only"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_725],
              [2, 10_000_000_000],
            ],
          ],
          [20, 1],
        ],
      ],
      taxonomyNode,
    ]);

    expect(
      readPortfolioSnapshot(onlyRetiredQuoted, "retired.portfolio")
        .latestQuoteDate,
    ).toBeNull();
    expect(readPortfolioTargets(onlyRetiredQuoted).latestQuoteDate).toBeNull();
  });

  it("extracts latestTransactionDate across known dated in-range transactions while skipping unknown, undated, and out-of-range ones", () => {
    const taxonomyNode: readonly [number, Written] = [
      8,
      [
        [2, "Asset Allocation"],
        [5, [[1, "root"]]],
        [
          5,
          [
            [1, "cat-1"],
            [2, "root"],
            [3, "Core"],
            [6, 10_000],
          ],
        ],
      ],
    ];

    const mixedTransactions = portfolioFile([
      // Newer dated known transaction (2026-09-12) written before older one (2026-09-10).
      [
        5,
        [
          [2, 6],
          [9, [[1, 1_789_200_000]]],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      [
        5,
        [
          [2, 6],
          [9, [[1, 1_789_000_000]]],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      // Unknown future transaction type carrying a later date is ignored.
      [
        5,
        [
          [2, 99],
          [9, [[1, 1_795_000_000]]],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      // Undated known transaction (no field 9) is ignored.
      [
        5,
        [
          [2, 6],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      // Out-of-range timestamps (too early and too late) are ignored.
      [
        5,
        [
          [2, 6],
          [9, [[1, -40_000_000_000]]],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      [
        5,
        [
          [2, 6],
          [9, [[1, 300_000_000_000]]],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      taxonomyNode,
    ]);

    expect(readPortfolioTargets(mixedTransactions).latestTransactionDate).toBe(
      "2026-09-12",
    );

    const undatedOnly = portfolioFile([
      [
        5,
        [
          [2, 6],
          [10, "GBP"],
          [11, 1000],
        ],
      ],
      taxonomyNode,
    ]);

    expect(readPortfolioTargets(undatedOnly).latestTransactionDate).toBeNull();
  });

  it("refuses out-of-range category shares and target totals that do not add up to 100%", () => {
    const withWeights = (weights: readonly number[]): Uint8Array =>
      portfolioFile([
        [
          8,
          [
            [2, "Asset Allocation"],
            [5, [[1, "root"]]],
            ...weights.map(
              (weight, index) =>
                [
                  5,
                  [
                    [1, `cat-${String(index)}`],
                    [2, "root"],
                    [3, `Category ${String(index)}`],
                    [6, weight],
                  ],
                ] as const,
            ),
          ],
        ],
      ]);

    expect(() => readPortfolioTargets(withWeights([-1000, 11_000]))).toThrow(
      new Refusal("Each target category share must be between 0% and 100%"),
    );
    expect(() => readPortfolioTargets(withWeights([15_000]))).toThrow(
      new Refusal("Each target category share must be between 0% and 100%"),
    );
    expect(() => readPortfolioTargets(withWeights([6000, 3000]))).toThrow(
      new Refusal("Target category shares must add up to 100%"),
    );
    expect(() => readPortfolioTargets(withWeights([6000, 6000]))).toThrow(
      new Refusal("Target category shares must add up to 100%"),
    );
  });

  it("refuses files missing the Asset Allocation taxonomy, holding unconvertible currencies, or not saved in binary", () => {
    const withoutTaxonomy = portfolioFile(clientOf([]));
    expect(() => readPortfolioTargets(withoutTaxonomy)).toThrow(
      new Refusal("The file has no Asset Allocation taxonomy, only none"),
    );

    const unconvertibleFx = holding(
      [["usd-fund", 10_000]],
      [security("usd-fund", "USD", 5_000_000_000)],
      [transaction(0, 100_000_000, "usd-fund")],
    );
    expect(() => readPortfolioTargets(unconvertibleFx)).toThrow(
      new Refusal(
        "The file holds Fund usd-fund, priced in USD, and no transaction in pounds gives a rate for it",
      ),
    );

    expect(() =>
      readPortfolioTargets(strToU8("Account,Balance\nISA,1000")),
    ).toThrow(
      new Refusal(
        "The file is not a zip, as a Portfolio Performance file saved in binary is",
      ),
    );
  });
});
