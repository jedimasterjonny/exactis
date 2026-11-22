// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { CashAccount, Holding, SecuritiesAccount } from "./portfolio";

import {
  accountsLayoutOf,
  cashTotalsOf,
  holdingsViewOf,
  roundPence,
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
};

const jointSecurities: SecuritiesAccount = {
  holdingsCount: 2,
  id: "sec-joint",
  isRetired: false,
  marketValue: 11_000.15,
  name: "Joint Dealing",
  referenceAccountId: "cash-isa",
};

const unlinkedSecurities: SecuritiesAccount = {
  holdingsCount: 1,
  id: "sec-unlinked",
  isRetired: false,
  marketValue: 5000,
  name: "Legacy Certs",
};

const retiredSecurities: SecuritiesAccount = {
  holdingsCount: 0,
  id: "sec-old",
  isRetired: true,
  marketValue: 100,
  name: "Closed Account",
  referenceAccountId: "cash-old",
};

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
    latestPrice: 100,
    latestPriceDate: "2026-09-25",
    name: "World Equity",
    shares: 15,
    sharesByAccount: [
      { portfolioId: "sec-isa", shares: 10 },
      { portfolioId: "sec-joint", shares: 5 },
    ],
  };

  const ukGilts: Holding = {
    currency: "GBX",
    gbpRate: 0.01,
    id: "sec-gilts",
    isRetired: false,
    latestPrice: 25_000,
    latestPriceDate: "2026-09-25",
    name: "UK Gilts",
    shares: 2,
    sharesByAccount: [{ portfolioId: "sec-isa", shares: 2 }],
  };

  const alphaBond: Holding = {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-alpha",
    isRetired: false,
    latestPrice: 100,
    latestPriceDate: "2026-09-25",
    name: "Alpha Bond",
    shares: 5,
    sharesByAccount: [{ portfolioId: "sec-joint", shares: 5 }],
  };

  const unpricedFund: Holding = {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-unpriced",
    isRetired: false,
    latestPrice: null,
    latestPriceDate: null,
    name: "Zeta Private",
    shares: 3,
    sharesByAccount: [{ portfolioId: "sec-isa", shares: 3 }],
  };

  const noFxFund: Holding = {
    currency: "JPY",
    gbpRate: null,
    id: "sec-jpy",
    isRetired: false,
    latestPrice: 2000,
    latestPriceDate: "2026-09-25",
    name: "Beta Japan",
    shares: 4,
    sharesByAccount: [{ portfolioId: "sec-isa", shares: 4 }],
  };

  const zeroShareFund: Holding = {
    currency: "USD",
    gbpRate: 0.75,
    id: "sec-zero",
    isRetired: false,
    latestPrice: 80,
    latestPriceDate: "2026-09-25",
    name: "Dormant US",
    shares: 0,
    sharesByAccount: [],
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
      latestPrice: 10.004,
      latestPriceDate: "2026-09-25",
      name: "Fractional Blank Currency",
      shares: 2,
      sharesByAccount: [
        { portfolioId: "sec-isa", shares: 1 },
        { portfolioId: "sec-joint", shares: 1 },
      ],
    };
    const unpricedUsd: Holding = {
      currency: "USD",
      gbpRate: 0.75,
      id: "sec-unpriced-usd",
      isRetired: false,
      latestPrice: null,
      latestPriceDate: null,
      name: "Unpriced Dollar",
      shares: 1,
      sharesByAccount: [{ portfolioId: "sec-isa", shares: 1 }],
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
