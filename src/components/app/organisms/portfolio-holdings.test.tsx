import type { ComponentProps } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Holding, SecuritiesAccount } from "@/data/portfolio";

import { PortfolioHoldings } from "./portfolio-holdings";

const isa: SecuritiesAccount = {
  holdingsCount: 2,
  id: "port-isa",
  isRetired: false,
  marketValue: 1750,
  name: "Northstar ISA",
  transactionCount: 2,
};

const emptyDealing: SecuritiesAccount = {
  holdingsCount: 0,
  id: "port-empty",
  isRetired: false,
  marketValue: 0,
  name: "Spare Dealing",
  transactionCount: 0,
};

const gbpFund: Holding = {
  category: "Global equity",
  currency: "GBP",
  gbpRate: 1,
  id: "sec-gbp",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: 125,
  latestPriceDate: "2026-09-22",
  name: "Global Equity Index",
  shares: 10,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 10 }],
  transactionCount: 1,
};

const usdFund: Holding = {
  currency: "USD",
  gbpRate: 0.75,
  id: "sec-usd",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: 100,
  latestPriceDate: "2026-09-22",
  name: "US Equity ETF",
  shares: 5,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 5 }],
  transactionCount: 1,
};

const zeroFund: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-zero",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: 50,
  latestPriceDate: null,
  name: "Sold Fund",
  shares: 0,
  sharesByAccount: [],
  transactionCount: 0,
};

function renderHoldings(
  props: Partial<ComponentProps<typeof PortfolioHoldings>> = {},
): void {
  render(
    <PortfolioHoldings
      accountId=""
      holdings={[gbpFund, usdFund, zeroFund]}
      isShowingZeroShares={false}
      label="Sect. IX.i"
      onAccountChange={vi.fn<(accountId: string) => void>()}
      onAddSecurity={vi.fn<() => void>()}
      onShowingZeroSharesChange={vi.fn<(isShowing: boolean) => void>()}
      onUpdateQuotes={vi.fn<() => void>()}
      securitiesAccounts={[isa, emptyDealing]}
      {...props}
    />,
  );
}

