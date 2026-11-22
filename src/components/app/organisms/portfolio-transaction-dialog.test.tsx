import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CashAccount, Holding, SecuritiesAccount } from "@/data/portfolio";

import { commit } from "@/test/dom";

import type { NewPortfolioTransaction } from "./portfolio-transaction-dialog";

import { PortfolioTransactionDialog } from "./portfolio-transaction-dialog";

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
    id: "port-gia",
    isRetired: false,
    marketValue: 0,
    name: "Dealing Account",
    referenceAccountId: "cash-usd",
  },
  {
    holdingsCount: 0,
    id: "port-old",
    isRetired: true,
    marketValue: 0,
    name: "Closed Account",
  },
];

const cashAccounts: readonly CashAccount[] = [
  {
    balance: 200,
    balanceGbp: 200,
    currency: "GBP",
    id: "cash-reserve",
    isRetired: false,
    name: "Reserve Cash",
    transactionCount: 1,
  },
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
    balance: 100,
    balanceGbp: 75,
    currency: "USD",
    id: "cash-usd",
    isRetired: false,
    name: "Dollar Cash",
    transactionCount: 1,
  },
];

const holdings: readonly Holding[] = [
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
  {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-gilts",
    isRetired: false,
    latestPrice: 50,
    latestPriceDate: "2026-09-22",
    name: "UK Gilts Fund",
    shares: 0,
    sharesByAccount: [],
  },
  {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-retired",
    isRetired: true,
    latestPrice: 50,
    latestPriceDate: "2026-09-22",
    name: "Delisted Trust",
    shares: 0,
    sharesByAccount: [],
  },
];

