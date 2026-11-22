import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  CashAccount,
  Holding,
  PortfolioTransaction,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";

import { PortfolioTransactions } from "./portfolio-transactions";

const securitiesAccounts: readonly SecuritiesAccount[] = [
  {
    holdingsCount: 1,
    id: "port-isa",
    isRetired: false,
    marketValue: 1250,
    name: "Northstar ISA",
    referenceAccountId: "cash-isa",
  },
  {
    holdingsCount: 0,
    id: "port-old",
    isRetired: true,
    marketValue: 0,
    name: "Closed Dealing",
  },
];

const cashAccounts: readonly CashAccount[] = [
  {
    balance: 750,
    balanceGbp: 750,
    currency: "GBP",
    id: "cash-isa",
    isRetired: false,
    name: "Northstar ISA Cash",
    transactionCount: 2,
  },
  {
    balance: 0,
    balanceGbp: 0,
    currency: "GBP",
    id: "cash-old",
    isRetired: true,
    name: "Closed Cash",
    transactionCount: 1,
  },
];

const holdings: readonly Holding[] = [
  {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-gilts",
    isRetired: false,
    latestPrice: 50,
    latestPriceDate: "2026-09-22",
    name: "UK Gilts Fund",
    shares: 4,
    sharesByAccount: [{ portfolioId: "port-isa", shares: 4 }],
  },
  {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-world",
    isRetired: false,
    latestPrice: 125,
    latestPriceDate: "2026-09-22",
    name: "Global Equity Index",
    shares: 10,
    sharesByAccount: [{ portfolioId: "port-isa", shares: 10 }],
  },
];

const sampleTransactions: readonly PortfolioTransaction[] = [
  {
    accountId: "cash-isa",
    accountName: "Northstar ISA Cash",
    amount: 1250,
    currency: "GBP",
    date: "2026-09-22",
    fees: 0,
    id: "tx-buy",
    portfolioId: "port-isa",
    portfolioName: "Northstar ISA",
    securityId: "sec-world",
    securityName: "Global Equity Index",
    shares: 10,
    taxes: 0,
    timestamp: 1_790_000_000,
    type: "purchase",
  },
  {
    accountId: "cash-isa",
    accountName: "Northstar ISA Cash",
    amount: 2000,
    currency: "GBP",
    date: "2026-09-20",
    fees: 0,
    id: "tx-dep",
    shares: 0,
    taxes: 0,
    timestamp: 1_789_900_000,
    type: "deposit",
  },
];

function manyTransactions(count: number): readonly PortfolioTransaction[] {
  return Array.from({ length: count }, (_, index) => ({
    accountId: "cash-isa",
    accountName: "Northstar ISA Cash",
    amount: 10 + index,
    currency: "GBP",
    date: "2026-09-20",
    fees: 0,
    id: `tx-${String(index)}`,
    shares: 0,
    taxes: 0,
    timestamp: 1_790_000_000 - index,
    type: "deposit",
  }));
}

