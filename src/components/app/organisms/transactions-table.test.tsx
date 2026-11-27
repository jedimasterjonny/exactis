import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PortfolioTransaction } from "@/data/portfolio";

import { TransactionsTable } from "./transactions-table";

const rows: readonly PortfolioTransaction[] = [
  {
    accountId: "cash-isa",
    accountName: "Northstar ISA Cash",
    amount: 1257.75,
    currency: "GBP",
    date: "2026-09-22",
    fees: 1.5,
    id: "tx-buy",
    note: "Monthly invest",
    portfolioId: "port-isa",
    portfolioName: "Northstar ISA",
    securityId: "sec-world",
    securityName: "Global Equity Index",
    shares: 10,
    taxes: 6.25,
    timestamp: 1_790_000_000,
    type: "purchase",
  },
  {
    accountId: "cash-isa",
    accountName: "Northstar ISA Cash",
    amount: 42.18,
    currency: "GBP",
    date: "2026-09-20",
    fees: 0,
    id: "tx-div",
    securityId: "sec-world",
    securityName: "Global Equity Index",
    shares: 0,
    taxes: 2,
    timestamp: 1_789_900_000,
    type: "dividend",
  },
  {
    accountId: "cash-isa",
    accountName: "Northstar ISA Cash",
    amount: 12,
    currency: "GBP",
    date: "2026-09-19",
    fees: 0,
    id: "tx-interest",
    shares: 0,
    taxes: 3,
    timestamp: 1_789_850_000,
    type: "interest",
  },
  {
    accountId: "cash-isa",
    accountName: "Northstar ISA Cash",
    amount: 300,
    currency: "GBP",
    date: "2026-09-18",
    fees: 0,
    id: "tx-cash-move",
    otherAccountId: "cash-reserve",
    otherAccountName: "Reserve Cash",
    shares: 0,
    taxes: 0,
    timestamp: 1_789_800_000,
    type: "cash-transfer",
  },
  {
    amount: 0,
    currency: "GBP",
    date: "2026-09-15",
    fees: 0,
    id: "tx-sec-move",
    otherPortfolioId: "port-gia",
    otherPortfolioName: "Dealing Account",
    portfolioId: "port-isa",
    portfolioName: "Northstar ISA",
    securityId: "sec-world",
    securityName: "Global Equity Index",
    shares: 1,
    taxes: 0,
    timestamp: 1_789_700_000,
    type: "security-transfer",
  },
  {
    amount: 0,
    currency: "GBP",
    date: "2026-09-10",
    fees: 0,
    id: "tx-orphan",
    shares: 0,
    taxes: 0,
    timestamp: 1_789_600_000,
    type: "deposit",
  },
  {
    amount: 50,
    currency: "GBP",
    date: "2026-09-09",
    fees: 0,
    id: "tx-orphan-transfer",
    shares: 0,
    taxes: 0,
    timestamp: 1_789_500_000,
    type: "cash-transfer",
  },
];

