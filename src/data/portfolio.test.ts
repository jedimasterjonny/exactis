// @vitest-environment node
import { describe, expect, it } from "vitest";

import type {
  CashAccount,
  Holding,
  PortfolioTransaction,
  SecuritiesAccount,
  TransactionType,
} from "./portfolio";

import {
  accountsLayoutOf,
  afterVersionSchema,
  cashTotalsOf,
  effectiveSyncedOn,
  fetchPortfolioQuotesInputSchema,
  holdingsViewOf,
  isIsoCalendarDate,
  newPortfolioAccountSchema,
  newPortfolioSecuritySchema,
  newPortfolioTransactionSchema,
  portfolioQuoteBatchSchema,
  roundPence,
  transactionDirectionOf,
  transactionsViewOf,
  transactionTypeGroups,
  transactionTypeLabels,
  withSyncNote,
} from "./portfolio";

const isaCash: CashAccount = {
  balance: 1250.4,
  balanceGbp: 1250.4,
  currency: "GBP",
  id: "cash-isa",
  isRetired: false,
  name: "ISA Cash",
  transactionCount: 18,
};

const reserveCash: CashAccount = {
  balance: 600,
  balanceGbp: 600,
  currency: "GBP",
  id: "cash-reserve",
  isRetired: false,
  name: "Reserve Cash",
  transactionCount: 4,
};

const euroCash: CashAccount = {
  balance: 350,
  balanceGbp: null,
  currency: "EUR",
  id: "cash-eur",
  isRetired: false,
  name: "Euro Cash",
  transactionCount: 2,
};

const retiredCash: CashAccount = {
  balance: 50,
  balanceGbp: 50,
  currency: "GBP",
  id: "cash-old",
  isRetired: true,
  name: "Old Cash",
  transactionCount: 1,
};

const isaSecurities: SecuritiesAccount = {
  holdingsCount: 4,
  id: "sec-isa",
  isRetired: false,
  marketValue: 42_150.25,
  name: "Brokerage ISA",
  referenceAccountId: "cash-isa",
  transactionCount: 12,
};

const jointSecurities: SecuritiesAccount = {
  holdingsCount: 2,
  id: "sec-joint",
  isRetired: false,
  marketValue: 11_000.15,
  name: "Joint Dealing",
  referenceAccountId: "cash-isa",
  transactionCount: 4,
};

const unlinkedSecurities: SecuritiesAccount = {
  holdingsCount: 1,
  id: "sec-unlinked",
  isRetired: false,
  marketValue: 5000,
  name: "Legacy Certs",
  transactionCount: 1,
};

const retiredSecurities: SecuritiesAccount = {
  holdingsCount: 0,
  id: "sec-old",
  isRetired: true,
  marketValue: 100,
  name: "Closed Account",
  referenceAccountId: "cash-old",
  transactionCount: 2,
};

describe("isIsoCalendarDate", () => {
  it("accepts real four-digit Gregorian calendar dates and rejects malformed, out-of-range, and rolled-over dates", () => {
    expect(isIsoCalendarDate("2026-09-25")).toBe(true);
    expect(isIsoCalendarDate("1970-01-01")).toBe(true);
    expect(isIsoCalendarDate("2024-02-29")).toBe(true);
    expect(isIsoCalendarDate("1000-01-01")).toBe(true);
    expect(isIsoCalendarDate("9999-12-31")).toBe(true);

    expect(isIsoCalendarDate("")).toBe(false);
    expect(isIsoCalendarDate("2026-9-5")).toBe(false);
    expect(isIsoCalendarDate("2026/09/25")).toBe(false);
    expect(isIsoCalendarDate("0500-01-01")).toBe(false);
    expect(isIsoCalendarDate("0999-12-31")).toBe(false);
    expect(isIsoCalendarDate("2026-13-01")).toBe(false);
    expect(isIsoCalendarDate("2026-00-10")).toBe(false);
    expect(isIsoCalendarDate("2026-02-31")).toBe(false);
    expect(isIsoCalendarDate("2025-02-29")).toBe(false);
    expect(isIsoCalendarDate("2026-04-31")).toBe(false);
  });
});

