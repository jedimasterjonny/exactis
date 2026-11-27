import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  CashAccount,
  Holding,
  NewPortfolioTransaction,
  PortfolioTransaction,
  SecuritiesAccount,
} from "@/data/portfolio";

import {
  addPortfolioTransaction,
  editPortfolioTransaction,
} from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { commit } from "@/test/dom";

import { PortfolioTransactionDialog } from "./portfolio-transaction-dialog";

vi.mock("@/actions/portfolio", () => ({
  addPortfolioTransaction: vi.fn(),
  editPortfolioTransaction: vi.fn(),
}));

const securitiesAccounts: readonly SecuritiesAccount[] = [
  {
    holdingsCount: 1,
    id: "port-isa",
    isRetired: false,
    marketValue: 1250,
    name: "Northstar ISA",
    referenceAccountId: "cash-isa",
    transactionCount: 1,
  },
  {
    holdingsCount: 0,
    id: "port-gia",
    isRetired: false,
    marketValue: 0,
    name: "Dealing Account",
    referenceAccountId: "cash-usd",
    transactionCount: 0,
  },
  {
    holdingsCount: 0,
    id: "port-old",
    isRetired: true,
    marketValue: 0,
    name: "Closed Account",
    transactionCount: 0,
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
    isSplitCategory: false,
    latestPrice: 125,
    latestPriceDate: "2026-09-22",
    name: "Global Equity Index",
    shares: 10,
    sharesByAccount: [{ portfolioId: "port-isa", shares: 10 }],
    transactionCount: 1,
  },
  {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-gilts",
    isRetired: false,
    isSplitCategory: false,
    latestPrice: 50,
    latestPriceDate: "2026-09-22",
    name: "UK Gilts Fund",
    shares: 0,
    sharesByAccount: [],
    transactionCount: 0,
  },
  {
    currency: "GBP",
    gbpRate: 1,
    id: "sec-retired",
    isRetired: true,
    isSplitCategory: false,
    latestPrice: 50,
    latestPriceDate: "2026-09-22",
    name: "Delisted Trust",
    shares: 0,
    sharesByAccount: [],
    transactionCount: 0,
  },
];

