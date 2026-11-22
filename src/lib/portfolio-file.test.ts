// @vitest-environment node
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { Written } from "@/lib/protobuf.fixture";

import { Refusal } from "@/lib/answer";
import {
  clientOf,
  portfolioFile,
  reference,
  taxonomyOf,
} from "@/lib/portfolio-file.fixture";
import { int32At, messageOf, messagesAt, textAt } from "@/lib/protobuf";

import {
  readPortfolios,
  readPortfolioSnapshot,
  readTargets,
  reweighted,
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
      // Unpriced fund with a zero-close latest quote.
      [
        2,
        [
          [1, "sec-zero"],
          [3, "Pending Launch"],
          [4, "GBP"],
          [
            16,
            [
              [1, 20_718],
              [2, 0],
            ],
          ],
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
      [12, "GBP"],
    ]);

    expect(readPortfolioSnapshot(file, "household.portfolio")).toStrictEqual({
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
      fileName: "household.portfolio",
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
      fileName: "plain.portfolio",
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
      fileName: "dollar.portfolio",
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
      fileName: "edge.portfolio",
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
    });
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
