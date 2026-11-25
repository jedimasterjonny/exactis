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
});
