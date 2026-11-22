import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CashAccount } from "@/data/portfolio";

import type { NewPortfolioAccount } from "./portfolio-account-dialog";

import { PortfolioAccountDialog } from "./portfolio-account-dialog";

const isaCash: CashAccount = {
  balance: 1250,
  balanceGbp: 1250,
  currency: "GBP",
  id: "cash-isa",
  isRetired: false,
  name: "ISA Cash",
  transactionCount: 4,
};

const dollarCash: CashAccount = {
  balance: 500,
  balanceGbp: 375,
  currency: "USD",
  id: "cash-usd",
  isRetired: false,
  name: "Dollar Cash",
  transactionCount: 2,
};

describe("PortfolioAccountDialog", () => {
  it("opens as a securities account, shows settlement currency hint when linked, and submits trimmed fields", () => {
    const onAdd = vi.fn<(draft: NewPortfolioAccount) => void>();
    render(
      <PortfolioAccountDialog
        cashAccounts={[isaCash, dollarCash]}
        defaultCurrency="GBP"
        kind="securities"
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Untitled account" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add preview" })).toBeDisabled();
    expect(
      screen.queryByRole("combobox", { name: "Currency" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "  Northstar GIA  " },
    });
    expect(
      screen.getByRole("heading", { name: "Northstar GIA" }),
    ).toBeInTheDocument();

    const refSelect = screen.getByRole("combobox", {
      name: "Reference cash account",
    });
    expect(refSelect).not.toHaveAccessibleDescription();

    fireEvent.change(refSelect, { target: { value: "cash-usd" } });
    expect(refSelect).toHaveAccessibleDescription("Trades settle in USD");

    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "  Taxable dealing  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(onAdd).toHaveBeenCalledWith({
      kind: "securities",
      name: "Northstar GIA",
      note: "Taxable dealing",
      referenceAccountId: "cash-usd",
    });
  });

  it("submits an unlinked securities account without optional fields when blank", () => {
    const onAdd = vi.fn<(draft: NewPortfolioAccount) => void>();
    render(
      <PortfolioAccountDialog
        cashAccounts={[isaCash]}
        defaultCurrency="GBP"
        kind="securities"
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Direct Shares" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(onAdd).toHaveBeenCalledWith({
      kind: "securities",
      name: "Direct Shares",
    });
  });

  it("switches to a cash account, defaults currency from baseCurrency or falls back to GBP, and submits", () => {
    const onAdd = vi.fn<(draft: NewPortfolioAccount) => void>();
    const { unmount } = render(
      <PortfolioAccountDialog
        cashAccounts={[isaCash]}
        defaultCurrency="EUR"
        kind="securities"
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Account type" }), {
      target: { value: "cash" },
    });
    const currencySelect = screen.getByRole("combobox", { name: "Currency" });
    expect(currencySelect).toHaveValue("EUR");

    fireEvent.change(currencySelect, { target: { value: "USD" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "US Settlement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(onAdd).toHaveBeenCalledWith({
      currency: "USD",
      kind: "cash",
      name: "US Settlement",
    });

    unmount();

    const onDismiss = vi.fn<() => void>();
    render(
      <PortfolioAccountDialog
        cashAccounts={[]}
        defaultCurrency="CHF"
        kind="cash"
        onAdd={onAdd}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "GBP",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
