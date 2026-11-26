import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  CashAccount,
  Holding,
  NewPortfolioTransaction,
  SecuritiesAccount,
} from "@/data/portfolio";

import { addPortfolioTransaction } from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { commit } from "@/test/dom";

import { PortfolioTransactionDialog } from "./portfolio-transaction-dialog";

vi.mock("@/actions/portfolio", () => ({ addPortfolioTransaction: vi.fn() }));

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

    // Live typing updates state before blur so Save enables immediately.
    fireEvent.change(screen.getByRole("textbox", { name: "Shares" }), {
      target: { value: "4.5" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Total paid" }), {
      target: { value: "10" },
    });
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

    // Fees + taxes exceeding total paid shows inline Field error and locks Save.
    commit(screen.getByRole("textbox", { name: "Fees" }), "6");
    commit(screen.getByRole("textbox", { name: "Taxes" }), "5");
    expect(screen.getByRole("textbox", { name: "Total paid" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByText("Fees and taxes cannot exceed total paid"),
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
      note: "Dollar buy",
      portfolioId: "port-gia",
      securityId: "sec-world",
      shares: 4.5,
      taxes: 3,
      type: "purchase",
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("adapts fields across sale, delivery, dividend, cash-only, and transfer types while enforcing same-currency cash transfers", async () => {
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

    // Sale
    fireEvent.change(typeSelect, { target: { value: "sale" } });
    expect(
      screen.getByRole("textbox", { name: "Net proceeds" }),
    ).toBeInTheDocument();

    // Inbound delivery validates fees+taxes against Total value with distinct error copy.
    fireEvent.change(typeSelect, { target: { value: "inbound-delivery" } });
    const currencySelect = screen.getByRole("combobox", { name: "Currency" });
    expect(currencySelect).toHaveValue("GBP");
    fireEvent.change(currencySelect, { target: { value: "EUR" } });
    commit(screen.getByRole("textbox", { name: "Total value" }), "20");
    commit(screen.getByRole("textbox", { name: "Fees" }), "25");
    commit(screen.getByRole("textbox", { name: "Shares" }), "3");
    expect(
      screen.getByText("Fees and taxes cannot exceed total value"),
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

    // Dividend then cash transfer: prefers same-currency destination and blocks cross-currency transfers.
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

    // Cross-currency destination hints and disables Save.
    fireEvent.change(toCashSelect, { target: { value: "cash-usd" } });
    expect(toCashSelect).toHaveAccessibleDescription(
      "Transfers must share a currency",
    );
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
      expect(onSaved).toHaveBeenLastCalledWith({
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
      expect(onSaved).toHaveBeenLastCalledWith({
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
    });

    // Deposit strips security, shares, fees, and taxes and names cash account in toast.
    fireEvent.change(typeSelect, { target: { value: "deposit" } });
    commit(screen.getByRole("textbox", { name: "Amount" }), "400");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenLastCalledWith({
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
      },
      {
        holdingsCount: 0,
        id: "port-second",
        isRetired: false,
        marketValue: 0,
        name: "Second Dealing",
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

    // Switching to cash-transfer with only mismatched currencies selects the distinct USD account and hints currency mismatch.
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "cash-transfer" },
    });
    expect(
      screen.getByRole("combobox", { name: "To cash account" }),
    ).toHaveValue("cash-usd");
    expect(
      screen.getByRole("combobox", { name: "To cash account" }),
    ).toHaveAccessibleDescription("Transfers must share a currency");
  });

  it("re-picks a live destination when switching to cash-transfer or security-transfer after a stale destination vanished", () => {
    const thirdPortfolio: SecuritiesAccount = {
      holdingsCount: 0,
      id: "port-sipp",
      isRetired: false,
      marketValue: 0,
      name: "Harbour SIPP",
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
    expect(toCash).toHaveAccessibleDescription(
      "Transfers must share a currency",
    );

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
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({
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
    });
  });
});