describe("PortfolioHoldings", () => {
  it("renders holdings with Account filter, zero-share toggle, primary Update quotes action, and FX pricing note when foreign securities are shown", () => {
    const onAccountChange = vi.fn<(accountId: string) => void>();
    const onShowingZeroSharesChange = vi.fn<(isShowing: boolean) => void>();
    const onAddSecurity = vi.fn<() => void>();
    const onUpdateQuotes = vi.fn<() => void>();

    renderHoldings({
      onAccountChange,
      onAddSecurity,
      onShowingZeroSharesChange,
      onUpdateQuotes,
    });

    expect(screen.getAllByText("Global Equity Index")).toHaveLength(2);
    expect(screen.getAllByText("US Equity ETF")).toHaveLength(2);
    expect(screen.queryByText("Sold Fund")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("paragraph").map((element) => element.textContent),
    ).toContain(
      "Prices in other currencies use the latest GBP transaction rate, as Portfolio Performance stores no live FX feed.",
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "port-isa" },
    });
    expect(onAccountChange).toHaveBeenCalledExactlyOnceWith("port-isa");

    fireEvent.click(
      screen.getByRole("switch", { name: "Show zero-share securities" }),
    );
    expect(onShowingZeroSharesChange).toHaveBeenCalledExactlyOnceWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    expect(onAddSecurity).toHaveBeenCalledOnce();

    const updateQuotes = screen.getByRole("button", { name: "Update quotes" });
    expect(updateQuotes).toHaveClass("bg-primary");
    fireEvent.click(updateQuotes);
    expect(onUpdateQuotes).toHaveBeenCalledOnce();
  });

  it("shows a filtered account subtotal in the footer and omits the FX note when only GBP/GBX securities are shown", () => {
    renderHoldings({ accountId: "port-isa", holdings: [gbpFund] });

    expect(screen.getByText("Northstar ISA subtotal")).toBeInTheDocument();
    expect(
      screen.queryByText(/latest GBP transaction rate/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("shows a zero-match EmptyState with Clear filter when a selected account has no holdings", () => {
    const onAccountChange = vi.fn<(accountId: string) => void>();
    renderHoldings({ accountId: "port-empty", onAccountChange });

    expect(screen.getByText("No holdings in this account")).toBeInTheDocument();
    expect(
      screen.getByText("Spare Dealing has no matching holdings."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(onAccountChange).toHaveBeenCalledExactlyOnceWith("");
  });

  it("handles zero-share-only files, completely empty files, and unknown account filters safely", () => {
    const { rerender } = render(
      <PortfolioHoldings
        accountId="missing-id"
        holdings={[zeroFund]}
        isShowingZeroShares={false}
        label="Sect. IX.i"
        onAccountChange={vi.fn<(accountId: string) => void>()}
        onAddSecurity={vi.fn<() => void>()}
        onShowingZeroSharesChange={vi.fn<(isShowing: boolean) => void>()}
        onUpdateQuotes={vi.fn<() => void>()}
        securitiesAccounts={[]}
      />,
    );

    expect(screen.getByText("No active holdings")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update quotes" }),
    ).toBeInTheDocument();

    rerender(
      <PortfolioHoldings
        accountId=""
        holdings={[]}
        isShowingZeroShares={false}
        label="Sect. IX.i"
        onAccountChange={vi.fn<(accountId: string) => void>()}
        onAddSecurity={vi.fn<() => void>()}
        onShowingZeroSharesChange={vi.fn<(isShowing: boolean) => void>()}
        onUpdateQuotes={vi.fn<() => void>()}
        securitiesAccounts={[]}
      />,
    );

    expect(screen.getByText("No securities in this file")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update quotes" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("disables Add security and Update quotes with an accessible description when read-only", () => {
    render(
      <>
        <p id="scenario-lock">
          Leave the scenario to replace the file or update the portfolio.
        </p>
        <PortfolioHoldings
          accountId=""
          holdings={[gbpFund]}
          isReadOnly
          isShowingZeroShares={false}
          label="Sect. IX.i"
          onAccountChange={vi.fn<(accountId: string) => void>()}
          onAddSecurity={vi.fn<() => void>()}
          onShowingZeroSharesChange={vi.fn<(isShowing: boolean) => void>()}
          onUpdateQuotes={vi.fn<() => void>()}
          readOnlyId="scenario-lock"
          securitiesAccounts={[isa]}
        />
      </>,
    );

    const addSecurity = screen.getByRole("button", { name: "Add security" });
    expect(addSecurity).toBeDisabled();
    expect(addSecurity).toHaveAccessibleDescription(
      "Leave the scenario to replace the file or update the portfolio.",
    );

    const updateQuotes = screen.getByRole("button", { name: "Update quotes" });
    expect(updateQuotes).toBeDisabled();
    expect(updateQuotes).toHaveAccessibleDescription(
      "Leave the scenario to replace the file or update the portfolio.",
    );
  });

  it("threads edit and delete handlers with neighbour focus ids and omits them in read-only mode", () => {
    const onEditSecurity =
      vi.fn<(holding: Holding, fallbackFocusIds: readonly string[]) => void>();
    const onDeleteSecurity =
      vi.fn<(holding: Holding, fallbackFocusIds: readonly string[]) => void>();
    const { rerender } = render(
      <PortfolioHoldings
        accountId=""
        holdings={[gbpFund, usdFund, zeroFund]}
        isShowingZeroShares
        label="Sect. IX.i"
        onAccountChange={vi.fn<(accountId: string) => void>()}
        onAddSecurity={vi.fn<() => void>()}
        onDeleteSecurity={onDeleteSecurity}
        onEditSecurity={onEditSecurity}
        onShowingZeroSharesChange={vi.fn<(isShowing: boolean) => void>()}
        onUpdateQuotes={vi.fn<() => void>()}
        securitiesAccounts={[isa]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Global Equity Index" }),
    );
    expect(onEditSecurity).toHaveBeenCalledWith(gbpFund, ["holding:sec-usd"]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Sold Fund" }));
    expect(onDeleteSecurity).toHaveBeenCalledWith(zeroFund, [
      "holding:sec-usd",
    ]);

    rerender(
      <PortfolioHoldings
        accountId=""
        holdings={[gbpFund, zeroFund]}
        isReadOnly
        isShowingZeroShares
        label="Sect. IX.i"
        onAccountChange={vi.fn<(accountId: string) => void>()}
        onAddSecurity={vi.fn<() => void>()}
        onDeleteSecurity={onDeleteSecurity}
        onEditSecurity={onEditSecurity}
        onShowingZeroSharesChange={vi.fn<(isShowing: boolean) => void>()}
        onUpdateQuotes={vi.fn<() => void>()}
        securitiesAccounts={[isa]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^Edit /u }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Delete /u }),
    ).not.toBeInTheDocument();
  });
});
