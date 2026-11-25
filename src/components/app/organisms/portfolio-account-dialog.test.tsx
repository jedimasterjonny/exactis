import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CashAccount, NewPortfolioAccount } from "@/data/portfolio";
import type { Answer } from "@/lib/answer";
import type { SavedPortfolioMutation } from "@/store/portfolio";

import { addPortfolioAccount } from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";

import { PortfolioAccountDialog } from "./portfolio-account-dialog";

vi.mock("@/actions/portfolio", () => ({ addPortfolioAccount: vi.fn() }));

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
  it("saves a linked securities account, shows busy state, and toasts on success", async () => {
    let resolveSave: (
      answer: Answer<SavedPortfolioMutation<{ readonly id: string }>>,
    ) => void = () => {
      // Replaced by deferred promise below.
    };
    vi.mocked(addPortfolioAccount).mockImplementation(
      async () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    const onSaved = vi.fn<(draft: NewPortfolioAccount) => void>();
    render(
      <PortfolioAccountDialog
        cashAccounts={[isaCash, dollarCash]}
        defaultCurrency="GBP"
        kind="securities"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        version={3}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("heading", { name: "Untitled account" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });

    resolveSave(saved({ id: "port-new", savedOn: "2026-09-25", version: 4 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account saved" }),
      ).toHaveAccessibleDescription(
        "Northstar GIA added to the portfolio file",
      );
    });
    expect(addPortfolioAccount).toHaveBeenCalledExactlyOnceWith(3, {
      kind: "securities",
      name: "Northstar GIA",
      note: "Taxable dealing",
      referenceAccountId: "cash-usd",
    });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({
      kind: "securities",
      name: "Northstar GIA",
      note: "Taxable dealing",
      referenceAccountId: "cash-usd",
    });
  });

  it("clears a vanished reference cash account after stale refusal and retries with the live version", async () => {
    vi.mocked(addPortfolioAccount)
      .mockResolvedValueOnce(
        refused(
          "The portfolio file changed while this was being saved, so nothing was",
        ),
      )
      .mockResolvedValueOnce(
        saved({ id: "port-new", savedOn: "2026-09-25", version: 5 }),
      );

    const onSaved = vi.fn<(draft: NewPortfolioAccount) => void>();
    const { rerender } = render(
      <PortfolioAccountDialog
        cashAccounts={[isaCash, dollarCash]}
        defaultCurrency="GBP"
        kind="securities"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        version={3}
      />,
      { wrapper: Toaster },
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Direct Shares" },
    });
    const refSelect = screen.getByRole("combobox", {
      name: "Reference cash account",
    });
    fireEvent.change(refSelect, { target: { value: "cash-usd" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account not saved" }),
      ).toHaveAccessibleDescription(
        "The portfolio file changed while this was being saved, so nothing was",
      );
    });
    expect(onSaved).not.toHaveBeenCalled();

    // Refresh removes cash-usd and advances version to 4; reference resets cleanly to "".
    rerender(
      <PortfolioAccountDialog
        cashAccounts={[isaCash]}
        defaultCurrency="GBP"
        kind="securities"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        version={4}
      />,
    );
    expect(refSelect).toHaveValue("");
    expect(refSelect).not.toHaveAccessibleDescription();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledExactlyOnceWith({
        kind: "securities",
        name: "Direct Shares",
      });
    });
    expect(addPortfolioAccount).toHaveBeenLastCalledWith(4, {
      kind: "securities",
      name: "Direct Shares",
    });
  });

  it("switches to a cash account, defaults currency from baseCurrency or falls back to GBP, and saves or dismisses", async () => {
    vi.mocked(addPortfolioAccount).mockResolvedValue(
      saved({ id: "cash-new", savedOn: "2026-09-25", version: 2 }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioAccount) => void>();
    const { unmount } = render(
      <PortfolioAccountDialog
        cashAccounts={[isaCash]}
        defaultCurrency="EUR"
        kind="securities"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        version={1}
      />,
      { wrapper: Toaster },
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account saved" }),
      ).toHaveAccessibleDescription(
        "US Settlement (USD) added to the portfolio file",
      );
    });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({
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
        onDismiss={onDismiss}
        onSaved={onSaved}
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "GBP",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
