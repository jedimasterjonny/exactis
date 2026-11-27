// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { PortfolioFeed } from "@/data/portfolio";

import { saved } from "@/lib/answer";

import type { MonthEndPortfolio } from "./portfolio-balances";

import {
  evaluatePrefillForMonth,
  portfolioBalancesFor,
} from "./portfolio-balances";

type FeedCash = PortfolioFeed["accounts"]["cash"][number];
type FeedSecurities = PortfolioFeed["accounts"]["securities"][number];

const due = { month: 8, year: 2026 }; // 25 Sep 2026

function accountOf(
  id: number,
  name: string,
  overrides: Partial<Account> = {},
): Account {
  const kind = overrides.kind ?? "tax-free";
  return {
    balance: 10_000,
    growth: { kind: "plan" },
    id,
    kind,
    name,
    ...((kind === "tax-free" || kind === "tax-deferred") && { owner: 1 }),
    ...overrides,
  };
}

function cashOf(
  id: string,
  name: string,
  overrides: Partial<FeedCash> = {},
): FeedCash {
  return {
    balance: 1000,
    balanceGbp: 1000,
    currency: "GBP",
    id,
    isRetired: false,
    lastTransactionDate: "2026-09-10",
    name,
    referencedBy: [],
    ...overrides,
  };
}

function entryOf(
  resolved: MonthEndPortfolio | undefined,
  id: number,
): MonthEndPortfolio["byAccountId"][number] {
  const found = resolved?.byAccountId[id];
  if (found === undefined) {
    throw new Error(
      `Missing Portfolio balance entry for account ${String(id)}`,
    );
  }
  return found;
}

function feedOf({
  cash = [],
  securities = [],
}: {
  readonly cash?: readonly FeedCash[];
  readonly securities?: readonly FeedSecurities[];
}): PortfolioFeed {
  return {
    accounts: { cash, securities },
    handoff: { securitiesAccounts: [], securitiesByCategory: {} },
    latestQuoteDate: "2026-09-25",
    latestTransactionDate: "2026-09-20",
    targets: saved({ categories: [], portfolios: [] }),
  };
}

function secOf(
  id: string,
  name: string,
  overrides: Partial<FeedSecurities> = {},
): FeedSecurities {
  return {
    foreignCurrencies: [],
    hasUncurrenciedHoldings: false,
    holdingsCount: 1,
    id,
    isRetired: false,
    lastTransactionDate: "2026-09-20",
    marketValueGbp: 25_000,
    name,
    noFxCurrencies: [],
    oldestQuoteDate: "2026-09-25",
    referenceCash: null,
    unpricedCount: 0,
    ...overrides,
  };
}