describe("TransactionsTable", () => {
  it("renders dates, types, paired or arrowed accounts, securities, shares, signed amounts, fees/taxes, and notes", () => {
    render(<TransactionsTable transactions={rows} />);

    expect(
      screen.getAllByRole("columnheader").map((head) => head.textContent),
    ).toStrictEqual([
      "Date",
      "Type",
      "Account",
      "Security",
      "Shares",
      "Amount",
    ]);

    const [, first, second, third, fourth, fifth, sixth, seventh] =
      screen.getAllByRole("row");

    expect(first).toHaveTextContent("22 Sep 2026");
    expect(first).toHaveTextContent("Purchase · Global Equity Index");
    expect(first).toHaveTextContent("Northstar ISA · Northstar ISA Cash");
    expect(first).toHaveTextContent("10 shares");
    expect(first).toHaveTextContent("−£1,257.75");
    expect(first).toHaveTextContent("incl. £1.50 fee · £6.25 tax");
    expect(first).toHaveTextContent("Monthly invest");

    expect(second).toHaveTextContent("Dividend");
    expect(second).toHaveTextContent("+£42.18");
    expect(second).toHaveTextContent("after £2.00 tax");
    expect(screen.getAllByText("+£42.18")[1]).toHaveClass("text-positive");

    expect(third).toHaveTextContent("Interest");
    expect(third).toHaveTextContent("£3.00 tax");
    expect(third).not.toHaveTextContent("incl.");
    expect(third).not.toHaveTextContent("after");

    expect(fourth).toHaveTextContent("Northstar ISA Cash → Reserve Cash");
    expect(fourth).toHaveTextContent("£300.00");

    expect(fifth).toHaveTextContent("Northstar ISA → Dealing Account");
    expect(fifth).toHaveTextContent("1 share");
    expect(fifth).toHaveTextContent("£0.00");

    expect(sixth).toHaveTextContent("10 Sep 2026 · —");
    expect(seventh).toHaveTextContent("9 Sep 2026 · —");
  });

  it("renders genuine cross-currency FX details and suppresses trivial GBP/GBX pence pairs", () => {
    const fxRows: readonly PortfolioTransaction[] = [
      {
        accountId: "cash-isa",
        accountName: "Northstar ISA Cash",
        amount: 787.4,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        grossValue: {
          amount: 787.4,
          currency: "GBP",
          exchangeRate: 0.7874,
          fxAmount: 1000,
          fxCurrency: "USD",
        },
        id: "tx-fx-buy",
        portfolioId: "port-isa",
        portfolioName: "Northstar ISA",
        securityId: "sec-us",
        securityName: "US Index ETF",
        shares: 10,
        taxes: 0,
        timestamp: 1_790_200_000,
        type: "purchase",
      },
      {
        accountId: "cash-isa",
        accountName: "Northstar ISA Cash",
        amount: 20,
        currency: "GBP",
        date: "2026-09-24",
        fees: 0,
        grossValue: {
          amount: 20,
          currency: "GBP",
          fxAmount: 25,
          fxCurrency: "USD",
        },
        id: "tx-fx-div-no-rate",
        securityId: "sec-us",
        securityName: "US Index ETF",
        shares: 0,
        taxes: 0,
        timestamp: 1_790_150_000,
        type: "dividend",
      },
      {
        accountId: "cash-isa",
        accountName: "Northstar ISA Cash",
        amount: 1000,
        currency: "GBP",
        date: "2026-09-23",
        fees: 0,
        grossValue: {
          amount: 1000,
          currency: "GBP",
          exchangeRate: 0.7874,
          fxAmount: 1270,
          fxCurrency: "USD",
        },
        id: "tx-fx-transfer",
        otherAccountId: "cash-usd",
        otherAccountName: "Dollar Cash",
        shares: 0,
        taxes: 0,
        timestamp: 1_790_100_000,
        type: "cash-transfer",
      },
      {
        accountId: "cash-isa",
        accountName: "Northstar ISA Cash",
        amount: 120,
        currency: "GBP",
        date: "2026-09-22",
        fees: 0,
        grossValue: {
          amount: 120,
          currency: "GBP",
          exchangeRate: 0.01,
          fxAmount: 12_000,
          fxCurrency: "GBX",
        },
        id: "tx-gbp-gbx",
        portfolioId: "port-isa",
        portfolioName: "Northstar ISA",
        securityId: "sec-uk",
        securityName: "UK Index Fund",
        shares: 100,
        taxes: 0,
        timestamp: 1_790_050_000,
        type: "purchase",
      },
      {
        accountId: "cash-isa",
        accountName: "Northstar ISA Cash",
        amount: 12_000,
        currency: "GBX",
        date: "2026-09-21",
        fees: 0,
        grossValue: {
          amount: 12_000,
          currency: "GBX",
          exchangeRate: 100,
          fxAmount: 120,
          fxCurrency: "GBP",
        },
        id: "tx-gbx-gbp",
        portfolioId: "port-isa",
        portfolioName: "Northstar ISA",
        securityId: "sec-uk",
        securityName: "UK Index Fund",
        shares: 100,
        taxes: 0,
        timestamp: 1_790_000_000,
        type: "sale",
      },
    ];

    render(<TransactionsTable transactions={fxRows} />);

    const [, fxBuy, fxDiv, fxTransfer, gbpToGbx, gbxToGbp] =
      screen.getAllByRole("row");

    // Appears in both folded summary and unfolded Amount cell.
    expect(screen.getAllByText("US$1,000.00 @ 0.7874")).toHaveLength(2);
    expect(fxBuy).toHaveTextContent("US$1,000.00 @ 0.7874");

    expect(screen.getAllByText("US$25.00")).toHaveLength(2);
    expect(fxDiv).toHaveTextContent("US$25.00");

    expect(screen.getAllByText("→ US$1,270.00")).toHaveLength(2);
    expect(fxTransfer).toHaveTextContent("→ US$1,270.00");

    expect(gbpToGbx).not.toHaveTextContent("12,000");
    expect(gbpToGbx).not.toHaveTextContent("@");
    expect(gbxToGbp).not.toHaveTextContent("£120.00");
    expect(gbxToGbp).not.toHaveTextContent("@");
  });
});
