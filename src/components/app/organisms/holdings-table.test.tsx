import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { HoldingRow } from "@/data/portfolio";

import { HoldingsTable } from "./holdings-table";

const valuedRow: HoldingRow = {
  accountCount: 2,
  holding: {
    category: "Global equity",
    currency: "GBX",
    gbpRate: 0.01,
    id: "sec-1",
    isin: "GB00TEST0001",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 214.015,
    latestPriceDate: "2026-09-22",
    name: "Global Equity Index",
    note: "Core holding",
    shares: 1000,
    sharesByAccount: [
      { portfolioId: "p1", shares: 600 },
      { portfolioId: "p2", shares: 400 },
    ],
    ticker: "GEIDX",
    transactionCount: 2,
  },
  marketValueGbp: 2140.15,
  share: 1,
  shares: 1000,
  status: "valued",
};

const unpricedRow: HoldingRow = {
  accountCount: 1,
  holding: {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-2",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: null,
    latestPriceDate: null,
    name: "Private Equity Fund",
    shares: 4.5,
    sharesByAccount: [{ portfolioId: "p1", shares: 4.5 }],
    transactionCount: 1,
  },
  marketValueGbp: null,
  share: 0,
  shares: 4.5,
  status: "unpriced",
};

const noFxRow: HoldingRow = {
  accountCount: 1,
  holding: {
    currency: "JPY",
    gbpRate: null,
    id: "sec-3",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 2500,
    latestPriceDate: null,
    name: "Tokyo Tracker",
    shares: 3,
    sharesByAccount: [{ portfolioId: "p1", shares: 3 }],
    transactionCount: 1,
  },
  marketValueGbp: null,
  share: 0,
  shares: 3,
  status: "no-fx",
};

const zeroRow: HoldingRow = {
  accountCount: 0,
  holding: {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-4",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 50,
    latestPriceDate: null,
    name: "Dormant Gilts",
    shares: 0,
    sharesByAccount: [],
    transactionCount: 0,
  },
  marketValueGbp: 0,
  share: 0,
  shares: 0,
  status: "zero",
};

const retiredSingleShareRow: HoldingRow = {
  accountCount: 1,
  holding: {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-5",
    isRetired: true,
    isSplitCategory: false,
    latestPrice: 75,
    latestPriceDate: null,
    name: "Legacy Income Trust",
    shares: 1,
    sharesByAccount: [{ portfolioId: "p1", shares: 1 }],
    transactionCount: 1,
  },
  marketValueGbp: 75,
  share: 0.0339,
  shares: 1,
  status: "valued",
};

describe("HoldingsTable", () => {
  it("renders security metadata, GBX pence prices with quote dates, sterling values, shares, and exception or retired badges", () => {
    render(
      <HoldingsTable
        rows={[valuedRow, unpricedRow, noFxRow, zeroRow, retiredSingleShareRow]}
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((head) => head.textContent),
    ).toStrictEqual(["Security", "Shares", "Price", "Value", "Share"]);

    const [, first, second, third, fourth, fifth] = screen.getAllByRole("row");

    expect(first).toHaveTextContent("Global Equity Index");
    expect(first).toHaveTextContent(
      "GB00TEST0001 · GEIDX · Global equity · Across 2 accounts · Core holding",
    );
    expect(first).toHaveTextContent("1,000");
    expect(first).toHaveTextContent("214.015p");
    expect(first).toHaveTextContent("22 Sep 2026");
    expect(first).toHaveTextContent("£2,140.15");
    expect(first).toHaveTextContent("100.00%");
    expect(first).not.toHaveTextContent("Retired");
    expect(first).not.toHaveTextContent("Unpriced");
    expect(first).not.toHaveTextContent("No FX rate");

    expect(second).toHaveTextContent("Private Equity Fund");
    expect(second).toHaveTextContent("4.5 shares");
    expect(second).toHaveTextContent("Unpriced");

    expect(third).toHaveTextContent("Tokyo Tracker");
    expect(third).toHaveTextContent("No FX rate");

    expect(fourth).toHaveTextContent("Dormant Gilts");
    expect(fourth).toHaveTextContent("£0.00");
    expect(fourth).toHaveTextContent("0.00%");

    expect(fifth).toHaveTextContent("Legacy Income Trust");
    expect(fifth).toHaveTextContent("1 share @ £75.00 · 3.39%");
    expect(fifth).toHaveTextContent("Retired");
    expect(screen.getAllByText("Retired")[1]).toHaveAttribute(
      "data-variant",
      "outline",
    );
  });
});