describe("portfolioBalancesFor", () => {
  it("returns undefined when no saving account carries a Portfolio link", () => {
    const accounts: readonly Account[] = [
      accountOf(1, "Unlinked ISA"),
      accountOf(2, "Mortgage", {
        balance: -150_000,
        growth: { kind: "fixed", rate: 0.04 },
        kind: "debt",
      }),
    ];

    expect(portfolioBalancesFor(accounts, feedOf({}))).toBeUndefined();
  });

  it("values linked securities accounts with paired reference cash, formatting reconciled, fractional, and overdrawn breakdowns with real minus", () => {
    const accounts: readonly Account[] = [
      accountOf(1, "Whole ISA", { portfolio: "Whole ISA" }),
      accountOf(2, "Pence ISA", { portfolio: "Pence ISA" }),
      accountOf(3, "Overdrawn Whole", { portfolio: "Overdrawn Whole" }),
      accountOf(4, "Overdrawn Pence", { portfolio: "Overdrawn Pence" }),
      accountOf(5, "Same Name Pair", { portfolio: "Same Name Pair" }),
    ];
    const feed = feedOf({
      cash: [
        cashOf("c-same", "Same Name Pair", {
          balance: 250,
          balanceGbp: 250,
          referencedBy: ["Same Name Pair"],
        }),
      ],
      securities: [
        secOf("s-1", "Whole ISA", {
          marketValueGbp: 274_711,
          referenceCash: {
            balance: 1830,
            balanceGbp: 1830,
            currency: "GBP",
            id: "c-1",
            isRetired: false,
            isShared: false,
            lastTransactionDate: "2026-09-22",
            name: "ISA Cash",
          },
        }),
        secOf("s-2", "Pence ISA", {
          marketValueGbp: 1000.6,
          referenceCash: {
            balance: 200.6,
            balanceGbp: 200.6,
            currency: "GBP",
            id: "c-2",
            isRetired: false,
            isShared: false,
            lastTransactionDate: "2026-09-10",
            name: "Pence Cash",
          },
        }),
        secOf("s-3", "Overdrawn Whole", {
          marketValueGbp: 1000,
          referenceCash: {
            balance: -250,
            balanceGbp: -250,
            currency: "GBP",
            id: "c-3",
            isRetired: false,
            isShared: false,
            lastTransactionDate: null,
            name: "Margin Cash",
          },
        }),
        secOf("s-4", "Overdrawn Pence", {
          marketValueGbp: 1000.4,
          referenceCash: {
            balance: -250.6,
            balanceGbp: -250.6,
            currency: "GBP",
            id: "c-4",
            isRetired: false,
            isShared: false,
            lastTransactionDate: null,
            name: "Margin Pence",
          },
        }),
        secOf("s-5", "Same Name Pair", {
          lastTransactionDate: null,
          marketValueGbp: 5000,
          referenceCash: {
            balance: 250,
            balanceGbp: 250,
            currency: "GBP",
            id: "c-same",
            isRetired: false,
            isShared: false,
            lastTransactionDate: "2026-09-21",
            name: "Same Name Pair",
          },
        }),
      ],
    });

    const resolved = portfolioBalancesFor(accounts, feed);
    expect(resolved?.byAccountId[1]).toStrictEqual({
      balance: 276_541,
      breakdown: "£274,711 + £1,830 cash",
      hasHoldings: true,
      kind: "ready",
      lastTransactionDate: "2026-09-22",
      oldestQuoteDate: "2026-09-25",
      portfolioName: "Whole ISA",
      warnings: [],
    });
    expect(resolved?.byAccountId[2]).toStrictEqual({
      balance: 1201,
      breakdown: "£1,000.60 + £200.60 cash",
      hasHoldings: true,
      kind: "ready",
      lastTransactionDate: "2026-09-20",
      oldestQuoteDate: "2026-09-25",
      portfolioName: "Pence ISA",
      warnings: [],
    });
    expect(resolved?.byAccountId[3]).toMatchObject({
      balance: 750,
      breakdown: "£1,000 − £250 cash",
      kind: "ready",
    });
    expect(resolved?.byAccountId[4]).toMatchObject({
      balance: 750,
      breakdown: "£1,000.40 − £250.60 cash",
      kind: "ready",
    });
    expect(resolved?.byAccountId[5]).toMatchObject({
      balance: 5250,
      breakdown: "£5,000 + £250 cash",
      kind: "ready",
      lastTransactionDate: "2026-09-21",
    });
  });

  it("enforces completeness guards for unpriced, uncurrencied, missing FX, retired/shared reference cash, negative totals, and standalone cash", () => {
    const accounts: readonly Account[] = [
      accountOf(1, "Unpriced", { portfolio: "Unpriced" }),
      accountOf(2, "Uncurrencied", { portfolio: "Uncurrencied" }),
      accountOf(3, "No FX", { portfolio: "No FX" }),
      accountOf(4, "Retired NonZero Ref", { portfolio: "Retired NonZero Ref" }),
      accountOf(5, "No FX Ref", { portfolio: "No FX Ref" }),
      accountOf(6, "Shared NonZero Ref", { portfolio: "Shared NonZero Ref" }),
      accountOf(7, "Zero Retired Ref", { portfolio: "Zero Retired Ref" }),
      accountOf(8, "Zero Active Ref", { portfolio: "Zero Active Ref" }),
      accountOf(9, "Sub-pound Negative", { portfolio: "Sub-pound Negative" }),
      accountOf(10, "Foreign Ref", { portfolio: "Foreign Ref" }),
      accountOf(11, "Standalone GBP", {
        growth: { kind: "fixed", rate: 0.04 },
        kind: "cash",
        portfolio: "Standalone GBP",
      }),
      accountOf(12, "Standalone USD", {
        growth: { kind: "fixed", rate: 0.03 },
        kind: "cash",
        portfolio: "Standalone USD",
      }),
      accountOf(13, "Standalone No FX", {
        growth: { kind: "fixed", rate: 0 },
        kind: "cash",
        portfolio: "Standalone No FX",
      }),
      accountOf(14, "Standalone Negative", {
        growth: { kind: "fixed", rate: 0 },
        kind: "cash",
        portfolio: "Standalone Negative",
      }),
      accountOf(15, "Empty Sec With Cash", {
        portfolio: "Empty Sec With Cash",
      }),
      accountOf(16, "Overdrawn Shared Ref", {
        portfolio: "Overdrawn Shared Ref",
      }),
      accountOf(17, "Net Zero Offset", { portfolio: "Net Zero Offset" }),
      accountOf(18, "Zero Shared Ref", { portfolio: "Zero Shared Ref" }),
    ];

    const feed = feedOf({
      cash: [
        cashOf("c-gbp", "Standalone GBP", {
          balance: 4500.4,
          balanceGbp: 4500.4,
          lastTransactionDate: "2026-08-15",
        }),
        cashOf("c-usd", "Standalone USD", {
          balance: 1000,
          balanceGbp: 800,
          currency: "USD",
          lastTransactionDate: null,
        }),
        cashOf("c-jpy", "Standalone No FX", {
          balance: 5000,
          balanceGbp: null,
          currency: "JPY",
        }),
        cashOf("c-neg", "Standalone Negative", {
          balance: -0.4,
          balanceGbp: -0.4,
          currency: "GBP",
        }),
        cashOf("c-blank", "   "),
      ],
      securities: [
        secOf("s-1", "Unpriced", { unpricedCount: 2 }),
        secOf("s-2", "Uncurrencied", { hasUncurrenciedHoldings: true }),
        secOf("s-3", "No FX", { noFxCurrencies: ["CHF", "JPY"] }),
        secOf("s-4", "Retired NonZero Ref", {
          referenceCash: {
            balance: 100,
            balanceGbp: 100,
            currency: "GBP",
            id: "c-ret",
            isRetired: true,
            isShared: false,
            lastTransactionDate: null,
            name: "Old Cash",
          },
        }),
        secOf("s-5", "No FX Ref", {
          referenceCash: {
            balance: 100,
            balanceGbp: null,
            currency: "CHF",
            id: "c-chf",
            isRetired: false,
            isShared: false,
            lastTransactionDate: null,
            name: "Swiss Cash",
          },
        }),
        secOf("s-6", "Shared NonZero Ref", {
          marketValueGbp: 10_000,
          referenceCash: {
            balance: 500,
            balanceGbp: null,
            currency: "USD",
            id: "c-shared",
            isRetired: false,
            isShared: true,
            lastTransactionDate: "2026-10-01",
            name: "Shared USD",
          },
        }),
        secOf("s-7", "Zero Retired Ref", {
          marketValueGbp: 3000,
          referenceCash: {
            balance: 0,
            balanceGbp: 0,
            currency: "GBP",
            id: "c-zero-ret",
            isRetired: true,
            isShared: false,
            lastTransactionDate: "2026-10-02",
            name: "Closed Zero",
          },
        }),
        secOf("s-8", "Zero Active Ref", {
          marketValueGbp: 3000,
          referenceCash: {
            balance: 0,
            balanceGbp: 0,
            currency: "GBP",
            id: "c-zero-act",
            isRetired: false,
            isShared: false,
            lastTransactionDate: "2026-10-02",
            name: "Active Zero",
          },
        }),
        secOf("s-9", "Sub-pound Negative", {
          holdingsCount: 0,
          marketValueGbp: 0,
          oldestQuoteDate: null,
          referenceCash: {
            balance: -0.4,
            balanceGbp: -0.4,
            currency: "GBP",
            id: "c-od",
            isRetired: false,
            isShared: false,
            lastTransactionDate: null,
            name: "Overdraft",
          },
        }),
        secOf("s-10", "Foreign Ref", {
          marketValueGbp: 2000,
          referenceCash: {
            balance: 100,
            balanceGbp: 80,
            currency: "USD",
            id: "c-usd-ref",
            isRetired: false,
            isShared: false,
            lastTransactionDate: null,
            name: "USD Settlement",
          },
        }),
        secOf("s-15", "Empty Sec With Cash", {
          holdingsCount: 0,
          lastTransactionDate: null,
          marketValueGbp: 0,
          oldestQuoteDate: null,
          referenceCash: {
            balance: 500,
            balanceGbp: 500,
            currency: "GBP",
            id: "c-empty-sec",
            isRetired: false,
            isShared: false,
            lastTransactionDate: "2026-09-10",
            name: "Empty Sec Cash",
          },
        }),
        secOf("s-16", "Overdrawn Shared Ref", {
          marketValueGbp: 4000,
          referenceCash: {
            balance: -250,
            balanceGbp: null,
            currency: "USD",
            id: "c-od-shared",
            isRetired: false,
            isShared: true,
            lastTransactionDate: "2026-10-01",
            name: "Shared USD Overdraft",
          },
        }),
        secOf("s-17", "Net Zero Offset", {
          marketValueGbp: 250,
          referenceCash: {
            balance: -250,
            balanceGbp: -250,
            currency: "GBP",
            id: "c-net-zero",
            isRetired: false,
            isShared: false,
            lastTransactionDate: null,
            name: "Offset Cash",
          },
        }),
        secOf("s-18", "Zero Shared Ref", {
          marketValueGbp: 3000,
          referenceCash: {
            balance: 0,
            balanceGbp: 0,
            currency: "GBP",
            id: "c-zero-shared",
            isRetired: false,
            isShared: true,
            lastTransactionDate: "2026-10-02",
            name: "Shared Zero",
          },
        }),
      ],
    });

    const resolved = portfolioBalancesFor(accounts, feed);
    expect(resolved?.byAccountId[1]).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Unpriced",
      reason: "2 holdings unpriced",
    });
    expect(resolved?.byAccountId[2]).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Uncurrencied",
      reason: "A holding has no quote currency",
    });
    expect(resolved?.byAccountId[3]).toStrictEqual({
      kind: "incomplete",
      portfolioName: "No FX",
      reason: "No GBP rate for CHF and JPY",
    });
    expect(resolved?.byAccountId[4]).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Retired NonZero Ref",
      reason: "Reference cash account is retired with a non-zero balance",
    });
    expect(resolved?.byAccountId[5]).toStrictEqual({
      kind: "incomplete",
      portfolioName: "No FX Ref",
      reason: "No GBP rate for CHF reference cash",
    });
    expect(resolved?.byAccountId[6]).toMatchObject({
      balance: 10_000,
      kind: "ready",
      lastTransactionDate: "2026-09-20",
      warnings: ["Excludes shared reference cash (US$500.00)"],
    });
    expect(resolved?.byAccountId[7]).toMatchObject({
      balance: 3000,
      kind: "ready",
      lastTransactionDate: "2026-09-20",
      warnings: [],
    });
    expect(resolved?.byAccountId[8]).toMatchObject({
      balance: 3000,
      kind: "ready",
      lastTransactionDate: "2026-10-02",
      warnings: [],
    });
    expect(resolved?.byAccountId[9]).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Sub-pound Negative",
      reason: "Balance is negative (−£0.40)",
    });
    expect(resolved?.byAccountId[10]).toMatchObject({
      balance: 2080,
      breakdown: "£2,000 + £80 cash",
      fxNote: "Latest transaction FX rate",
      kind: "ready",
    });
    expect(resolved?.byAccountId[11]).toStrictEqual({
      balance: 4500,
      hasHoldings: false,
      kind: "ready",
      lastTransactionDate: "2026-08-15",
      oldestQuoteDate: null,
      portfolioName: "Standalone GBP",
      warnings: [],
    });
    expect(resolved?.byAccountId[12]).toStrictEqual({
      balance: 800,
      fxNote: "Latest transaction FX rate",
      hasHoldings: false,
      kind: "ready",
      lastTransactionDate: null,
      oldestQuoteDate: null,
      portfolioName: "Standalone USD",
      warnings: [],
    });
    expect(resolved?.byAccountId[13]).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Standalone No FX",
      reason: "No GBP rate for JPY",
    });
    expect(resolved?.byAccountId[14]).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Standalone Negative",
      reason: "Balance is negative (−£0.40)",
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 15), { asOf: due, due }),
    ).toStrictEqual({
      balance: 500,
      canGroupPrefill: true,
      info: ["£0 + £500 cash", "Last transaction 10 Sep 2026"],
      kind: "ready",
      portfolioName: "Empty Sec With Cash",
      warnings: [],
    });
    expect(resolved?.byAccountId[16]).toMatchObject({
      balance: 4000,
      kind: "ready",
      warnings: ["Excludes shared reference cash (−US$250.00)"],
    });
    expect(resolved?.byAccountId[17]).toMatchObject({
      balance: 0,
      breakdown: "£250 − £250 cash",
      kind: "ready",
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 18), { asOf: due, due }),
    ).toMatchObject({
      balance: 3000,
      canGroupPrefill: true,
      kind: "ready",
      warnings: [],
    });
  });

  it("handles collisions, duplicate Exactis links, retired/paired/missing accounts, and evaluates freshness/post-cut/historical states", () => {
    const accounts: readonly Account[] = [
      accountOf(1, "Dup Link A", { portfolio: "Shared Target" }),
      accountOf(2, "Dup Link B", { portfolio: "Shared Target" }),
      accountOf(3, "Dup Cash A", { kind: "cash", portfolio: "Dup Cash" }),
      accountOf(4, "Dup Cash B", { kind: "cash", portfolio: "Dup Cash" }),
      accountOf(5, "Colliding Name", { portfolio: "Colliding" }),
      accountOf(6, "Paired Cash", { portfolio: "Ref Cash" }),
      accountOf(7, "Retired Link", { portfolio: "Retired Sec" }),
      accountOf(8, "Missing Link", { portfolio: "Unknown" }),
      accountOf(9, "Stale Holding", { portfolio: "Stale Holding" }),
      accountOf(10, "Undated Holding", { portfolio: "Undated Holding" }),
      accountOf(11, "Post-Cut Cash", {
        kind: "cash",
        portfolio: "Post-Cut Cash",
      }),
      accountOf(12, "Empty Cash", { kind: "cash", portfolio: "Empty Cash" }),
      accountOf(13, "Normal Cash", { kind: "cash", portfolio: "Normal Cash" }),
      accountOf(14, "Cash Vs Retired Held", {
        kind: "cash",
        portfolio: "Legacy Pot",
      }),
      accountOf(15, "Cash Vs Retired Empty", {
        kind: "cash",
        portfolio: "Closed Empty Pot",
      }),
    ];

    const feed = feedOf({
      cash: [
        cashOf("c-dup", "Dup Cash"),
        cashOf("c-col", "Colliding"),
        cashOf("c-ref-1", "Ref Cash", { referencedBy: ["Shared Target"] }),
        cashOf("c-ref-2", " Ref Cash ", {
          referencedBy: ["Shared Target", "Second ISA"],
        }),
        cashOf("c-post", "Post-Cut Cash", {
          balance: 2000,
          balanceGbp: 2000,
          lastTransactionDate: "2026-10-01",
        }),
        cashOf("c-empty", "Empty Cash", {
          balance: 0,
          balanceGbp: 0,
          lastTransactionDate: null,
        }),
        cashOf("c-normal", "Normal Cash", {
          balance: 1500,
          balanceGbp: 1500,
          lastTransactionDate: "2026-08-15",
        }),
        cashOf("c-ret", "Retired Cash", { isRetired: true }),
        cashOf("c-legacy", "Legacy Pot", { balance: 900, balanceGbp: 900 }),
        cashOf("c-closed-empty", "Closed Empty Pot", {
          balance: 700,
          balanceGbp: 700,
        }),
      ],
      securities: [
        secOf("s-shared", "Shared Target", { foreignCurrencies: ["USD"] }),
        secOf("s-col", "Colliding"),
        secOf("s-ret", "Retired Sec", { isRetired: true }),
        secOf("s-legacy-ret", "Legacy Pot", {
          holdingsCount: 1,
          isRetired: true,
        }),
        secOf("s-empty-ret", "Closed Empty Pot", {
          holdingsCount: 0,
          isRetired: true,
        }),
        secOf("s-stale", "Stale Holding", {
          lastTransactionDate: "2026-09-28",
          oldestQuoteDate: "2026-09-23",
        }),
        secOf("s-undated", "Undated Holding", { oldestQuoteDate: null }),
      ],
    });

    const resolved = portfolioBalancesFor(accounts, feed);

    // Duplicate Exactis links warn on both accounts (securities & standalone cash).
    const dupSec = evaluatePrefillForMonth(entryOf(resolved, 1), {
      asOf: due,
      due,
    });
    expect(dupSec).toStrictEqual({
      balance: 25_000,
      canGroupPrefill: false,
      info: ["Latest transaction FX rate"],
      kind: "ready",
      portfolioName: "Shared Target",
      warnings: ["Also linked to another account"],
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 3), { asOf: due, due }),
    ).toMatchObject({
      canGroupPrefill: false,
      kind: "ready",
      warnings: ["Also linked to another account"],
    });

    // Colliding, merged paired-cash, retired, and missing links are incomplete.
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 5), { asOf: due, due }),
    ).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Colliding",
      reason: "Multiple Portfolio accounts share this name",
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 6), { asOf: due, due }),
    ).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Ref Cash",
      reason: "Paired as reference cash for Shared Target and Second ISA",
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 7), { asOf: due, due }),
    ).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Retired Sec",
      reason: "Retired",
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 8), { asOf: due, due }),
    ).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Unknown",
      reason: "Not found",
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 14), { asOf: due, due }),
    ).toStrictEqual({
      kind: "incomplete",
      portfolioName: "Legacy Pot",
      reason: "Multiple Portfolio accounts share this name",
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 15), { asOf: due, due }),
    ).toMatchObject({ balance: 700, canGroupPrefill: true, kind: "ready" });

    // Post-cut + stale quote warnings on investment account.
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 9), { asOf: due, due }),
    ).toStrictEqual({
      balance: 25_000,
      canGroupPrefill: false,
      info: [],
      kind: "ready",
      portfolioName: "Stale Holding",
      warnings: [
        "Includes transactions after 25 Sep 2026 (last 28 Sep 2026)",
        "Oldest quote 23 Sep 2026",
      ],
    });

    // Undated quote warning on investment account.
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 10), { asOf: due, due }),
    ).toMatchObject({
      canGroupPrefill: false,
      kind: "ready",
      warnings: ["Quote undated"],
    });

    // Cash accounts: post-cut warns without duplicating Last transaction; quiet & empty show neutral info and stay group-prefillable.
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 11), { asOf: due, due }),
    ).toStrictEqual({
      balance: 2000,
      canGroupPrefill: false,
      info: [],
      kind: "ready",
      portfolioName: "Post-Cut Cash",
      warnings: ["Includes transactions after 25 Sep 2026 (last 1 Oct 2026)"],
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 12), { asOf: due, due }),
    ).toStrictEqual({
      balance: 0,
      canGroupPrefill: true,
      info: ["No transactions"],
      kind: "ready",
      portfolioName: "Empty Cash",
      warnings: [],
    });
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 13), { asOf: due, due }),
    ).toStrictEqual({
      balance: 1500,
      canGroupPrefill: true,
      info: ["Last transaction 15 Aug 2026"],
      kind: "ready",
      portfolioName: "Normal Cash",
      warnings: [],
    });

    // Historical month returns kind: "historical".
    expect(
      evaluatePrefillForMonth(entryOf(resolved, 13), {
        asOf: { month: 7, year: 2026 },
        due,
      }),
    ).toStrictEqual({
      kind: "historical",
      reason: "Portfolio holds current balances, not 25 Aug 2026's",
    });
  });
});