describe("roundPence", () => {
  it("rounds to two decimal places and normalises minus zero", () => {
    expect([
      roundPence(12.345),
      roundPence(-0.004),
      roundPence(0.1 + 0.2),
    ]).toStrictEqual([12.35, 0, 0.3]);
    expect(Object.is(roundPence(-0.004), 0)).toBe(true);
  });
});

describe("cashTotalsOf", () => {
  it("sums convertible sterling balances and lists sorted unique excluded currencies", () => {
    const emptyFrancs: CashAccount = {
      balance: 0,
      balanceGbp: null,
      currency: "CHF",
      id: "cash-chf",
      isRetired: false,
      name: "Swiss Cash",
      transactionCount: 0,
    };
    const dollarCash: CashAccount = {
      balance: 400,
      balanceGbp: null,
      currency: "USD",
      id: "cash-usd",
      isRetired: false,
      name: "US Cash",
      transactionCount: 3,
    };

    expect(
      cashTotalsOf([
        isaCash,
        dollarCash,
        euroCash,
        { ...euroCash, id: "cash-eur-2" },
        emptyFrancs,
        reserveCash,
      ]),
    ).toStrictEqual({ excludedCurrencies: ["EUR", "USD"], totalGbp: 1850.4 });
  });
});

describe("accountsLayoutOf", () => {
  it("pairs by UUID, deduplicates shared reference cash accounts, and lists unreferenced cash standalone", () => {
    const layout = accountsLayoutOf(
      [isaSecurities, jointSecurities, unlinkedSecurities],
      [isaCash, reserveCash, euroCash],
      false,
    );

    expect(layout).toStrictEqual({
      hasRetired: false,
      investedTotal: 58_150.4,
      pairs: [
        {
          reference: { account: isaCash, isShared: false },
          securities: isaSecurities,
        },
        {
          reference: { account: isaCash, isShared: true },
          securities: jointSecurities,
        },
        { reference: null, securities: unlinkedSecurities },
      ],
      refCashExcluded: [],
      refCashTotal: 1250.4,
      standaloneCash: [reserveCash, euroCash],
      standaloneCashExcluded: ["EUR"],
      standaloneCashTotal: 600,
      total: 60_000.8,
    });
  });

  it("hides retired accounts by default and reveals them when requested", () => {
    const hidden = accountsLayoutOf(
      [isaSecurities, retiredSecurities],
      [isaCash, retiredCash],
      false,
    );
    const shown = accountsLayoutOf(
      [isaSecurities, retiredSecurities],
      [isaCash, retiredCash],
      true,
    );

    expect(hidden.hasRetired).toBe(true);
    expect(hidden.pairs).toHaveLength(1);
    expect(hidden.total).toBeCloseTo(43_400.65, 10);

    expect(shown.hasRetired).toBe(true);
    expect(shown.pairs).toHaveLength(2);
    expect(shown.pairs[1]).toStrictEqual({
      reference: { account: retiredCash, isShared: false },
      securities: retiredSecurities,
    });
    expect(shown.total).toBeCloseTo(43_550.65, 10);
  });

  it("keeps an active cash account standalone while its referencing securities account is retired and hidden", () => {
    const retiredLinkingActive: SecuritiesAccount = {
      ...retiredSecurities,
      referenceAccountId: "cash-reserve",
    };

    const hidden = accountsLayoutOf(
      [retiredLinkingActive],
      [reserveCash],
      false,
    );

    expect(hidden.hasRetired).toBe(true);
    expect(hidden.pairs).toStrictEqual([]);
    expect(hidden.standaloneCash).toStrictEqual([reserveCash]);
    expect(hidden.total).toBe(600);
  });

  it("keys accounts by UUID even when a securities account and cash account share the same name", () => {
    const sameNameCashA: CashAccount = {
      ...isaCash,
      id: "uuid-cash-a",
      name: "Brokerage",
    };
    const sameNameCashB: CashAccount = {
      ...reserveCash,
      id: "uuid-cash-b",
      name: "Brokerage",
    };
    const sameNameSec: SecuritiesAccount = {
      ...isaSecurities,
      id: "uuid-sec",
      name: "Brokerage",
      referenceAccountId: "uuid-cash-b",
    };

    const layout = accountsLayoutOf(
      [sameNameSec],
      [sameNameCashA, sameNameCashB],
      false,
    );

    expect(layout.pairs).toStrictEqual([
      {
        reference: { account: sameNameCashB, isShared: false },
        securities: sameNameSec,
      },
    ]);
    expect(layout.standaloneCash).toStrictEqual([sameNameCashA]);
  });

  it("reports hasRetired when only a cash account is retired", () => {
    const layout = accountsLayoutOf([], [retiredCash], false);

    expect(layout.hasRetired).toBe(true);
    expect(layout.standaloneCash).toStrictEqual([]);
  });
});