describe("PortfolioTransactionDialog", () => {
  it("auto-selects reference cash, validates calendar dates and fee/tax bounds inline, and saves via live numeric changes", async () => {
    vi.mocked(addPortfolioTransaction).mockResolvedValue(
      saved({ id: "tx-new", savedOn: "2026-09-25", version: 2 }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioTransaction) => void>();
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("heading", { name: "Purchase · Global Equity Index" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-isa",
    );
    expect(
      screen.queryByRole("option", { name: "Delisted Trust" }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Securities account" }),
      { target: { value: "port-gia" } },
    );
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-usd",
    );

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    // Live typing updates state before blur; cross-currency USD cash + GBP security also requires Gross value (GBP).
    fireEvent.change(screen.getByRole("textbox", { name: "Shares" }), {
      target: { value: "4.5" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Total paid" }), {
      target: { value: "10" },
    });
    expect(save).toBeDisabled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Gross value (GBP)" }),
      { target: { value: "8" } },
    );
    expect(save).toBeEnabled();

    // Rollover calendar date (2026-02-31) disables Save cleanly.
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-02-31" },
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-24" },
    });
    expect(save).toBeEnabled();

    // Fees + taxes reaching total paid on a cross-currency purchase shows strict inline Field error and locks Save.
    commit(screen.getByRole("textbox", { name: "Fees" }), "6");
    commit(screen.getByRole("textbox", { name: "Taxes" }), "4");
    expect(screen.getByRole("textbox", { name: "Total paid" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByText("Fees and taxes must be less than total paid"),
    ).toBeInTheDocument();
    expect(save).toBeDisabled();

    commit(screen.getByRole("textbox", { name: "Fees" }), "");
    commit(screen.getByRole("textbox", { name: "Fees" }), "2");
    commit(screen.getByRole("textbox", { name: "Taxes" }), "");
    commit(screen.getByRole("textbox", { name: "Taxes" }), "3");
    commit(screen.getByRole("textbox", { name: "Shares" }), "");
    expect(save).toBeDisabled();
    commit(screen.getByRole("textbox", { name: "Shares" }), "4.5");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "");
    expect(save).toBeDisabled();
    commit(screen.getByRole("textbox", { name: "Total paid" }), "500");
    commit(screen.getByRole("textbox", { name: "Gross value (GBP)" }), "390");
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "  Dollar buy  " },
    });

    fireEvent.click(save);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Transaction saved" }),
      ).toHaveAccessibleDescription(
        "Purchase · Global Equity Index · 24 Sep 2026",
      );
    });
    expect(addPortfolioTransaction).toHaveBeenCalledExactlyOnceWith(1, {
      accountId: "cash-usd",
      amount: 500,
      currency: "USD",
      date: "2026-09-24",
      fees: 2,
      fxAmount: 390,
      note: "Dollar buy",
      portfolioId: "port-gia",
      securityId: "sec-world",
      shares: 4.5,
      taxes: 3,
      type: "purchase",
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("adapts fields across sale, delivery, dividend, cash-only, and transfer types including cross-currency transfers", async () => {
    vi.mocked(addPortfolioTransaction).mockResolvedValue(
      saved({ id: "tx-ok", savedOn: "2026-09-25", version: 2 }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioTransaction) => void>();
    render(
      <PortfolioTransactionDialog
        baseCurrency="CHF"
        cashAccounts={cashAccounts}
        holdings={holdings}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    const typeSelect = screen.getByRole("combobox", { name: "Type" });

    // Same-currency purchase checks non-strict cost bound copy.
    commit(screen.getByRole("textbox", { name: "Total paid" }), "20");
    commit(screen.getByRole("textbox", { name: "Fees" }), "25");
    expect(
      screen.getByText("Fees and taxes cannot exceed total paid"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // Sale
    fireEvent.change(typeSelect, { target: { value: "sale" } });
    expect(
      screen.getByRole("textbox", { name: "Net proceeds" }),
    ).toBeInTheDocument();

    // Inbound delivery validates same-currency and cross-currency cost bounds with distinct copy.
    fireEvent.change(typeSelect, { target: { value: "inbound-delivery" } });
    const currencySelect = screen.getByRole("combobox", { name: "Currency" });
    expect(currencySelect).toHaveValue("GBP");
    commit(screen.getByRole("textbox", { name: "Total value" }), "20");
    commit(screen.getByRole("textbox", { name: "Fees" }), "25");
    commit(screen.getByRole("textbox", { name: "Shares" }), "3");
    expect(
      screen.getByText("Fees and taxes cannot exceed total value"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(currencySelect, { target: { value: "EUR" } });
    expect(
      screen.getByText("Fees and taxes must be less than total value"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(typeSelect, { target: { value: "outbound-delivery" } });
    expect(
      screen.getByRole("textbox", { name: "Total value" }),
    ).toHaveAccessibleDescription("After fees and taxes");
    expect(screen.getByRole("textbox", { name: "Total value" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // Dividend then cash transfer: prefers same-currency destination and supports cross-currency transfers.
    fireEvent.change(typeSelect, { target: { value: "dividend" } });
    expect(
      screen.getByRole("heading", { name: "Dividend · Global Equity Index" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-reserve" },
    });

    fireEvent.change(typeSelect, { target: { value: "cash-transfer" } });
    const toCashSelect = screen.getByRole("combobox", {
      name: "To cash account",
    });
    expect(toCashSelect).toHaveValue("cash-isa");
    commit(screen.getByRole("textbox", { name: "Amount" }), "150");

    // Cross-currency destination switches to Amount sent / Amount received and disables Save until Amount received is entered.
    fireEvent.change(toCashSelect, { target: { value: "cash-usd" } });
    expect(
      screen.getByRole("textbox", { name: "Amount sent (GBP)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Amount received (USD)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // Same account destination hints and disables Save.
    fireEvent.change(toCashSelect, { target: { value: "cash-reserve" } });
    expect(toCashSelect).toHaveAccessibleDescription(
      "Choose a different destination account",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(toCashSelect, { target: { value: "cash-isa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenLastCalledWith(
        {
          accountId: "cash-reserve",
          amount: 150,
          currency: "GBP",
          date: "2026-09-25",
          fees: 0,
          otherAccountId: "cash-isa",
          shares: 0,
          taxes: 0,
          type: "cash-transfer",
        },
        2,
      );
    });

    // Security transfer with optional valuation cleared to 0.
    fireEvent.change(typeSelect, { target: { value: "purchase" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Securities account" }),
      { target: { value: "port-gia" } },
    );
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
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(
      screen.getByRole("combobox", { name: "To securities account" }),
      { target: { value: "port-isa" } },
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenLastCalledWith(
        {
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
        },
        2,
      );
    });

    // Deposit strips security, shares, fees, and taxes and names cash account in toast.
    fireEvent.change(typeSelect, { target: { value: "deposit" } });
    commit(screen.getByRole("textbox", { name: "Amount" }), "400");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenLastCalledWith(
        {
          accountId: "cash-usd",
          amount: 400,
          currency: "USD",
          date: "2026-09-25",
          fees: 0,
          shares: 0,
          taxes: 0,
          type: "deposit",
        },
        2,
      );
    });
  });

  it("resets vanished required accounts and securities to empty with explicit hints on stale refresh without falling back to another account", async () => {
    vi.mocked(addPortfolioTransaction)
      .mockResolvedValueOnce(
        refused("The portfolio file changed while this was being saved"),
      )
      .mockResolvedValueOnce(
        saved({ id: "tx-retry", savedOn: "2026-09-25", version: 3 }),
      );
    const onSaved = vi.fn<(draft: NewPortfolioTransaction) => void>();
    const { rerender } = render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{
          accountId: "cash-isa",
          amount: 250,
          currency: "GBP",
          date: "2026-09-20",
          fees: 0,
          portfolioId: "port-isa",
          securityId: "sec-world",
          shares: 5,
          taxes: 0,
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Transaction not saved" }),
      ).toHaveAccessibleDescription(
        "The portfolio file changed while this was being saved",
      );
    });
    expect(onSaved).not.toHaveBeenCalled();

    // Refresh drops port-isa, cash-isa, and sec-world while keeping port-gia, cash-reserve, cash-usd, and sec-gilts.
    const reducedSecurities = securitiesAccounts.filter(
      (a) => a.id !== "port-isa",
    );
    const reducedCash = cashAccounts.filter((a) => a.id !== "cash-isa");
    const reducedHoldings = holdings.filter((h) => h.id !== "sec-world");

    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={reducedCash}
        holdings={reducedHoldings}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={reducedSecurities}
        today="2026-09-25"
        version={2}
      />,
    );

    const portSelect = screen.getByRole("combobox", {
      name: "Securities account",
    });
    const cashSelect = screen.getByRole("combobox", { name: "Cash account" });
    const secSelect = screen.getByRole("combobox", { name: "Security" });

    expect(portSelect).toHaveValue("");
    expect(cashSelect).toHaveValue("");
    expect(secSelect).toHaveValue("");
    expect(portSelect).toHaveAccessibleDescription(
      "Selected account is no longer available",
    );
    expect(cashSelect).toHaveAccessibleDescription(
      "Selected account is no longer available",
    );
    expect(secSelect).toHaveAccessibleDescription(
      "Selected security is no longer available",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // Also verify missing-source & missing-destination hints on cash-transfer and security-transfer.
    const typeSelect = screen.getByRole("combobox", { name: "Type" });
    fireEvent.change(typeSelect, { target: { value: "cash-transfer" } });
    expect(
      screen.getByRole("combobox", { name: "From cash account" }),
    ).toHaveAccessibleDescription("Selected account is no longer available");

    // Re-pick port-gia, cash-reserve, sec-gilts on purchase and succeed with live version 2.
    fireEvent.change(typeSelect, { target: { value: "purchase" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Securities account" }),
      { target: { value: "port-gia" } },
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-reserve" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Security" }), {
      target: { value: "sec-gilts" },
    });
    commit(screen.getByRole("textbox", { name: "Shares" }), "5");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "250");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(addPortfolioTransaction).toHaveBeenLastCalledWith(
        2,
        expect.objectContaining({
          accountId: "cash-reserve",
          portfolioId: "port-gia",
          securityId: "sec-gilts",
        }),
      );
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("handles missing destination accounts on cash-transfer and security-transfer, empty catalogues, unlinked accounts, and cross-currency-only cash fallback", () => {
    // Only two cash accounts with differing currencies exercises the non-same-currency fallback in initialSelectionOf and distinctOtherCashId.
    const crossOnlyCash: readonly CashAccount[] = [
      cashAccounts[0] ?? {
        balance: 0,
        balanceGbp: 0,
        currency: "GBP",
        id: "cash-reserve",
        isRetired: false,
        name: "Reserve Cash",
        transactionCount: 0,
      },
      cashAccounts[2] ?? {
        balance: 0,
        balanceGbp: 0,
        currency: "USD",
        id: "cash-usd",
        isRetired: false,
        name: "Dollar Cash",
        transactionCount: 0,
      },
    ];

    const { rerender } = render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={crossOnlyCash}
        holdings={holdings}
        initialDraft={{
          accountId: "cash-reserve",
          otherAccountId: "cash-usd",
          type: "cash-transfer",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    // Rerender dropping destination cash-usd while keeping two GBP accounts so cashCount >= 2 and destination is missing.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={[
          ...crossOnlyCash.slice(0, 1),
          {
            balance: 100,
            balanceGbp: 100,
            currency: "GBP",
            id: "cash-alt",
            isRetired: false,
            name: "Alt Cash",
            transactionCount: 0,
          },
        ]}
        holdings={holdings}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={2}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "To cash account" }),
    ).toHaveAccessibleDescription("Selected account is no longer available");

    // Empty catalogues disable selects and keep Save locked across every layout.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={[]}
        holdings={[]}
        key="empty"
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={[]}
        today="2026-09-25"
        version={1}
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
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

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

  it("handles unlinked securities, retired initialDraft fallbacks, and cross-currency-only distinct destination selection", () => {
    const unlinkedSecurities: readonly SecuritiesAccount[] = [
      {
        holdingsCount: 0,
        id: "port-unlinked",
        isRetired: false,
        marketValue: 0,
        name: "Unlinked Dealing",
        transactionCount: 0,
      },
      {
        holdingsCount: 0,
        id: "port-second",
        isRetired: false,
        marketValue: 0,
        name: "Second Dealing",
        transactionCount: 0,
      },
    ];
    const crossOnlyCash: readonly CashAccount[] = [
      {
        balance: 100,
        balanceGbp: 100,
        currency: "GBP",
        id: "cash-gbp",
        isRetired: false,
        name: "GBP Cash",
        transactionCount: 0,
      },
      {
        balance: 100,
        balanceGbp: 75,
        currency: "USD",
        id: "cash-usd",
        isRetired: false,
        name: "USD Cash",
        transactionCount: 0,
      },
    ];

    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={crossOnlyCash}
        holdings={holdings}
        initialDraft={{
          accountId: "missing-cash",
          otherAccountId: "missing-other-cash",
          otherPortfolioId: "port-old",
          portfolioId: "port-old",
          securityId: "sec-retired",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={unlinkedSecurities}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-gbp",
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Securities account" }),
      { target: { value: "port-second" } },
    );
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-gbp",
    );

    // Switching to cash-transfer with only mismatched currencies selects the distinct USD account and reveals Amount received.
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "cash-transfer" },
    });
    expect(
      screen.getByRole("combobox", { name: "To cash account" }),
    ).toHaveValue("cash-usd");
    expect(
      screen.getByRole("textbox", { name: "Amount received (USD)" }),
    ).toBeInTheDocument();
  });

  it("re-picks a live destination when switching to cash-transfer or security-transfer after a stale destination vanished", () => {
    const thirdPortfolio: SecuritiesAccount = {
      holdingsCount: 0,
      id: "port-sipp",
      isRetired: false,
      marketValue: 0,
      name: "Harbour SIPP",
      transactionCount: 0,
    };

    const { rerender } = render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    // Stale refresh removes cash-reserve (leaving cash-isa GBP + cash-usd USD)
    // and removes port-gia (replacing it with port-sipp) while dialog is still on purchase.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts.slice(1)}
        holdings={holdings}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={[...securitiesAccounts.slice(0, 1), thirdPortfolio]}
        today="2026-09-25"
        version={2}
      />,
    );

    // Switching to cash-transfer picks cash-usd instead of leaving destination stuck on "".
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "cash-transfer" },
    });
    const toCash = screen.getByRole("combobox", { name: "To cash account" });
    expect(toCash).toHaveValue("cash-usd");
    expect(
      screen.getByRole("textbox", { name: "Amount received (USD)" }),
    ).toBeInTheDocument();

    // Switching to security-transfer picks port-sipp instead of leaving destination stuck on "".
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "security-transfer" },
    });
    expect(
      screen.getByRole("combobox", { name: "To securities account" }),
    ).toHaveValue("port-sipp");
  });

  it("offers an empty placeholder when catalogs grow from 0 to 1 while open so the newly arrived sole option is selectable", async () => {
    vi.mocked(addPortfolioTransaction).mockResolvedValue(
      saved({ id: "tx-grown", savedOn: "2026-09-25", version: 3 }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioTransaction) => void>();

    const { rerender } = render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={[]}
        holdings={[]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[]}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Cash account" }),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Security" })).toBeDisabled();

    // Stale refresh populates each catalog from 0 to 1 while dialog stays mounted.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts.slice(1, 2)}
        holdings={holdings.slice(0, 1)}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts.slice(0, 1)}
        today="2026-09-25"
        version={2}
      />,
    );

    const portfolioSelect = screen.getByRole("combobox", {
      name: "Securities account",
    });
    const cashSelect = screen.getByRole("combobox", { name: "Cash account" });
    const securitySelect = screen.getByRole("combobox", { name: "Security" });

    expect(portfolioSelect).toBeEnabled();
    expect(portfolioSelect).toHaveValue("");
    expect(cashSelect).toHaveValue("");
    expect(securitySelect).toHaveValue("");

    // Because each select carries its empty placeholder, selecting the sole option fires onChange cleanly.
    fireEvent.change(portfolioSelect, { target: { value: "port-isa" } });
    fireEvent.change(securitySelect, { target: { value: "sec-world" } });
    expect(portfolioSelect).toHaveValue("port-isa");
    expect(cashSelect).toHaveValue("cash-isa");
    expect(securitySelect).toHaveValue("sec-world");

    commit(screen.getByRole("textbox", { name: "Shares" }), "2");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "250");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(addPortfolioTransaction).toHaveBeenCalledWith(2, {
      accountId: "cash-isa",
      amount: 250,
      currency: "GBP",
      date: "2026-09-25",
      fees: 0,
      portfolioId: "port-isa",
      securityId: "sec-world",
      shares: 2,
      taxes: 0,
      type: "purchase",
    });
  });

  it("surfaces a target sync warning in the success toast while still calling onSaved", async () => {
    vi.mocked(addPortfolioTransaction).mockResolvedValue(
      saved({
        id: "tx-warn",
        savedOn: "2026-09-25",
        syncWarning: "The portfolio file has no Asset Allocation taxonomy",
        version: 2,
      }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioTransaction) => void>();
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{
          accountId: "cash-isa",
          amount: 250,
          currency: "GBP",
          date: "2026-09-20",
          fees: 0,
          portfolioId: "port-isa",
          securityId: "sec-world",
          shares: 5,
          taxes: 0,
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Transaction saved" }),
      ).toHaveAccessibleDescription(
        "Purchase · Global Equity Index · 20 Sep 2026. Targets not synced: The portfolio file has no Asset Allocation taxonomy",
      );
    });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(
      {
        accountId: "cash-isa",
        amount: 250,
        currency: "GBP",
        date: "2026-09-20",
        fees: 0,
        portfolioId: "port-isa",
        securityId: "sec-world",
        shares: 5,
        taxes: 0,
        type: "purchase",
      },
      2,
    );
  });

  it("preserves explicit blank trade selections with handoff hints until account, security, and shares are filled", () => {
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{
          amount: 500,
          portfolioId: "",
          securityId: "",
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    const portfolioSelect = screen.getByRole("combobox", {
      name: "Securities account",
    });
    const cashSelect = screen.getByRole("combobox", { name: "Cash account" });
    const securitySelect = screen.getByRole("combobox", { name: "Security" });
    const sharesInput = screen.getByRole("textbox", { name: "Shares" });
    const save = screen.getByRole("button", { name: "Save" });

    expect(portfolioSelect).toHaveValue("");
    expect(
      within(portfolioSelect).getByRole("option", {
        name: "Select an account",
      }),
    ).toBeInTheDocument();
    expect(portfolioSelect).toHaveAccessibleDescription(
      "Choose the account for this trade",
    );
    expect(cashSelect).toHaveValue("");
    expect(
      within(cashSelect).getByRole("option", { name: "Select an account" }),
    ).toBeInTheDocument();
    expect(securitySelect).toHaveValue("");
    expect(sharesInput).toHaveValue("");
    expect(sharesInput).toHaveAccessibleDescription("Enter executed shares");
    expect(save).toBeDisabled();

    // Selecting a securities account pulls in its reference cash account and clears the account hint.
    fireEvent.change(portfolioSelect, { target: { value: "port-isa" } });
    expect(cashSelect).toHaveValue("cash-isa");
    expect(portfolioSelect).toHaveAccessibleDescription("");
    expect(save).toBeDisabled();

    // Choosing a security leaves Save disabled until executed shares are entered.
    fireEvent.change(securitySelect, { target: { value: "sec-world" } });
    expect(save).toBeDisabled();

    fireEvent.change(sharesInput, { target: { value: "4" } });
    expect(sharesInput).toHaveAccessibleDescription("");
    expect(save).toBeEnabled();
  });

  it("clears the executed shares handoff hint when switching transaction type resets amount", () => {
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{
          amount: 500,
          portfolioId: "port-isa",
          securityId: "sec-world",
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(screen.getByRole("textbox", { name: "Total paid" })).toHaveValue(
      "£500.00",
    );
    expect(
      screen.getByRole("textbox", { name: "Shares" }),
    ).toHaveAccessibleDescription("Enter executed shares");

    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "sale" },
    });

    expect(screen.getByRole("textbox", { name: "Net proceeds" })).toHaveValue(
      "",
    );
    expect(
      screen.getByRole("textbox", { name: "Shares" }),
    ).toHaveAccessibleDescription("");
  });

  it("auto-selects the sole active cash account when portfolioId is explicitly blank", () => {
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts.slice(1, 2)}
        holdings={holdings}
        initialDraft={{
          amount: 500,
          portfolioId: "",
          securityId: "",
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveValue("");
    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveAccessibleDescription("Choose the account for this trade");
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-isa",
    );
  });

  it("groups securities under the suggested category with category title and hint until a security is chosen", () => {
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{
          amount: 500,
          portfolioId: "",
          securityId: "",
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        suggestedCategory={{
          name: "Global Equities",
          securityIds: ["sec-world"],
        }}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("heading", { name: "Purchase · Global Equities" }),
    ).toBeInTheDocument();

    const securitySelect = screen.getByRole("combobox", { name: "Security" });
    expect(securitySelect).toHaveValue("");
    expect(
      within(securitySelect).getByRole("option", { name: "Select a security" }),
    ).toBeInTheDocument();
    expect(securitySelect).toHaveAccessibleDescription(
      "Choose a security in Global Equities",
    );
    expect(
      within(securitySelect)
        .getAllByRole("group")
        .map((group) => group.getAttribute("label")),
    ).toStrictEqual(["Global Equities", "Other securities"]);
    expect(
      within(
        within(securitySelect).getByRole("group", { name: "Global Equities" }),
      )
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Global Equity Index"]);
    expect(
      within(
        within(securitySelect).getByRole("group", { name: "Other securities" }),
      )
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["UK Gilts Fund"]);

    // Switching to dividend keeps AccountFields flat without category grouping or title.
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "dividend" },
    });
    expect(
      screen.getByRole("heading", { name: "New dividend" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("combobox", { name: "Security" })).queryByRole(
        "group",
      ),
    ).not.toBeInTheDocument();

    // Switching back to purchase and selecting a security removes placeholder and hint and updates title.
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "purchase" },
    });
    const tradeSecuritySelect = screen.getByRole("combobox", {
      name: "Security",
    });
    fireEvent.change(tradeSecuritySelect, { target: { value: "sec-world" } });
    expect(
      screen.getByRole("heading", { name: "Purchase · Global Equity Index" }),
    ).toBeInTheDocument();
    expect(
      within(tradeSecuritySelect).queryByRole("option", {
        name: "Select a security",
      }),
    ).not.toBeInTheDocument();
    expect(tradeSecuritySelect).toHaveAccessibleDescription("");
  });

  it("avoids duplicate group labels, empty second groups, and empty optgroups across suggested category edge cases", () => {
    const { rerender } = render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{ portfolioId: "", securityId: "", type: "purchase" }}
        key="literal-other"
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        suggestedCategory={{
          name: "Other securities",
          securityIds: ["sec-world"],
        }}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(
      within(screen.getByRole("combobox", { name: "Security" }))
        .getAllByRole("group")
        .map((group) => group.getAttribute("label")),
    ).toStrictEqual(["Other securities", "Other"]);

    // When every active holding is in the suggested category, render only that group.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{ portfolioId: "", securityId: "", type: "purchase" }}
        key="all-in-category"
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        suggestedCategory={{
          name: "Core Portfolio",
          securityIds: ["sec-world", "sec-gilts"],
        }}
        today="2026-09-25"
        version={1}
      />,
    );

    expect(
      within(screen.getByRole("combobox", { name: "Security" }))
        .getAllByRole("group")
        .map((group) => group.getAttribute("label")),
    ).toStrictEqual(["Core Portfolio"]);

    // When zero active holdings belong to the category, render flat options with no optgroup and an explanatory hint.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{ portfolioId: "", securityId: "", type: "purchase" }}
        key="zero-in-category"
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        suggestedCategory={{
          name: "Commodities",
          securityIds: ["sec-retired"],
        }}
        today="2026-09-25"
        version={1}
      />,
    );

    const flatSecuritySelect = screen.getByRole("combobox", {
      name: "Security",
    });
    expect(
      within(flatSecuritySelect).queryByRole("group"),
    ).not.toBeInTheDocument();
    expect(flatSecuritySelect).toHaveValue("");
    expect(
      within(flatSecuritySelect).getByRole("option", {
        name: "Select a security",
      }),
    ).toBeInTheDocument();
    expect(flatSecuritySelect).toHaveAccessibleDescription(
      "No active security assigned to Commodities",
    );
  });

  it("prioritizes empty-catalog and missing-selection hints over suggested category and unselected account hints", () => {
    const { rerender } = render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={[]}
        initialDraft={{ portfolioId: "", securityId: "", type: "purchase" }}
        key="empty-holdings"
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={[]}
        suggestedCategory={{
          name: "Global Equities",
          securityIds: ["sec-world"],
        }}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveAccessibleDescription("Add a securities account first");
    expect(
      screen.getByRole("combobox", { name: "Security" }),
    ).toHaveAccessibleDescription("Add a security first");

    // A vanished security after a stale refresh overrides the suggestedCategory hint.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        initialDraft={{
          portfolioId: "port-isa",
          securityId: "sec-world",
          type: "purchase",
        }}
        key="missing-security"
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        suggestedCategory={{
          name: "Global Equities",
          securityIds: ["sec-world", "sec-gilts"],
        }}
        today="2026-09-25"
        version={1}
      />,
    );

    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings.filter((holding) => holding.id !== "sec-world")}
        initialDraft={{
          portfolioId: "port-isa",
          securityId: "sec-world",
          type: "purchase",
        }}
        key="missing-security"
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<(draft: NewPortfolioTransaction) => void>()}
        securitiesAccounts={securitiesAccounts}
        suggestedCategory={{
          name: "Global Equities",
          securityIds: ["sec-world", "sec-gilts"],
        }}
        today="2026-09-25"
        version={2}
      />,
    );

    const securitySelect = screen.getByRole("combobox", { name: "Security" });
    expect(securitySelect).toHaveValue("");
    expect(
      within(securitySelect).getByRole("option", { name: "Select a security" }),
    ).toBeInTheDocument();
    expect(securitySelect).toHaveAccessibleDescription(
      "Selected security is no longer available",
    );
  });

  it("syncs cross-currency Gross value and Exchange rate loop-free, resets on currency-pair change, and saves only fxAmount", async () => {
    vi.mocked(addPortfolioTransaction).mockResolvedValue(
      saved({ id: "tx-fx", savedOn: "2026-09-25", version: 2 }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioTransaction) => void>();
    const fxHoldings: readonly Holding[] = [
      {
        currency: "USD",
        gbpRate: 0.7874,
        id: "sec-us",
        isRetired: false,
        isSplitCategory: false,
        latestPrice: 100,
        latestPriceDate: "2026-09-22",
        name: "US Equity ETF",
        shares: 5,
        sharesByAccount: [{ portfolioId: "port-isa", shares: 5 }],
        transactionCount: 1,
      },
      {
        currency: "EUR",
        gbpRate: 0.85,
        id: "sec-eu",
        isRetired: false,
        isSplitCategory: false,
        latestPrice: 50,
        latestPriceDate: "2026-09-22",
        name: "Europe Equity ETF",
        shares: 0,
        sharesByAccount: [],
        transactionCount: 0,
      },
      {
        currency: "GBX",
        gbpRate: 0.01,
        id: "sec-uk-pence",
        isRetired: false,
        isSplitCategory: false,
        latestPrice: 250,
        latestPriceDate: "2026-09-22",
        name: "UK Pence Fund",
        shares: 0,
        sharesByAccount: [],
        transactionCount: 0,
      },
    ];
    const gbpRates = Object.fromEntries([
      ["EUR", 0.85],
      ["GBP", 1],
      ["USD", 0.7874],
    ]);

    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        gbpRates={gbpRates}
        holdings={fxHoldings}
        initialDraft={{
          portfolioId: "port-isa",
          securityId: "sec-us",
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    const rateInput = screen.getByRole("textbox", {
      name: "Exchange rate (GBP per USD)",
    });
    const fxAmountInput = screen.getByRole("textbox", {
      name: "Gross value (USD)",
    });
    const save = screen.getByRole("button", { name: "Save" });

    // Before entering FX values, shows last known rate from gbpRates.
    expect(rateInput).toHaveAccessibleDescription(
      "Last known rate: 1 USD = £0.7874",
    );

    commit(screen.getByRole("textbox", { name: "Shares" }), "10");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "800");
    commit(screen.getByRole("textbox", { name: "Fees" }), "12.6");
    // Gross settlement hint shows Total paid minus fees/taxes.
    expect(fxAmountInput).toHaveAccessibleDescription(
      "Gross settlement £787.40",
    );

    // Editing Exchange rate derives Gross value without a loop.
    commit(rateInput, "0.7874");
    expect(fxAmountInput).toHaveValue("US$1,000.00");
    expect(rateInput).toHaveAccessibleDescription(
      "1 USD = £0.7874 (1 GBP = US$1.270003)",
    );
    expect(save).toBeEnabled();

    // Changing Total paid while rate is the driver keeps rate fixed and updates Gross value.
    commit(screen.getByRole("textbox", { name: "Total paid" }), "1587.4");
    expect(rateInput).toHaveValue("0.7874");
    expect(fxAmountInput).toHaveValue("US$2,000.00");

    // Out-of-range derived Gross value (< 0.01) shows inline error and disables Save cleanly.
    commit(rateInput, "500000");
    expect(fxAmountInput).toHaveValue("");
    expect(fxAmountInput).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Exchange rate produces an out-of-range amount"),
    ).toBeInTheDocument();
    expect(save).toBeDisabled();

    // Zero/cleared rate clears the out-of-range error and keeps Save disabled.
    commit(rateInput, "0");
    expect(save).toBeDisabled();
    commit(rateInput, "");
    expect(save).toBeDisabled();

    // Switching driver to Gross value derives Exchange rate (rounded to 6dp) and tabbing past Exchange rate does not flip fxDriver.
    commit(screen.getByRole("textbox", { name: "Total paid" }), "10012.6");
    commit(fxAmountInput, "12700");
    expect(rateInput).toHaveValue("0.787402");
    fireEvent.focus(rateInput);
    fireEvent.blur(rateInput);
    expect(fxAmountInput).toHaveValue("US$12,700.00");
    // Changing Total paid while Gross value is still the driver updates Exchange rate rather than rewriting Gross value.
    commit(screen.getByRole("textbox", { name: "Total paid" }), "800");
    expect(fxAmountInput).toHaveValue("US$12,700.00");
    expect(rateInput).toHaveValue("0.062");

    // Tiny derived rate that rounds to 0 at 6dp leaves Exchange rate blank rather than showing 0.00.
    commit(screen.getByRole("textbox", { name: "Fees" }), "");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "0.01");
    commit(fxAmountInput, "1000000");
    expect(rateInput).toHaveValue("");

    // Restore normal trade and clear Gross value.
    commit(screen.getByRole("textbox", { name: "Total paid" }), "800");
    commit(screen.getByRole("textbox", { name: "Fees" }), "12.6");
    commit(fxAmountInput, "1000");
    expect(rateInput).toHaveValue("0.7874");
    expect(save).toBeEnabled();

    // Clearing Gross value clears both FX fields and disables Save.
    commit(fxAmountInput, "");
    expect(rateInput).toHaveValue("");
    expect(save).toBeDisabled();

    // Switching security currency pair resets FX state cleanly.
    commit(fxAmountInput, "1000");
    fireEvent.change(screen.getByRole("combobox", { name: "Security" }), {
      target: { value: "sec-eu" },
    });
    expect(
      screen.getByRole("textbox", { name: "Gross value (EUR)" }),
    ).toHaveValue("");

    // Switching to GBX security under GBP cash shows automatic conversion note and saves without fxAmount.
    fireEvent.change(screen.getByRole("combobox", { name: "Security" }), {
      target: { value: "sec-uk-pence" },
    });
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Converted automatically between GBP and GBX (pence).",
    );
    expect(
      screen.queryByRole("textbox", { name: /Gross value/ }),
    ).not.toBeInTheDocument();
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(
        {
          accountId: "cash-isa",
          amount: 800,
          currency: "GBP",
          date: "2026-09-25",
          fees: 12.6,
          portfolioId: "port-isa",
          securityId: "sec-uk-pence",
          shares: 10,
          taxes: 0,
          type: "purchase",
        },
        2,
      );
    });

    // Save a cross-currency sale (where gross = amount + fees + taxes) driven by Exchange rate.
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "sale" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Security" }), {
      target: { value: "sec-us" },
    });
    commit(screen.getByRole("textbox", { name: "Shares" }), "10");
    commit(screen.getByRole("textbox", { name: "Net proceeds" }), "780");
    commit(screen.getByRole("textbox", { name: "Fees" }), "7.4");
    expect(
      screen.getByRole("textbox", { name: "Gross value (USD)" }),
    ).toHaveAccessibleDescription("Gross settlement £787.40");
    commit(
      screen.getByRole("textbox", { name: "Exchange rate (GBP per USD)" }),
      "0.7874",
    );
    fireEvent.click(save);

    await waitFor(() => {
      expect(onSaved).toHaveBeenLastCalledWith(
        {
          accountId: "cash-isa",
          amount: 780,
          currency: "GBP",
          date: "2026-09-25",
          fees: 7.4,
          fxAmount: 1000,
          portfolioId: "port-isa",
          securityId: "sec-us",
          shares: 10,
          taxes: 0,
          type: "sale",
        },
        2,
      );
    });
  });

  it("supports cross-currency cash transfers, dividends, non-GBP cross-rates, and manual USD-to-GBX trades", async () => {
    vi.mocked(addPortfolioTransaction).mockResolvedValue(
      saved({ id: "tx-fx-move", savedOn: "2026-09-25", version: 2 }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioTransaction) => void>();
    const fxHoldings: readonly Holding[] = [
      {
        currency: "EUR",
        gbpRate: 0.85,
        id: "sec-eu",
        isRetired: false,
        isSplitCategory: false,
        latestPrice: 50,
        latestPriceDate: "2026-09-22",
        name: "Europe Equity ETF",
        shares: 0,
        sharesByAccount: [],
        transactionCount: 0,
      },
      {
        currency: "GBX",
        gbpRate: 0.01,
        id: "sec-uk-pence",
        isRetired: false,
        isSplitCategory: false,
        latestPrice: 250,
        latestPriceDate: "2026-09-22",
        name: "UK Pence Fund",
        shares: 0,
        sharesByAccount: [],
        transactionCount: 0,
      },
    ];
    const gbpRates = Object.fromEntries([
      ["EUR", 0.85],
      ["GBP", 1],
      ["USD", 0.8],
    ]);

    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        gbpRates={gbpRates}
        holdings={fxHoldings}
        initialDraft={{
          accountId: "cash-isa",
          otherAccountId: "cash-usd",
          type: "cash-transfer",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    const sentInput = screen.getByRole("textbox", {
      name: "Amount sent (GBP)",
    });
    const receivedInput = screen.getByRole("textbox", {
      name: "Amount received (USD)",
    });
    const save = screen.getByRole("button", { name: "Save" });

    expect(receivedInput).toHaveAccessibleDescription(
      "Last known rate: 1 USD = £0.80",
    );
    expect(save).toBeDisabled();

    commit(sentInput, "800");
    expect(save).toBeDisabled();
    commit(receivedInput, "1000");
    expect(receivedInput).toHaveAccessibleDescription(
      "1 USD = £0.80 (1 GBP = US$1.25)",
    );
    expect(save).toBeEnabled();

    fireEvent.click(save);
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledExactlyOnceWith(
        {
          accountId: "cash-isa",
          amount: 800,
          currency: "GBP",
          date: "2026-09-25",
          fees: 0,
          fxAmount: 1000,
          otherAccountId: "cash-usd",
          shares: 0,
          taxes: 0,
          type: "cash-transfer",
        },
        2,
      );
    });

    // Cross-currency dividend settled in USD for a EUR security uses non-GBP cross-rate (0.85 / 0.80 = 1.0625).
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "dividend" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-usd" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Security" }), {
      target: { value: "sec-eu" },
    });
    const divRateInput = screen.getByRole("textbox", {
      name: "Exchange rate (USD per EUR)",
    });
    expect(divRateInput).toHaveAccessibleDescription(
      "Last known rate: 1 EUR = US$1.0625",
    );
    commit(screen.getByRole("textbox", { name: "Net received" }), "40");
    commit(screen.getByRole("textbox", { name: "Taxes" }), "2.5");
    commit(screen.getByRole("textbox", { name: "Gross value (EUR)" }), "40");
    expect(divRateInput).toHaveValue("1.0625");
    fireEvent.click(save);

    await waitFor(() => {
      expect(onSaved).toHaveBeenLastCalledWith(
        {
          accountId: "cash-usd",
          amount: 40,
          currency: "USD",
          date: "2026-09-25",
          fees: 0,
          fxAmount: 40,
          securityId: "sec-eu",
          shares: 0,
          taxes: 2.5,
          type: "dividend",
        },
        2,
      );
    });

    // Non-GBP cash (USD) + GBX security requires manual FX (never automatic GBP-to-GBX note).
    fireEvent.change(screen.getByRole("combobox", { name: "Security" }), {
      target: { value: "sec-uk-pence" },
    });
    expect(
      screen.getByRole("textbox", { name: "Gross value (GBX)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Dividend · UK Pence Fund" }),
    ).not.toHaveTextContent(
      "Converted automatically between GBP and GBX (pence).",
    );
  });

  it("guards non-GBP Cogitator handoffs, adapts copy after manual entry, and keeps the shares hint", () => {
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        gbpRates={Object.fromEntries([
          ["GBP", 1],
          ["USD", 0.8],
        ])}
        handoffAmountGbp={400}
        holdings={holdings}
        initialDraft={{
          amount: 400,
          portfolioId: "port-gia",
          securityId: "sec-world",
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<() => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    const amountInput = screen.getByRole("textbox", { name: "Total paid" });
    const sharesInput = screen.getByRole("textbox", { name: "Shares" });
    expect(amountInput).toHaveValue("");
    expect(sharesInput).toHaveAccessibleDescription("Enter executed shares");
    expect(screen.getByRole("note")).toHaveTextContent(
      "Cogitator trade is £400",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "This account settles in USD, so the amount was left blank. Enter the executed USD total (about US$500.00 at the last known rate).",
    );

    // Entering an executed USD figure updates the caution copy and preserves the edited amount across account switches.
    commit(amountInput, "505");
    expect(screen.getByRole("note")).toHaveTextContent(
      "This account settles in USD. Confirm the executed USD total (about US$500.00 at the last known rate).",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-isa" },
    });
    expect(screen.getByRole("textbox", { name: "Total paid" })).toHaveValue(
      "£505.00",
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    // Switching back to USD keeps the edited figure; switching transaction type clears the handoff guard and shares hint.
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-usd" },
    });
    expect(screen.getByRole("textbox", { name: "Total paid" })).toHaveValue(
      "US$505.00",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "sale" },
    });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(sharesInput).not.toHaveAccessibleDescription(
      "Enter executed shares",
    );
  });

  it("announces dynamic handoff clearing and restoration and formats fractional GBP without rounding", () => {
    render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        handoffAmountGbp={800.5}
        holdings={holdings}
        initialDraft={{
          amount: 800.5,
          portfolioId: "port-isa",
          securityId: "sec-world",
          type: "purchase",
        }}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<() => void>()}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    const status = screen.getByRole("status");
    expect(screen.getByRole("textbox", { name: "Total paid" })).toHaveValue(
      "£800.50",
    );
    expect(status).toHaveTextContent("");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    // Switching to USD clears the untouched GBP handoff amount, announces it politely, and formats fractional GBP cleanly without an estimate when no rate is known.
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-usd" },
    });
    expect(screen.getByRole("textbox", { name: "Total paid" })).toHaveValue("");
    expect(status).toHaveTextContent(
      "Amount cleared because this account settles in USD",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "Cogitator trade is £800.50",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "This account settles in USD, so the amount was left blank. Enter the executed USD total.",
    );

    // Switching back to GBP while untouched restores the GBP handoff amount and announces the restoration.
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-isa" },
    });
    const restoredAmountInput = screen.getByRole("textbox", {
      name: "Total paid",
    });
    expect(restoredAmountInput).toHaveValue("£800.50");
    expect(status).toHaveTextContent(
      "Amount restored to £800.50 for GBP account",
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    // Clearing the amount marks it edited and clears the status message.
    commit(restoredAmountInput, "");
    expect(status).toHaveTextContent("");
    fireEvent.change(screen.getByRole("combobox", { name: "Cash account" }), {
      target: { value: "cash-usd" },
    });
    expect(status).toHaveTextContent("");
  });

  it("edits existing transactions with locked type, retained retired accounts/securities, seeded FX, preserved delivery currency, and Delete", async () => {
    vi.mocked(editPortfolioTransaction).mockResolvedValue(
      saved({ id: "tx-fx", savedOn: "2026-09-25", version: 5 }),
    );
    const retiredCash: CashAccount = {
      balance: 0,
      balanceGbp: 0,
      currency: "GBP",
      id: "cash-retired",
      isRetired: true,
      name: "Old Settlement Cash",
      transactionCount: 1,
    };
    const retiredPortfolio: SecuritiesAccount = {
      holdingsCount: 0,
      id: "port-retired",
      isRetired: true,
      marketValue: 0,
      name: "Old Brokerage",
      transactionCount: 1,
    };
    const retiredUsSecurity: Holding = {
      currency: "USD",
      gbpRate: 0.78,
      id: "sec-retired-us",
      isRetired: true,
      isSplitCategory: false,
      latestPrice: 100,
      latestPriceDate: "2026-09-25",
      name: "Legacy US Fund",
      shares: 0,
      sharesByAccount: [],
      transactionCount: 1,
    };
    // Non-terminating exchange rate (1000 / 300 = 3.333333...) verifies fxDriver="amount" survives blur without drift.
    const fxPurchase: PortfolioTransaction = {
      accountId: "cash-retired",
      accountName: "Old Settlement Cash",
      amount: 1010,
      currency: "GBP",
      date: "2026-09-20",
      fees: 5,
      grossValue: {
        amount: 1000,
        currency: "GBP",
        exchangeRate: 1000 / 300,
        fxAmount: 300,
        fxCurrency: "USD",
      },
      id: "tx-fx",
      note: "Legacy FX fill",
      portfolioId: "port-retired",
      portfolioName: "Old Brokerage",
      securityId: "sec-retired-us",
      securityName: "Legacy US Fund",
      shares: 10,
      taxes: 5,
      timestamp: 1_789_900_000,
      type: "purchase",
    };

    const onDelete = vi.fn<() => void>();
    const onSaved =
      vi.fn<(draft: NewPortfolioTransaction, version: number) => void>();

    // Only retired accounts & security exist — edit mode must keep them selectable and enabled.
    const { rerender } = render(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={[retiredCash]}
        holdings={[retiredUsSecurity]}
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[retiredPortfolio]}
        today="2026-09-25"
        transaction={fxPurchase}
        version={4}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("heading", { name: "Purchase · Legacy US Fund" }),
    ).toBeInTheDocument();
    const typeSelect = screen.getByRole("combobox", { name: "Type" });
    expect(typeSelect).toBeDisabled();
    expect(typeSelect).toHaveAccessibleDescription(
      "Transaction type cannot be changed",
    );
    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("option", { name: "Old Brokerage (retired)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "Old Settlement Cash (GBP, retired)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Legacy US Fund (retired)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Gross value (USD)" }),
    ).toHaveValue("US$300.00");
    const rateInput = screen.getByRole("textbox", {
      name: "Exchange rate (GBP per USD)",
    });
    expect(rateInput).toHaveValue("3.333333");
    // Blurring the rounded Exchange rate field without editing must NOT flip fxDriver or drift fxAmount.
    fireEvent.focus(rateInput);
    fireEvent.blur(rateInput);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Transaction saved" }),
      ).toHaveAccessibleDescription("Purchase · Legacy US Fund · 20 Sep 2026");
    });
    expect(editPortfolioTransaction).toHaveBeenCalledWith(4, {
      accountId: "cash-retired",
      amount: 1010,
      currency: "GBP",
      date: "2026-09-20",
      fees: 5,
      fxAmount: 300,
      id: "tx-fx",
      note: "Legacy FX fill",
      portfolioId: "port-retired",
      securityId: "sec-retired-us",
      shares: 10,
      taxes: 5,
      type: "purchase",
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ fxAmount: 300 }),
      5,
    );

    // Changing Securities account in edit mode must NOT overwrite Cash account or wipe FX state;
    // mismatched grossValue settlement currency must NOT seed fxTypedAmount.
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={[...cashAccounts, retiredCash]}
        holdings={[...holdings, retiredUsSecurity]}
        key="edit-trade-portfolio-no-overwrite"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[...securitiesAccounts, retiredPortfolio]}
        today="2026-09-25"
        transaction={fxPurchase}
        version={5}
      />,
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Securities account" }),
      { target: { value: "port-gia" } },
    );
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-retired",
    );
    expect(
      screen.getByRole("textbox", { name: "Gross value (USD)" }),
    ).toHaveValue("US$300.00");

    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={[retiredCash]}
        holdings={[retiredUsSecurity]}
        key="mismatched-gross-currency"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[retiredPortfolio]}
        today="2026-09-25"
        transaction={{
          ...fxPurchase,
          grossValue: {
            amount: 1000,
            currency: "EUR",
            fxAmount: 300,
            fxCurrency: "USD",
          },
        }}
        version={5}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "Gross value (USD)" }),
    ).toHaveValue("");

    // Preserves non-GBP/USD/EUR delivery currency dynamically even after switching away and back.
    const chfDelivery: PortfolioTransaction = {
      amount: 500,
      currency: "CHF",
      date: "2026-09-19",
      fees: 0,
      id: "tx-chf",
      portfolioId: "port-isa",
      portfolioName: "Northstar ISA",
      securityId: "sec-world",
      securityName: "Global Equity Index",
      shares: 5,
      taxes: 0,
      timestamp: 1_789_800_000,
      type: "inbound-delivery",
    };
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        key="chf-delivery"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        transaction={chfDelivery}
        version={5}
      />,
    );
    const deliveryCurrencySelect = screen.getByRole("combobox", {
      name: "Currency",
    });
    expect(deliveryCurrencySelect).toHaveValue("CHF");
    fireEvent.change(deliveryCurrencySelect, { target: { value: "GBP" } });
    expect(
      within(deliveryCurrencySelect).getByRole("option", { name: "CHF" }),
    ).toBeInTheDocument();

    // Zero-valuation non-base-currency security-transfer leaves Valuation blank and preserves its original currency on save.
    const usdSecTransfer: PortfolioTransaction = {
      amount: 0,
      currency: "USD",
      date: "2026-09-19",
      fees: 0,
      id: "tx-sec-xfer-usd",
      otherPortfolioId: "port-gia",
      otherPortfolioName: "Dealing Account",
      portfolioId: "port-isa",
      portfolioName: "Northstar ISA",
      securityId: "sec-world",
      securityName: "Global Equity Index",
      shares: 2,
      taxes: 0,
      timestamp: 1_789_750_000,
      type: "security-transfer",
    };
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        key="usd-sec-transfer"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        transaction={usdSecTransfer}
        version={5}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Valuation" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(editPortfolioTransaction).toHaveBeenLastCalledWith(
        5,
        expect.objectContaining({
          currency: "USD",
          id: "tx-sec-xfer-usd",
          type: "security-transfer",
        }),
      );
    });

    // Cash-only edit titles with the cash account name; orphan deposit falls back to type label and leaves Amount blank when zero.
    const cashDeposit: PortfolioTransaction = {
      accountId: "cash-reserve",
      accountName: "Reserve Cash",
      amount: 250,
      currency: "GBP",
      date: "2026-09-18",
      fees: 0,
      id: "tx-dep",
      shares: 0,
      taxes: 0,
      timestamp: 1_789_700_000,
      type: "deposit",
    };
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        key="cash-deposit"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        transaction={cashDeposit}
        version={5}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Deposit · Reserve Cash" }),
    ).toBeInTheDocument();

    const orphanDeposit: PortfolioTransaction = {
      amount: 0,
      currency: "GBP",
      date: "2026-09-17",
      fees: 0,
      id: "tx-orphan",
      shares: 0,
      taxes: 0,
      timestamp: 1_789_600_000,
      type: "deposit",
    };
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={cashAccounts}
        holdings={holdings}
        key="orphan-deposit"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        transaction={orphanDeposit}
        version={5}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Deposit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("");

    // Cash transfer to a retired destination cash account keeps both accounts selectable and enabled.
    const retiredTransfer: PortfolioTransaction = {
      accountId: "cash-reserve",
      accountName: "Reserve Cash",
      amount: 100,
      currency: "GBP",
      date: "2026-09-16",
      fees: 0,
      id: "tx-xfer",
      otherAccountId: "cash-retired",
      otherAccountName: "Old Settlement Cash",
      shares: 0,
      taxes: 0,
      timestamp: 1_789_500_000,
      type: "cash-transfer",
    };
    rerender(
      <PortfolioTransactionDialog
        baseCurrency="GBP"
        cashAccounts={[...cashAccounts, retiredCash]}
        holdings={holdings}
        key="retired-transfer"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={securitiesAccounts}
        today="2026-09-25"
        transaction={retiredTransfer}
        version={5}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "To cash account" }),
    ).toHaveValue("cash-retired");
  });
});
