import type { ComponentProps, JSX } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  CashAccount,
  Holding,
  PortfolioTransaction,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";

import { PortfolioTransactions } from "./portfolio-transactions";

const activeSecuritiesAccount: SecuritiesAccount = {
  holdingsCount: 1,
  id: "port-isa",
  isRetired: false,
  marketValue: 1250,
  name: "Northstar ISA",
  referenceAccountId: "cash-isa",
};

const retiredSecuritiesAccount: SecuritiesAccount = {
  holdingsCount: 0,
  id: "port-old",
  isRetired: true,
  marketValue: 0,
  name: "Closed Dealing",
};

const securitiesAccounts: readonly SecuritiesAccount[] = [
  activeSecuritiesAccount,
  retiredSecuritiesAccount,
];

const activeCashAccount: CashAccount = {
  balance: 750,
  balanceGbp: 750,
  currency: "GBP",
  id: "cash-isa",
  isRetired: false,
  name: "Northstar ISA Cash",
  transactionCount: 2,
};

const retiredCashAccount: CashAccount = {
  balance: 0,
  balanceGbp: 0,
  currency: "GBP",
  id: "cash-old",
  isRetired: true,
  name: "Closed Cash",
  transactionCount: 1,
};

const cashAccounts: readonly CashAccount[] = [
  activeCashAccount,
  retiredCashAccount,
];

const activeHoldings: readonly Holding[] = [
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

const zeroShareHolding: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-sold",
  isRetired: false,
  latestPrice: 80,
  latestPriceDate: "2026-06-15",
  name: "Cleared Equity Fund",
  shares: 0,
  sharesByAccount: [],
};

const holdings: readonly Holding[] = [...activeHoldings, zeroShareHolding];

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
  {
    accountId: "cash-old",
    accountName: "Closed Cash",
    amount: 400,
    currency: "GBP",
    date: "2026-05-10",
    fees: 0,
    id: "tx-old-sale",
    portfolioId: "port-old",
    portfolioName: "Closed Dealing",
    securityId: "sec-sold",
    securityName: "Cleared Equity Fund",
    shares: 5,
    taxes: 0,
    timestamp: 1_778_400_000,
    type: "sale",
  },
];