describe("holdingsViewOf", () => {
  const worldEquity: Holding = {
    category: "Global equity",
    currency: "GBP",
    gbpRate: 1,
    id: "sec-world",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 100,
    latestPriceDate: "2026-09-25",
    name: "World Equity",
    shares: 15,
    sharesByAccount: [
      { portfolioId: "sec-isa", shares: 10 },
      { portfolioId: "sec-joint", shares: 5 },
    ],
    transactionCount: 2,
  };

  const ukGilts: Holding = {
    currency: "GBX",
    gbpRate: 0.01,
    id: "sec-gilts",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 25_000,
    latestPriceDate: "2026-09-25",
    name: "UK Gilts",
    shares: 2,
    sharesByAccount: [{ portfolioId: "sec-isa", shares: 2 }],
    transactionCount: 1,
  };

  const alphaBond: Holding = {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-alpha",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 100,
    latestPriceDate: "2026-09-25",
    name: "Alpha Bond",
    shares: 5,
    sharesByAccount: [{ portfolioId: "sec-joint", shares: 5 }],
    transactionCount: 1,
  };

  const unpricedFund: Holding = {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-unpriced",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: null,
    latestPriceDate: null,
    name: "Zeta Private",
    shares: 3,
    sharesByAccount: [{ portfolioId: "sec-isa", shares: 3 }],
    transactionCount: 1,
  };

  const noFxFund: Holding = {
    currency: "JPY",
    gbpRate: null,
    id: "sec-jpy",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 2000,
    latestPriceDate: "2026-09-25",
    name: "Beta Japan",
    shares: 4,
    sharesByAccount: [{ portfolioId: "sec-isa", shares: 4 }],
    transactionCount: 1,
  };

  const zeroShareFund: Holding = {
    currency: "USD",
    gbpRate: 0.75,
    id: "sec-zero",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 80,
    latestPriceDate: "2026-09-25",
    name: "Dormant US",
    shares: 0,
    sharesByAccount: [],
    transactionCount: 0,
  };

  it("aggregates across accounts, sorts valued descending then unpriced/no-fx then zero alphabetically, and computes shown shares", () => {
    const view = holdingsViewOf(
      [zeroShareFund, ukGilts, unpricedFund, worldEquity, alphaBond, noFxFund],
      { accountId: "", isShowingZeroShares: true },
    );

    expect(view.hasZeroShare).toBe(true);
    expect(view.hasForeignPrices).toBe(true);
    expect(view.totalGbp).toBe(2500);
    expect(
      view.rows.map(
        ({ accountCount, holding, marketValueGbp, share, shares, status }) => ({
          accountCount,
          marketValueGbp,
          name: holding.name,
          share,
          shares,
          status,
        }),
      ),
    ).toStrictEqual([
      {
        accountCount: 2,
        marketValueGbp: 1500,
        name: "World Equity",
        share: 0.6,
        shares: 15,
        status: "valued",
      },
      {
        accountCount: 1,
        marketValueGbp: 500,
        name: "Alpha Bond",
        share: 0.2,
        shares: 5,
        status: "valued",
      },
      {
        accountCount: 1,
        marketValueGbp: 500,
        name: "UK Gilts",
        share: 0.2,
        shares: 2,
        status: "valued",
      },
      {
        accountCount: 1,
        marketValueGbp: null,
        name: "Beta Japan",
        share: 0,
        shares: 4,
        status: "no-fx",
      },
      {
        accountCount: 1,
        marketValueGbp: null,
        name: "Zeta Private",
        share: 0,
        shares: 3,
        status: "unpriced",
      },
      {
        accountCount: 0,
        marketValueGbp: 0,
        name: "Dormant US",
        share: 0,
        shares: 0,
        status: "zero",
      },
    ]);
  });

  it("filters by a single securities account UUID, hides zero-share rows when off, and rescales shares to 100%", () => {
    const view = holdingsViewOf([worldEquity, ukGilts, alphaBond], {
      accountId: "sec-isa",
      isShowingZeroShares: false,
    });

    expect(view.hasZeroShare).toBe(true);
    expect(view.hasForeignPrices).toBe(false);
    expect(view.totalGbp).toBe(1500);
    expect(
      view.rows.map(
        ({ accountCount, holding, marketValueGbp, share, shares }) => ({
          accountCount,
          marketValueGbp,
          name: holding.name,
          share: roundPence(share * 100),
          shares,
        }),
      ),
    ).toStrictEqual([
      {
        accountCount: 1,
        marketValueGbp: 1000,
        name: "World Equity",
        share: 66.67,
        shares: 10,
      },
      {
        accountCount: 1,
        marketValueGbp: 500,
        name: "UK Gilts",
        share: 33.33,
        shares: 2,
      },
    ]);
  });

  it("reports zero share weights when totalGbp is zero", () => {
    const view = holdingsViewOf([unpricedFund, zeroShareFund], {
      accountId: "",
      isShowingZeroShares: true,
    });

    expect(view.totalGbp).toBe(0);
    expect(view.rows.map((row) => row.share)).toStrictEqual([0, 0]);
  });

  it("sums per-account penny-rounded lots so unfiltered Holdings reconciles with Accounts, and ignores unpriced or blank-currency rows for hasForeignPrices", () => {
    const fractionalAcrossTwo: Holding = {
      currency: "",
      gbpRate: 1,
      id: "sec-frac",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 10.004,
      latestPriceDate: "2026-09-25",
      name: "Fractional Blank Currency",
      shares: 2,
      sharesByAccount: [
        { portfolioId: "sec-isa", shares: 1 },
        { portfolioId: "sec-joint", shares: 1 },
      ],
      transactionCount: 2,
    };
    const unpricedUsd: Holding = {
      currency: "USD",
      gbpRate: 0.75,
      id: "sec-unpriced-usd",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: null,
      latestPriceDate: null,
      name: "Unpriced Dollar",
      shares: 1,
      sharesByAccount: [{ portfolioId: "sec-isa", shares: 1 }],
      transactionCount: 1,
    };

    const view = holdingsViewOf([fractionalAcrossTwo, unpricedUsd], {
      accountId: "",
      isShowingZeroShares: false,
    });

    expect(view.totalGbp).toBe(20);
    expect(view.rows[0]?.marketValueGbp).toBe(20);
    expect(view.hasForeignPrices).toBe(false);
  });
});

