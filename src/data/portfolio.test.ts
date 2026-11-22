// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { CashAccount, SecuritiesAccount } from "./portfolio";

import { accountsLayoutOf, cashTotalsOf, roundPence } from "./portfolio";

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