function manyTransactions(count: number): readonly PortfolioTransaction[] {
  return Array.from({ length: count }, (_, index) => ({
    accountId: index === 0 ? "cash-old" : "cash-isa",
    accountName: index === 0 ? "Closed Cash" : "Northstar ISA Cash",
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

function renderTransactions(
  props: Partial<ComponentProps<typeof PortfolioTransactions>> = {},
): ReturnType<typeof render> {
  return render(transactionsElement(props));
}

function transactionsElement(
  props: Partial<ComponentProps<typeof PortfolioTransactions>> = {},
): JSX.Element {
  return (
    <PortfolioTransactions
      accountId=""
      cashAccounts={cashAccounts}
      holdings={holdings}
      isShowingInactive={false}
      label="Sect. IX.iii"
      onAccountChange={vi.fn<(id: string) => void>()}
      onAddTransaction={vi.fn<() => void>()}
      onSecurityChange={vi.fn<(id: string) => void>()}
      onShowingInactiveChange={vi.fn<(isShowing: boolean) => void>()}
      onTypeChange={vi.fn<(type: "" | TransactionType) => void>()}
      securitiesAccounts={securitiesAccounts}
      securityId=""
      transactions={sampleTransactions}
      type=""
      {...props}
    />
  );
}

describe("PortfolioTransactions", () => {
  it("hides retired accounts and zero-share securities from dropdowns by default while keeping all transactions in the table", () => {
    const onAccountChange = vi.fn<(id: string) => void>();
    const onSecurityChange = vi.fn<(id: string) => void>();
    const onShowingInactiveChange = vi.fn<(isShowing: boolean) => void>();

    renderTransactions({
      onAccountChange,
      onSecurityChange,
      onShowingInactiveChange,
    });

    expect(screen.getByText("3 transactions")).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "Cleared Equity Fund" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "Closed Dealing · Closed Cash" }),
    ).toBeInTheDocument();

    const accountSelect = screen.getByRole("combobox", { name: "Account" });
    expect(
      within(accountSelect)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["All accounts", "Northstar ISA", "Northstar ISA Cash"]);

    const securitySelect = screen.getByRole("combobox", { name: "Security" });
    expect(
      within(securitySelect)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["All securities", "Global Equity Index", "UK Gilts Fund"]);

    const toggle = screen.getByRole("switch", {
      name: "Show retired & zero-share in filters",
    });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(onShowingInactiveChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(onAccountChange).not.toHaveBeenCalled();
    expect(onSecurityChange).not.toHaveBeenCalled();
  });

  it("reveals retired accounts and zero-share securities when toggled on, trims empty names, reports filter changes, and fires Add transaction", () => {
    const onAccountChange = vi.fn<(id: string) => void>();
    const onTypeChange = vi.fn<(type: "" | TransactionType) => void>();
    const onSecurityChange = vi.fn<(id: string) => void>();
    const onAddTransaction = vi.fn<() => void>();

    const { rerender } = renderTransactions({
      accountId: "",
      isShowingInactive: true,
      onAccountChange,
      onAddTransaction,
      onSecurityChange,
      onTypeChange,
      securityId: "sec-world",
    });

    // Security-only filter activates Clear filters even when Account is All accounts.
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
    expect(
      within(screen.getByRole("combobox", { name: "Security" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "All securities",
      "Cleared Equity Fund (0 shares)",
      "Global Equity Index",
      "UK Gilts Fund",
    ]);

    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "port-isa" },
    });
    expect(onAccountChange).toHaveBeenCalledWith("port-isa");

    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "purchase" },
    });
    expect(onTypeChange).toHaveBeenCalledWith("purchase");

    fireEvent.change(screen.getByRole("combobox", { name: "Security" }), {
      target: { value: "sec-sold" },
    });
    expect(onSecurityChange).toHaveBeenCalledWith("sec-sold");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onAccountChange).toHaveBeenLastCalledWith("");
    expect(onTypeChange).toHaveBeenLastCalledWith("");
    expect(onSecurityChange).toHaveBeenLastCalledWith("");

    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(onAddTransaction).toHaveBeenCalledOnce();

    // Unnamed retired accounts and zero-share securities render without a leading space.
    rerender(
      transactionsElement({
        cashAccounts: [{ ...retiredCashAccount, id: "cash-blank", name: "" }],
        holdings: [{ ...zeroShareHolding, id: "sec-blank", name: "" }],
        isShowingInactive: true,
        securitiesAccounts: [],
      }),
    );
    expect(
      screen.getByRole("option", { name: "(retired)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "(0 shares)" }),
    ).toBeInTheDocument();
  });

  it("keeps draft securities and retired held securities visible by default, adapts toggle copy, and omits the switch when everything is active", () => {
    const draftSecurity: Holding = {
      currency: "GBP",
      gbpRate: 1,
      id: "sec-draft",
      isDraft: true,
      isRetired: false,
      latestPrice: 100,
      latestPriceDate: null,
      name: "Draft Sterling Bond",
      shares: 0,
      sharesByAccount: [],
    };
    const retiredHeldSecurity: Holding = {
      currency: "GBP",
      gbpRate: 1,
      id: "sec-retired-held",
      isRetired: true,
      latestPrice: 60,
      latestPriceDate: "2026-09-22",
      name: "Legacy Income Trust",
      shares: 3,
      sharesByAccount: [{ portfolioId: "port-isa", shares: 3 }],
    };

    const { rerender } = renderTransactions({
      cashAccounts: [activeCashAccount],
      holdings: [...activeHoldings, draftSecurity, retiredHeldSecurity],
      securitiesAccounts: [activeSecuritiesAccount],
    });

    // Neither draft (0-share) nor retired-but-held securities trigger the inactive toggle.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("combobox", { name: "Security" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "All securities",
      "Draft Sterling Bond",
      "Global Equity Index",
      "Legacy Income Trust",
      "UK Gilts Fund",
    ]);

    rerender(
      transactionsElement({
        cashAccounts: [activeCashAccount],
        holdings: activeHoldings,
        securitiesAccounts,
      }),
    );
    expect(
      screen.getByRole("switch", { name: "Show retired accounts in filters" }),
    ).toBeInTheDocument();

    rerender(
      transactionsElement({
        cashAccounts: [activeCashAccount],
        holdings,
        securitiesAccounts: [activeSecuritiesAccount],
      }),
    );
    expect(
      screen.getByRole("switch", {
        name: "Show zero-share securities in filters",
      }),
    ).toBeInTheDocument();

    rerender(
      transactionsElement({
        accountId: "cash-isa",
        cashAccounts: [activeCashAccount],
        holdings: activeHoldings,
        securitiesAccounts: [activeSecuritiesAccount],
      }),
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();

    rerender(
      transactionsElement({
        accountId: "",
        cashAccounts: [activeCashAccount],
        holdings: activeHoldings,
        securitiesAccounts: [activeSecuritiesAccount],
      }),
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeInTheDocument();
  });

  it("clears retired account and zero-share security selections on toggle while preserving active selections", () => {
    const onAccountChange = vi.fn<(id: string) => void>();
    const onSecurityChange = vi.fn<(id: string) => void>();
    const onShowingInactiveChange = vi.fn<(isShowing: boolean) => void>();

    const { rerender } = renderTransactions({
      accountId: "port-old",
      isShowingInactive: true,
      onAccountChange,
      onSecurityChange,
      onShowingInactiveChange,
      securityId: "sec-sold",
    });

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Show retired & zero-share in filters",
      }),
    );
    expect(onShowingInactiveChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onAccountChange).toHaveBeenCalledExactlyOnceWith("");
    expect(onSecurityChange).toHaveBeenCalledExactlyOnceWith("");

    onAccountChange.mockClear();
    onSecurityChange.mockClear();
    onShowingInactiveChange.mockClear();

    // Mixed: retired cash account + active security -> clears account only.
    rerender(
      transactionsElement({
        accountId: "cash-old",
        isShowingInactive: true,
        onAccountChange,
        onSecurityChange,
        onShowingInactiveChange,
        securityId: "sec-world",
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Show retired & zero-share in filters",
      }),
    );
    expect(onShowingInactiveChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onAccountChange).toHaveBeenCalledExactlyOnceWith("");
    expect(onSecurityChange).not.toHaveBeenCalled();

    onAccountChange.mockClear();
    onSecurityChange.mockClear();
    onShowingInactiveChange.mockClear();

    // Mixed: active account + zero-share security -> clears security only.
    rerender(
      transactionsElement({
        accountId: "cash-isa",
        isShowingInactive: true,
        onAccountChange,
        onSecurityChange,
        onShowingInactiveChange,
        securityId: "sec-sold",
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Show retired & zero-share in filters",
      }),
    );
    expect(onShowingInactiveChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onAccountChange).not.toHaveBeenCalled();
    expect(onSecurityChange).toHaveBeenCalledExactlyOnceWith("");

    onAccountChange.mockClear();
    onSecurityChange.mockClear();
    onShowingInactiveChange.mockClear();

    // Active account + active security -> preserves both.
    rerender(
      transactionsElement({
        accountId: "cash-isa",
        isShowingInactive: true,
        onAccountChange,
        onSecurityChange,
        onShowingInactiveChange,
        securityId: "sec-world",
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Show retired & zero-share in filters",
      }),
    );
    expect(onShowingInactiveChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onAccountChange).not.toHaveBeenCalled();
    expect(onSecurityChange).not.toHaveBeenCalled();
  });

  it("falls back to All accounts and All securities when hidden ids are passed while off and clears them rather than resurrecting on toggle on", () => {
    const onAccountChange = vi.fn<(id: string) => void>();
    const onSecurityChange = vi.fn<(id: string) => void>();
    const onShowingInactiveChange = vi.fn<(isShowing: boolean) => void>();

    renderTransactions({
      accountId: "cash-old",
      isShowingInactive: false,
      onAccountChange,
      onSecurityChange,
      onShowingInactiveChange,
      securityId: "sec-sold",
    });

    expect(screen.getByRole("combobox", { name: "Account" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue("");
    expect(screen.getByText("3 transactions")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Show retired & zero-share in filters",
      }),
    );
    expect(onShowingInactiveChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(onAccountChange).toHaveBeenCalledExactlyOnceWith("");
    expect(onSecurityChange).toHaveBeenCalledExactlyOnceWith("");
  });

  it("paginates 50 rows at a time and resets paging when filters change or toggling off clears a hidden filter", () => {
    const transactions = manyTransactions(65);
    const { rerender } = renderTransactions({ transactions });

    expect(screen.getByText("Showing 1–50 of 65")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(51);

    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(screen.getByText("65 transactions")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(66);

    rerender(transactionsElement({ accountId: "cash-isa", transactions }));
    expect(screen.getByText("Showing 1–50 of 64")).toBeInTheDocument();

    // Expand filtered results, then simulate toggling off clearing a hidden retired selection.
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(screen.getByText("64 transactions")).toBeInTheDocument();

    rerender(
      transactionsElement({
        accountId: "cash-old",
        isShowingInactive: false,
        transactions,
      }),
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
        {transactionsElement({
          accountId: "cash-old",
          isReadOnly: true,
          isShowingInactive: true,
          onAccountChange,
          onSecurityChange,
          onTypeChange,
          readOnlyId: "scenario-note",
          transactions: [],
        })}
      </>,
    );

    // Empty files always show the empty-file state with no stray Clear filters button,
    // even when a cash account filter was passed from Accounts.
    expect(
      screen.getByText("No transactions in this file"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Account" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: "Add transaction" });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAccessibleDescription("Scenario active");

    rerender(
      transactionsElement({
        accountId: "missing-account",
        cashAccounts: [],
        holdings: activeHoldings,
        onAccountChange,
        onSecurityChange,
        onTypeChange,
        securitiesAccounts: [],
        securityId: "missing-security",
        transactions: sampleTransactions,
        type: "dividend",
      }),
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