describe("transactionDirectionOf and transactionTypeGroups", () => {
  it("groups every transaction type once and assigns cash-flow directions exhaustively", () => {
    const grouped = transactionTypeGroups.flatMap((group) =>
      group.options.map((option) => option.value),
    );
    expect(grouped).toHaveLength(15);
    expect(new Set(grouped).size).toBe(15);
    expect(transactionTypeGroups.map((group) => group.label)).toStrictEqual([
      "Trades",
      "Deliveries",
      "Cash flow",
      "Income & costs",
      "Transfers",
    ]);

    const expected: Record<TransactionType, "in" | "neutral" | "out"> = {
      "cash-transfer": "neutral",
      deposit: "in",
      dividend: "in",
      fee: "out",
      "fee-refund": "in",
      "inbound-delivery": "neutral",
      interest: "in",
      "interest-charge": "out",
      "outbound-delivery": "neutral",
      purchase: "out",
      removal: "out",
      sale: "in",
      "security-transfer": "neutral",
      tax: "out",
      "tax-refund": "in",
    };

    for (const type of grouped) {
      expect(transactionDirectionOf(type)).toBe(expected[type]);
    }
    expect(transactionTypeLabels["cash-transfer"]).toBe("Cash transfer");
  });
});

describe("transactionsViewOf", () => {
  const rows: readonly PortfolioTransaction[] = [
    {
      accountId: "cash-isa",
      accountName: "ISA Cash",
      amount: 1250,
      currency: "GBP",
      date: "2026-09-22",
      fees: 1.5,
      id: "tx-buy",
      portfolioId: "sec-isa",
      portfolioName: "ISA",
      securityId: "sec-world",
      securityName: "World Equity",
      shares: 10,
      taxes: 0,
      timestamp: 1_790_000_000,
      type: "purchase",
    },
    {
      accountId: "cash-isa",
      accountName: "ISA Cash",
      amount: 300,
      currency: "GBP",
      date: "2026-09-20",
      fees: 0,
      id: "tx-cash-move",
      otherAccountId: "cash-reserve",
      otherAccountName: "Reserve Cash",
      shares: 0,
      taxes: 0,
      timestamp: 1_789_900_000,
      type: "cash-transfer",
    },
    {
      amount: 500,
      currency: "GBP",
      date: "2026-09-18",
      fees: 0,
      id: "tx-sec-move",
      otherPortfolioId: "sec-gia",
      otherPortfolioName: "GIA",
      portfolioId: "sec-isa",
      portfolioName: "ISA",
      securityId: "sec-gilts",
      securityName: "UK Gilts",
      shares: 5,
      taxes: 0,
      timestamp: 1_789_800_000,
      type: "security-transfer",
    },
  ];

  it("filters by account/portfolio UUID across source and destination fields, security UUID, and type", () => {
    expect(
      transactionsViewOf(rows, { accountId: "", securityId: "", type: "" }).map(
        (tx) => tx.id,
      ),
    ).toStrictEqual(["tx-buy", "tx-cash-move", "tx-sec-move"]);
    expect(
      transactionsViewOf(rows, {
        accountId: "cash-reserve",
        securityId: "",
        type: "",
      }).map((tx) => tx.id),
    ).toStrictEqual(["tx-cash-move"]);
    expect(
      transactionsViewOf(rows, {
        accountId: "sec-gia",
        securityId: "",
        type: "",
      }).map((tx) => tx.id),
    ).toStrictEqual(["tx-sec-move"]);
    expect(
      transactionsViewOf(rows, {
        accountId: "sec-isa",
        securityId: "sec-world",
        type: "purchase",
      }).map((tx) => tx.id),
    ).toStrictEqual(["tx-buy"]);
    expect(
      transactionsViewOf(rows, {
        accountId: "cash-isa",
        securityId: "",
        type: "dividend",
      }),
    ).toStrictEqual([]);
  });
});