describe("PortfolioTransactionDialog", () => {
  it("auto-selects a securities account's reference cash account, shows cash currencies, excludes retired securities, validates dates, and saves a purchase", () => {
    const onAdd = vi.fn<(draft: NewPortfolioTransaction) => void>();
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Purchase · Global Equity Index" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-isa",
    );
    expect(
      screen.getByRole("option", { name: "Northstar ISA Cash (GBP)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Dollar Cash (USD)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Delisted Trust" }),
    ).not.toBeInTheDocument();

    // Switching securities account auto-defaults to its reference USD cash account.
    fireEvent.change(
      screen.getByRole("combobox", { name: "Securities account" }),
      { target: { value: "port-gia" } },
    );
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-usd",
    );

    const add = screen.getByRole("button", { name: "Add preview" });
    expect(add).toBeDisabled();

    // Empty, five-digit-year, and invalid calendar dates keep save disabled.
    commit(screen.getByRole("textbox", { name: "Shares" }), "10");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "500");
    expect(add).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "20260-09-25" },
    });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-13-45" },
    });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-24" },
    });

    commit(screen.getByRole("textbox", { name: "Fees" }), "1.5");
    commit(screen.getByRole("textbox", { name: "Taxes" }), "6.25");
    commit(screen.getByRole("textbox", { name: "Fees" }), "");
    commit(screen.getByRole("textbox", { name: "Fees" }), "2");
    commit(screen.getByRole("textbox", { name: "Taxes" }), "");
    commit(screen.getByRole("textbox", { name: "Taxes" }), "3");
    commit(screen.getByRole("textbox", { name: "Shares" }), "");
    expect(add).toBeDisabled();
    commit(screen.getByRole("textbox", { name: "Shares" }), "4.5");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "");
    expect(add).toBeDisabled();
    commit(screen.getByRole("textbox", { name: "Total paid" }), "500");
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "  Dollar buy  " },
    });

    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledExactlyOnceWith({
      accountId: "cash-usd",
      amount: 500,
      currency: "USD",
      date: "2026-09-24",
      fees: 2,
      note: "Dollar buy",
      portfolioId: "port-gia",
      securityId: "sec-world",
      shares: 4.5,
      taxes: 3,
      type: "purchase",
    });
  });

  it("adapts fields across sale, delivery, dividend, cash-only, and transfer types while guarding identical transfer accounts", () => {
    const onAdd = vi.fn<(draft: NewPortfolioTransaction) => void>();
    render(
      <PortfolioTransactionDialog
        baseCurrency="CHF"
        cashAccounts={cashAccounts}
        holdings={holdings}
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
      />,
    );

    const typeSelect = screen.getByRole("combobox", { name: "Type" });

    // Sale
    fireEvent.change(typeSelect, { target: { value: "sale" } });
    expect(
      screen.getByRole("textbox", { name: "Net proceeds" }),
    ).toBeInTheDocument();

    // Inbound and outbound delivery with currency select (CHF base falls back to GBP).
    fireEvent.change(typeSelect, { target: { value: "inbound-delivery" } });
    const currencySelect = screen.getByRole("combobox", { name: "Currency" });
    expect(currencySelect).toHaveValue("GBP");
    fireEvent.change(currencySelect, { target: { value: "EUR" } });
    expect(
      screen.getByRole("textbox", { name: "Total value" }),
    ).toHaveAccessibleDescription("Including fees and taxes");
    commit(screen.getByRole("textbox", { name: "Total value" }), "250");
    commit(screen.getByRole("textbox", { name: "Shares" }), "3");

    fireEvent.change(typeSelect, { target: { value: "outbound-delivery" } });
    expect(
      screen.getByRole("textbox", { name: "Total value" }),
    ).toHaveAccessibleDescription("After fees and taxes");
    // Switching type clears stale figures so Add preview stays disabled until re-entered.
    expect(screen.getByRole("textbox", { name: "Total value" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("textbox", { name: "Shares" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add preview" })).toBeDisabled();

    // Pick a cash account that matches default otherAccountId, then switch into
    // cash-transfer to verify automatic distinct-destination selection.
    fireEvent.change(typeSelect, { target: { value: "dividend" } });
    expect(
      screen.getByRole("heading", { name: "Dividend · Global Equity Index" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Net received" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-reserve" },
    });

    // Cash transfer auto-picks a distinct destination, then guards identical choice.
    fireEvent.change(typeSelect, { target: { value: "cash-transfer" } });
    expect(
      screen.getByRole("heading", { name: "New cash transfer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "To cash account" }),
    ).toHaveValue("cash-isa");
    commit(screen.getByRole("textbox", { name: "Amount" }), "150");
    fireEvent.change(
      screen.getByRole("combobox", { name: "To cash account" }),
      { target: { value: "cash-reserve" } },
    );
    expect(
      screen.getByRole("combobox", { name: "To cash account" }),
    ).toHaveAccessibleDescription("Choose a different destination account");
    expect(screen.getByRole("button", { name: "Add preview" })).toBeDisabled();

    fireEvent.change(
      screen.getByRole("combobox", { name: "To cash account" }),
      { target: { value: "cash-isa" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(onAdd).toHaveBeenLastCalledWith({
      accountId: "cash-reserve",
      amount: 150,
      currency: "GBP",
      date: "2026-09-25",
      fees: 0,
      otherAccountId: "cash-isa",
      shares: 0,
      taxes: 0,
      type: "cash-transfer",
    });

    // Switch portfolio to match default otherPortfolioId before entering security-transfer
    // so distinct-destination selection runs for securities transfers too.
    fireEvent.change(typeSelect, { target: { value: "purchase" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Securities account" }),
      { target: { value: "port-gia" } },
    );

    // Security transfer with optional valuation entered then cleared (0) and destination guard.
    fireEvent.change(typeSelect, { target: { value: "security-transfer" } });
    expect(
      screen.getByRole("combobox", { name: "To securities account" }),
    ).toHaveValue("port-isa");
    commit(screen.getByRole("textbox", { name: "Valuation" }), "100");
    commit(screen.getByRole("textbox", { name: "Valuation" }), "");
    commit(screen.getByRole("textbox", { name: "Shares" }), "2");
    fireEvent.change(
      screen.getByRole("combobox", { name: "To securities account" }),
      { target: { value: "port-gia" } },
    );
    expect(
      screen.getByRole("combobox", { name: "To securities account" }),
    ).toHaveAccessibleDescription("Choose a different destination account");
    expect(screen.getByRole("button", { name: "Add preview" })).toBeDisabled();

    fireEvent.change(
      screen.getByRole("combobox", { name: "To securities account" }),
      { target: { value: "port-isa" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(onAdd).toHaveBeenLastCalledWith({
      amount: 0,
      currency: "CHF",
      date: "2026-09-25",
      fees: 0,
      otherPortfolioId: "port-isa",
      portfolioId: "port-gia",
      securityId: "sec-world",
      shares: 2,
      taxes: 0,
      type: "security-transfer",
    });

    // Deposit strips security, shares, fees and taxes.
    fireEvent.change(typeSelect, { target: { value: "deposit" } });
    expect(
      screen.getByRole("heading", { name: "New deposit" }),
    ).toBeInTheDocument();
    commit(screen.getByRole("textbox", { name: "Amount" }), "400");
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(onAdd).toHaveBeenLastCalledWith({
      accountId: "cash-usd",
      amount: 400,
      currency: "USD",
      date: "2026-09-25",
      fees: 0,
      shares: 0,
      taxes: 0,
      type: "deposit",
    });
  });

  it("supports initialDraft pre-population and disables selects with explanatory hints when catalogues are empty", () => {
    const onAdd = vi.fn<(draft: NewPortfolioTransaction) => void>();
    const { rerender } = render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{
          accountId: "cash-reserve",
          amount: 250,
          currency: "USD",
          date: "2026-09-20",
          fees: 0,
          note: "From draft",
          portfolioId: "port-isa",
          securityId: "sec-gilts",
          shares: 5,
          taxes: 0,
          type: "inbound-delivery",
        }}
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Inbound delivery · UK Gilts Fund" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(onAdd).toHaveBeenCalledExactlyOnceWith({
      amount: 250,
      currency: "USD",
      date: "2026-09-20",
      fees: 0,
      note: "From draft",
      portfolioId: "port-isa",
      securityId: "sec-gilts",
      shares: 5,
      taxes: 0,
      type: "inbound-delivery",
    });

    // Empty catalogues disable selects and keep Add preview locked across every layout.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={[]}
        holdings={[]}
        key="empty"
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
        securitiesAccounts={[]}
        today="2026-09-25"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "New purchase" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Cash account" }),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Security" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add preview" })).toBeDisabled();

    const typeSelect = screen.getByRole("combobox", { name: "Type" });
    fireEvent.change(typeSelect, { target: { value: "inbound-delivery" } });
    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveAccessibleDescription("Add a securities account first");

    fireEvent.change(typeSelect, { target: { value: "security-transfer" } });
    expect(
      screen.getByRole("combobox", { name: "From securities account" }),
    ).toHaveAccessibleDescription("Add at least two securities accounts first");
    expect(
      screen.getByRole("combobox", { name: "To securities account" }),
    ).toHaveAccessibleDescription("Add at least two securities accounts first");

    fireEvent.change(typeSelect, { target: { value: "cash-transfer" } });
    expect(
      screen.getByRole("combobox", { name: "From cash account" }),
    ).toHaveAccessibleDescription("Add at least two cash accounts first");
    expect(
      screen.getByRole("combobox", { name: "To cash account" }),
    ).toHaveAccessibleDescription("Add at least two cash accounts first");

    fireEvent.change(typeSelect, { target: { value: "dividend" } });
    expect(
      screen.getByRole("combobox", { name: "Cash account" }),
    ).toHaveAccessibleDescription("Add a cash account first");
    expect(
      screen.getByRole("combobox", { name: "Security" }),
    ).toHaveAccessibleDescription("Add a security first");

    fireEvent.change(typeSelect, { target: { value: "deposit" } });
    expect(
      screen.getByRole("combobox", { name: "Cash account" }),
    ).toHaveAccessibleDescription("Add a cash account first");
  });

  it("handles a securities account without an active reference cash account cleanly", () => {
    const unlinkedSecurities: readonly SecuritiesAccount[] = [
      {
        holdingsCount: 0,
        id: "port-unlinked",
        isRetired: false,
        marketValue: 0,
        name: "Unlinked Dealing",
      },
      {
        holdingsCount: 0,
        id: "port-second",
        isRetired: false,
        marketValue: 0,
        name: "Second Dealing",
      },
    ];
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        onAdd={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        onDismiss={vi.fn<() => void>()}
        securitiesAccounts={unlinkedSecurities}
        today="2026-09-25"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-reserve",
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Securities account" }),
      { target: { value: "port-second" } },
    );
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-reserve",
    );
  });

  it("falls back to active defaults when initialDraft references retired or unknown ids", () => {
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{
          accountId: "missing-cash",
          otherAccountId: "missing-other-cash",
          otherPortfolioId: "port-old",
          portfolioId: "port-old",
          securityId: "sec-retired",
        }}
        onAdd={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        onDismiss={vi.fn<() => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveValue("port-isa");
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-isa",
    );
    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue(
      "sec-world",
    );
  });
});
