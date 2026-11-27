import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CashAccount, SecuritiesAccount } from "@/data/portfolio";
import type { Answer } from "@/lib/answer";
import type { SavedPortfolioMutation } from "@/store/portfolio";

import { addPortfolioAccount, editPortfolioAccount } from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";

import { PortfolioAccountDialog } from "./portfolio-account-dialog";

vi.mock("@/actions/portfolio", () => ({
  addPortfolioAccount: vi.fn(),
  editPortfolioAccount: vi.fn(),
}));

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

    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();
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
      isRetired: false,
      version: 4,
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

    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();
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
        isRetired: false,
        version: 5,
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
    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();
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
      isRetired: false,
      version: 2,
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

  it("appends syncWarning to the success toast and still completes onSaved", async () => {
    vi.mocked(addPortfolioAccount).mockResolvedValue(
      saved({
        id: "port-warn",
        savedOn: "2026-09-25",
        syncWarning: "The household target allocation could not be synced yet",
        version: 4,
      }),
    );
    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();
    render(
      <PortfolioAccountDialog
        cashAccounts={[isaCash]}
        defaultCurrency="GBP"
        kind="securities"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        version={3}
      />,
      { wrapper: Toaster },
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Harbour SIPP" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account saved" }),
      ).toHaveAccessibleDescription(
        "Harbour SIPP added to the portfolio file. Targets not synced: The household target allocation could not be synced yet",
      );
    });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({
      isRetired: false,
      version: 4,
    });
  });

  it("edits cash and securities accounts with locked kind/currency, retired reference retention, delete locks, and tailored retire/restore toasts", async () => {
    vi.mocked(editPortfolioAccount)
      .mockResolvedValueOnce(
        saved({ id: "cash-chf", savedOn: "2026-09-25", version: 2 }),
      )
      .mockResolvedValueOnce(
        saved({ id: "cash-chf", savedOn: "2026-09-25", version: 3 }),
      )
      .mockResolvedValueOnce(
        saved({ id: "port-1", savedOn: "2026-09-25", version: 4 }),
      );

    const chfCash: CashAccount = {
      balance: 0,
      balanceGbp: 0,
      currency: "CHF",
      id: "cash-chf",
      isRetired: false,
      name: "Swiss Cash",
      note: "Holding pot",
      transactionCount: 0,
    };
    const retiredCash: CashAccount = {
      balance: 0,
      balanceGbp: 0,
      currency: "GBP",
      id: "cash-retired",
      isRetired: true,
      name: "Old Cash",
      transactionCount: 2,
    };
    const linkedSecurities: SecuritiesAccount = {
      holdingsCount: 0,
      id: "port-1",
      isRetired: false,
      marketValue: 0,
      name: "Northstar ISA",
      referenceAccountId: "cash-retired",
      transactionCount: 0,
    };
    const usedSecurities: SecuritiesAccount = {
      holdingsCount: 1,
      id: "port-used",
      isRetired: true,
      marketValue: 100,
      name: "Closed ISA",
      referenceAccountId: "cash-chf",
      transactionCount: 3,
    };

    const onDelete = vi.fn<() => void>();
    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();

    // 1. Editable cash account locked by a referencing securities account (even retired) shows actionable note and no Delete.
    const { rerender } = render(
      <PortfolioAccountDialog
        cashAccounts={[chfCash, retiredCash]}
        defaultCurrency="GBP"
        editing={{ account: chfCash, kind: "cash" }}
        kind="cash"
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[usedSecurities]}
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("combobox", { name: "Account type" }),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "CHF",
    );
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("paragraph")
        .map((paragraph) => paragraph.textContent),
    ).toContain(
      "Referenced by Closed ISA — unlink first to delete, or retire it instead",
    );

    // Retire cash account -> "Account retired" toast.
    fireEvent.click(screen.getByRole("switch", { name: "Retired" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account retired" }),
      ).toHaveAccessibleDescription("Swiss Cash marked as retired");
    });
    expect(editPortfolioAccount).toHaveBeenCalledWith(1, {
      id: "cash-chf",
      isRetired: true,
      kind: "cash",
      name: "Swiss Cash",
      note: "Holding pot",
    });

    // 2. Unlinked zero-tx retired cash account offers Delete and shows "Account restored" when unretired.
    rerender(
      <PortfolioAccountDialog
        cashAccounts={[{ ...chfCash, isRetired: true }]}
        defaultCurrency="GBP"
        editing={{ account: { ...chfCash, isRetired: true }, kind: "cash" }}
        key="unlinked-cash"
        kind="cash"
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[]}
        version={2}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("switch", { name: "Retired" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account restored" }),
      ).toHaveAccessibleDescription("Swiss Cash restored to active accounts");
    });

    // 3. Cash account locked by both transactions and referencing securities account names both.
    rerender(
      <PortfolioAccountDialog
        cashAccounts={[retiredCash]}
        defaultCurrency="GBP"
        editing={{ account: retiredCash, kind: "cash" }}
        key="both-locked"
        kind="cash"
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[linkedSecurities]}
        version={3}
      />,
    );
    expect(
      screen
        .getAllByRole("paragraph")
        .map((paragraph) => paragraph.textContent),
    ).toContain(
      "Used by 2 transactions and referenced by Northstar ISA — unlink first to delete, or retire it instead",
    );

    // 4. Securities account edit retains retired reference cash option, updates cleanly, and shows lock note when txCount > 0.
    rerender(
      <PortfolioAccountDialog
        cashAccounts={[chfCash, retiredCash]}
        defaultCurrency="GBP"
        editing={{ account: linkedSecurities, kind: "securities" }}
        key="edit-sec"
        kind="securities"
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[linkedSecurities]}
        version={3}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Old Cash (GBP, retired)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account saved" }),
      ).toHaveAccessibleDescription("Northstar ISA updated");
    });
    expect(editPortfolioAccount).toHaveBeenLastCalledWith(3, {
      id: "port-1",
      isRetired: false,
      kind: "securities",
      name: "Northstar ISA",
      referenceAccountId: "cash-retired",
    });

    const unlinkedUsedSecurities: SecuritiesAccount = {
      holdingsCount: 1,
      id: "port-used",
      isRetired: true,
      marketValue: 100,
      name: "Closed ISA",
      transactionCount: 3,
    };
    rerender(
      <PortfolioAccountDialog
        cashAccounts={[chfCash]}
        defaultCurrency="GBP"
        editing={{ account: unlinkedUsedSecurities, kind: "securities" }}
        key="used-sec"
        kind="securities"
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        securitiesAccounts={[unlinkedUsedSecurities]}
        version={4}
      />,
    );
    expect(
      screen
        .getAllByRole("paragraph")
        .map((paragraph) => paragraph.textContent),
    ).toContain("Used by 3 transactions — retire it instead");
  });
});