describe("portfolio write-back schemas", () => {
  it("validates afterVersionSchema bounds for mutations", () => {
    expect(afterVersionSchema.parse(1)).toBe(1);
    expect(afterVersionSchema.parse(2_147_483_646)).toBe(2_147_483_646);
    expect(afterVersionSchema.safeParse(0).success).toBe(false);
    expect(afterVersionSchema.safeParse(-1).success).toBe(false);
    expect(afterVersionSchema.safeParse(1.5).success).toBe(false);
    expect(afterVersionSchema.safeParse(2_147_483_647).success).toBe(false);
  });

  it("validates newPortfolioAccountSchema including currency, single-line text, and note caps", () => {
    expect(
      newPortfolioAccountSchema.parse({
        currency: "CHF",
        kind: "cash",
        name: "  Swiss Reserve  ",
        note: "  Line 1\nLine 2  ",
      }),
    ).toStrictEqual({
      currency: "CHF",
      kind: "cash",
      name: "Swiss Reserve",
      note: "Line 1\nLine 2",
    });
    expect(
      newPortfolioAccountSchema.parse({
        kind: "securities",
        name: "Harbour GIA",
        referenceAccountId: "cash-isa",
      }),
    ).toStrictEqual({
      kind: "securities",
      name: "Harbour GIA",
      referenceAccountId: "cash-isa",
    });

    expect(
      newPortfolioAccountSchema.safeParse({
        currency: "GBX",
        kind: "cash",
        name: "Pence Cash",
      }).success,
    ).toBe(false);
    expect(
      newPortfolioAccountSchema.safeParse({
        currency: "GBP",
        kind: "cash",
        name: "Line\nbreak",
      }).success,
    ).toBe(false);
    expect(
      newPortfolioAccountSchema.safeParse({
        currency: "GBP",
        kind: "cash",
        name: "a".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      newPortfolioAccountSchema.safeParse({
        currency: "GBP",
        kind: "cash",
        name: "Ok",
        note: "a".repeat(1001),
      }).success,
    ).toBe(false);
  });

  it("validates newPortfolioSecuritySchema including GBX, ceilings, and integer-unit positivity", () => {
    expect(
      newPortfolioSecuritySchema.parse({
        categoryId: "aa-equity",
        currency: "GBX",
        isin: " GB00TEST0001 ",
        latestPrice: 214.015,
        latestPriceDate: "2026-09-25",
        name: "UK Gilts",
        ticker: " UKGT ",
      }),
    ).toStrictEqual({
      categoryId: "aa-equity",
      currency: "GBX",
      isin: "GB00TEST0001",
      latestPrice: 214.015,
      latestPriceDate: "2026-09-25",
      name: "UK Gilts",
      ticker: "UKGT",
    });
    expect(
      newPortfolioSecuritySchema.parse({
        currency: "JPY",
        latestPrice: null,
        name: "Nikkei ETF",
      }),
    ).toStrictEqual({ currency: "JPY", latestPrice: null, name: "Nikkei ETF" });

    expect(
      newPortfolioSecuritySchema.safeParse({
        currency: "GBP",
        latestPrice: 1e-10,
        name: "Tiny",
      }).success,
    ).toBe(false);
    expect(
      newPortfolioSecuritySchema.safeParse({
        currency: "GBP",
        latestPrice: 90_000_001,
        name: "Huge",
      }).success,
    ).toBe(false);
    expect(
      newPortfolioSecuritySchema.safeParse({
        currency: "GBP",
        isin: "X".repeat(33),
        latestPrice: null,
        name: "Long ISIN",
      }).success,
    ).toBe(false);
    expect(
      newPortfolioSecuritySchema.safeParse({
        currency: "GBP",
        latestPrice: 10,
        latestPriceDate: "2026-02-31",
        name: "Bad Date",
      }).success,
    ).toBe(false);
  });

  it("validates newPortfolioTransactionSchema across amount/share refinements, dates, and GBX rejection", () => {
    const validDeposit = {
      accountId: "cash-isa",
      amount: 100,
      currency: "GBP",
      date: "2026-09-25",
      fees: 0,
      shares: 0,
      taxes: 0,
      type: "deposit",
    } as const;
    expect(newPortfolioTransactionSchema.parse(validDeposit)).toStrictEqual(
      validDeposit,
    );
    expect(
      newPortfolioTransactionSchema.parse({
        amount: 0,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        otherPortfolioId: "port-2",
        portfolioId: "port-1",
        securityId: "sec-1",
        shares: 2.5,
        taxes: 0,
        type: "security-transfer",
      }).amount,
    ).toBe(0);

    expect(
      newPortfolioTransactionSchema.safeParse({
        ...validDeposit,
        amount: 0.001,
      }).success,
    ).toBe(false);
    expect(
      newPortfolioTransactionSchema.safeParse({
        ...validDeposit,
        currency: "GBX",
      }).success,
    ).toBe(false);
    expect(
      newPortfolioTransactionSchema.safeParse({
        ...validDeposit,
        date: "2026-02-31",
      }).success,
    ).toBe(false);
    expect(
      newPortfolioTransactionSchema.safeParse({
        ...validDeposit,
        portfolioId: "port-1",
        securityId: "sec-1",
        shares: 1e-10,
        type: "purchase",
      }).success,
    ).toBe(false);
    expect(
      newPortfolioTransactionSchema.safeParse({
        ...validDeposit,
        amount: 1_000_000_000_001,
      }).success,
    ).toBe(false);
    expect(
      newPortfolioTransactionSchema.parse({ ...validDeposit, fxAmount: 125.5 })
        .fxAmount,
    ).toBe(125.5);
    expect(
      newPortfolioTransactionSchema.safeParse({
        ...validDeposit,
        fxAmount: 0.001,
      }).success,
    ).toBe(false);
    expect(
      newPortfolioTransactionSchema.safeParse({
        ...validDeposit,
        fxAmount: 1_000_000_000_001,
      }).success,
    ).toBe(false);
  });

  it("validates portfolioQuoteBatchSchema for size bounds, uniqueness, dates, and positive prices", () => {
    expect(
      portfolioQuoteBatchSchema.parse({
        date: "2026-09-25",
        quotes: [
          { price: 125.5, securityId: "sec-1" },
          { date: "2026-09-24", price: 88.25, securityId: "sec-2" },
        ],
      }),
    ).toStrictEqual({
      date: "2026-09-25",
      quotes: [
        { price: 125.5, securityId: "sec-1" },
        { date: "2026-09-24", price: 88.25, securityId: "sec-2" },
      ],
    });
    expect(
      portfolioQuoteBatchSchema.safeParse({
        date: "2026-09-25",
        quotes: [{ date: "2026-02-31", price: 10, securityId: "sec-1" }],
      }).success,
    ).toBe(false);
    expect(
      portfolioQuoteBatchSchema.safeParse({ date: "2026-09-25", quotes: [] })
        .success,
    ).toBe(false);
    expect(
      portfolioQuoteBatchSchema.safeParse({
        date: "2026-09-25",
        quotes: [
          { price: 10, securityId: "sec-1" },
          { price: 11, securityId: "sec-1" },
        ],
      }).success,
    ).toBe(false);
    expect(
      portfolioQuoteBatchSchema.safeParse({
        date: "2026-09-25",
        quotes: Array.from({ length: 1001 }, (_, i) => ({
          price: 10,
          securityId: `sec-${String(i)}`,
        })),
      }).success,
    ).toBe(false);
  });

  it("validates fetchPortfolioQuotesInputSchema for bounds and uniqueness", () => {
    expect(
      fetchPortfolioQuotesInputSchema.parse({
        securityIds: ["sec-1", "sec-2"],
      }),
    ).toStrictEqual({ securityIds: ["sec-1", "sec-2"] });
    expect(
      fetchPortfolioQuotesInputSchema.safeParse({ securityIds: [] }).success,
    ).toBe(false);
    expect(
      fetchPortfolioQuotesInputSchema.safeParse({
        securityIds: ["sec-1", "sec-1"],
      }).success,
    ).toBe(false);
    expect(
      fetchPortfolioQuotesInputSchema.safeParse({
        securityIds: Array.from({ length: 101 }, (_, i) => `sec-${String(i)}`),
      }).success,
    ).toBe(false);
  });
});

describe("effectiveSyncedOn", () => {
  it("picks the later of quote and transaction dates, falling back to whichever is present or savedOn", () => {
    expect(
      effectiveSyncedOn({
        latestQuoteDate: "2026-09-22",
        latestTransactionDate: "2026-09-12",
        savedOn: "2026-09-25",
      }),
    ).toBe("2026-09-22");
    expect(
      effectiveSyncedOn({
        latestQuoteDate: "2026-09-12",
        latestTransactionDate: "2026-09-12",
        savedOn: "2026-09-25",
      }),
    ).toBe("2026-09-12");
    expect(
      effectiveSyncedOn({
        latestQuoteDate: "2026-09-10",
        latestTransactionDate: "2026-09-20",
        savedOn: "2026-09-25",
      }),
    ).toBe("2026-09-20");
    expect(
      effectiveSyncedOn({
        latestQuoteDate: "2026-09-18",
        latestTransactionDate: null,
        savedOn: "2026-09-25",
      }),
    ).toBe("2026-09-18");
    expect(
      effectiveSyncedOn({
        latestQuoteDate: null,
        latestTransactionDate: "2026-09-14",
        savedOn: "2026-09-25",
      }),
    ).toBe("2026-09-14");
    expect(
      effectiveSyncedOn({
        latestQuoteDate: null,
        latestTransactionDate: null,
        savedOn: "2026-09-25",
      }),
    ).toBe("2026-09-25");
  });
});

describe("withSyncNote", () => {
  it("returns the base description unchanged when syncWarning is undefined, and appends the sync note when present", () => {
    expect(withSyncNote("Saved to northstar.portfolio", undefined)).toBe(
      "Saved to northstar.portfolio",
    );
    expect(
      withSyncNote(
        "Saved to northstar.portfolio",
        "The file has no Asset Allocation taxonomy, only none",
      ),
    ).toBe(
      "Saved to northstar.portfolio. Targets not synced: The file has no Asset Allocation taxonomy, only none",
    );
  });
});