describe("PortfolioTransactions", () => {
  it("renders filters, reports filter changes, shows Clear filters when active, and fires Add transaction", () => {
    const onAccountChange = vi.fn<(id: string) => void>();
    const onTypeChange = vi.fn<(type: "" | TransactionType) => void>();
    const onSecurityChange = vi.fn<(id: string) => void>();
    const onAddTransaction = vi.fn<() => void>();

    render(
      <PortfolioTransactions
        accountId="cash-isa"
        cashAccounts={cashAccounts}
        holdings={holdings}
        label="Sect. IX.iii"
        onAccountChange={onAccountChange}
        onAddTransaction={onAddTransaction}
        onSecurityChange={onSecurityChange}
        onTypeChange={onTypeChange}
        securitiesAccounts={securitiesAccounts}
        securityId="sec-world"
        transactions={sampleTransactions}
        type=""
      />,
    );

    expect(screen.getByText("1 transaction")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue(
      "sec-world",
    );
    expect(
      screen.getByRole("option", { name: "Closed Dealing (retired)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Closed Cash (retired)" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "port-isa" },
    });
    expect(onAccountChange).toHaveBeenCalledWith("port-isa");

    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "purchase" },
    });
    expect(onTypeChange).toHaveBeenCalledWith("purchase");

    fireEvent.change(screen.getByRole("combobox", { name: "Security" }), {
      target: { value: "sec-world" },
    });
    expect(onSecurityChange).toHaveBeenCalledWith("sec-world");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onAccountChange).toHaveBeenLastCalledWith("");
    expect(onTypeChange).toHaveBeenLastCalledWith("");
    expect(onSecurityChange).toHaveBeenLastCalledWith("");

    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(onAddTransaction).toHaveBeenCalledOnce();
  });

  it("paginates 50 rows at a time and resets paging when filters change", () => {
    const transactions = manyTransactions(65);
    const { rerender } = render(
      <PortfolioTransactions
        accountId=""
        cashAccounts={cashAccounts}
        holdings={holdings}
        label="Sect. IX.iii"
        onAccountChange={vi.fn<(id: string) => void>()}
        onAddTransaction={vi.fn<() => void>()}
        onSecurityChange={vi.fn<(id: string) => void>()}
        onTypeChange={vi.fn<(type: "" | TransactionType) => void>()}
        securitiesAccounts={securitiesAccounts}
        securityId=""
        transactions={transactions}
        type=""
      />,
    );

    expect(screen.getByText("Showing 1–50 of 65")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(51);

    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(screen.getByText("65 transactions")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(66);

    rerender(
      <PortfolioTransactions
        accountId="cash-isa"
        cashAccounts={cashAccounts}
        holdings={holdings}
        label="Sect. IX.iii"
        onAccountChange={vi.fn<(id: string) => void>()}
        onAddTransaction={vi.fn<() => void>()}
        onSecurityChange={vi.fn<(id: string) => void>()}
        onTypeChange={vi.fn<(type: "" | TransactionType) => void>()}
        securitiesAccounts={securitiesAccounts}
        securityId=""
        transactions={transactions}
        type=""
      />,
    );
    expect(screen.getByText("Showing 1–50 of 65")).toBeInTheDocument();
  });

  it("renders contextual empty states for empty files and unmatched filters, and handles stale filter ids or read-only mode", () => {
    const onAccountChange = vi.fn<(id: string) => void>();
    const onTypeChange = vi.fn<(type: "" | TransactionType) => void>();
    const onSecurityChange = vi.fn<(id: string) => void>();

    const { rerender } = render(
      <>
        <p id="scenario-note">Scenario active</p>
        <PortfolioTransactions
          accountId=""
          cashAccounts={[]}
          holdings={[]}
          isReadOnly
          label="Sect. IX.iii"
          onAccountChange={onAccountChange}
          onAddTransaction={vi.fn<() => void>()}
          onSecurityChange={onSecurityChange}
          onTypeChange={onTypeChange}
          readOnlyId="scenario-note"
          securitiesAccounts={[]}
          securityId=""
          transactions={[]}
          type=""
        />
      </>,
    );

    expect(
      screen.getByText("No transactions in this file"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Account" }),
    ).not.toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: "Add transaction" });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAccessibleDescription("Scenario active");

    rerender(
      <PortfolioTransactions
        accountId="missing-account"
        cashAccounts={[]}
        holdings={holdings}
        label="Sect. IX.iii"
        onAccountChange={onAccountChange}
        onAddTransaction={vi.fn<() => void>()}
        onSecurityChange={onSecurityChange}
        onTypeChange={onTypeChange}
        securitiesAccounts={[]}
        securityId="missing-security"
        transactions={sampleTransactions}
        type="dividend"
      />,
    );

    expect(
      screen.getByText("No transactions match these filters"),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Account" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onTypeChange).toHaveBeenCalledWith("");
  });
});
