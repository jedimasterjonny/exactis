import type { ComponentProps } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CashAccount, SecuritiesAccount } from "@/data/portfolio";

import { PortfolioAccounts } from "./portfolio-accounts";

const isaCash: CashAccount = {
  balance: 1250.4,
  balanceGbp: 1250.4,
  currency: "GBP",
  id: "cash-isa",
  isRetired: false,
  name: "ISA Cash",
  note: "Settled cash",
  transactionCount: 18,
};

const reserveCash: CashAccount = {
  balance: 600,
  balanceGbp: 600,
  currency: "GBP",
  id: "cash-reserve",
  isRetired: false,
  name: "Reserve Cash",
  transactionCount: 1,
};

const euroCash: CashAccount = {
  balance: 350,
  balanceGbp: null,
  currency: "EUR",
  id: "cash-eur",
  isRetired: false,
  name: "Euro Cash",
  transactionCount: 2,
};

const retiredCash: CashAccount = {
  balance: 50,
  balanceGbp: 50,
  currency: "GBP",
  id: "cash-old",
  isRetired: true,
  name: "Old Cash",
  transactionCount: 3,
};

const isaSecurities: SecuritiesAccount = {
  holdingsCount: 4,
  id: "sec-isa",
  isRetired: false,
  marketValue: 42_150.25,
  name: "Northstar ISA",
  note: "Tax wrapper",
  referenceAccountId: "cash-isa",
  transactionCount: 12,
};

const jointSecurities: SecuritiesAccount = {
  holdingsCount: 1,
  id: "sec-joint",
  isRetired: false,
  marketValue: 11_000.15,
  name: "Joint Dealing",
  referenceAccountId: "cash-isa",
  transactionCount: 4,
};

const unlinkedSecurities: SecuritiesAccount = {
  holdingsCount: 0,
  id: "sec-unlinked",
  isRetired: false,
  marketValue: 0,
  name: "Unlinked Dealing",
  transactionCount: 0,
};

const retiredSecurities: SecuritiesAccount = {
  holdingsCount: 0,
  id: "sec-old",
  isRetired: true,
  marketValue: 100,
  name: "Closed Account",
  referenceAccountId: "cash-old",
  transactionCount: 2,
};

function renderAccounts(
  props: Partial<ComponentProps<typeof PortfolioAccounts>> = {},
): void {
  render(
    <PortfolioAccounts
      cashAccounts={[isaCash, reserveCash]}
      label="Sect. IX.i"
      onAddCash={vi.fn<() => void>()}
      onAddSecurities={vi.fn<() => void>()}
      securitiesAccounts={[isaSecurities]}
      {...props}
    />,
  );
}

describe("PortfolioAccounts", () => {
  it("renders paired securities and reference cash accounts, deduplicated shared references, standalone cash, and reconciling ledger", () => {
    renderAccounts({
      cashAccounts: [isaCash, reserveCash, euroCash],
      securitiesAccounts: [isaSecurities, jointSecurities, unlinkedSecurities],
    });

    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toStrictEqual([
      "Securities accounts£53,150.40",
      "Reference cash account£1,250.40",
      "Standalone cash accounts£600.00",
    ]);

    const pairedRows = within(
      screen.getByRole("group", { name: "Securities accounts" }),
    ).getAllByRole("listitem");

    expect(pairedRows).toHaveLength(3);
    expect(pairedRows[0]).toHaveTextContent(
      "Northstar ISA£42,150.254 holdings · Tax wrapperISA Cash£1,250.40GBP · 18 transactions · Settled cash",
    );
    expect(pairedRows[1]).toHaveTextContent(
      "Joint Dealing£11,000.151 holdingISA Cash—Shared reference cash account",
    );
    expect(pairedRows[2]).toHaveTextContent(
      "Unlinked Dealing£0.000 holdingsNo reference cash account",
    );

    const standaloneRows = within(
      screen.getByRole("group", { name: "Standalone cash accounts" }),
    ).getAllByRole("listitem");

    expect(standaloneRows.map((row) => row.textContent)).toStrictEqual([
      "Reserve Cash£600.00GBP · 1 transaction",
      "Euro Cash€350.00EUR · 2 transactions",
    ]);

    expect(screen.getByText("Total portfolio")).toBeInTheDocument();
    expect(screen.getByText("£55,000.80")).toBeInTheDocument();
    expect(
      screen.getByText("Excludes EUR cash with no GBP exchange rate"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("omits the standalone ledger step and notes excluded non-GBP reference cash when no standalone cash exists", () => {
    const usdRef: CashAccount = {
      balance: 200,
      balanceGbp: null,
      currency: "USD",
      id: "cash-usd",
      isRetired: false,
      name: "USD Cash",
      transactionCount: 1,
    };
    renderAccounts({
      cashAccounts: [usdRef],
      securitiesAccounts: [
        { ...isaSecurities, referenceAccountId: "cash-usd" },
      ],
    });

    expect(
      within(
        screen.getByRole("group", { name: "Standalone cash accounts" }),
      ).getByRole("listitem"),
    ).toHaveTextContent("None");
    expect(
      screen.getByText("Excludes USD cash with no GBP exchange rate"),
    ).toBeInTheDocument();
  });

  it("shows a placeholder under securities accounts when only standalone cash accounts exist", () => {
    renderAccounts({ cashAccounts: [reserveCash], securitiesAccounts: [] });

    expect(
      within(
        screen.getByRole("group", { name: "Securities accounts" }),
      ).getByRole("listitem"),
    ).toHaveTextContent("No securities accounts");
  });

  it("hides retired accounts until Show retired accounts is switched on", () => {
    renderAccounts({
      cashAccounts: [retiredCash],
      securitiesAccounts: [retiredSecurities],
    });

    expect(
      screen.getByText("All accounts in this file are retired"),
    ).toBeInTheDocument();

    const toggle = screen.getByRole("switch", {
      name: "Show retired accounts",
    });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(screen.getByText("Closed Account")).toBeInTheDocument();
    expect(screen.getByText("Old Cash")).toBeInTheDocument();
    expect(screen.getAllByText("Retired")).toHaveLength(2);
  });

  it("shows the empty state when the file holds no accounts at all", () => {
    renderAccounts({ cashAccounts: [], securitiesAccounts: [] });

    expect(screen.getByText("No accounts in this file")).toBeInTheDocument();
  });

  it("calls the add handlers when enabled and locks both buttons with an accessible description when read-only", () => {
    const onAddSecurities = vi.fn<() => void>();
    const onAddCash = vi.fn<() => void>();
    const { rerender } = render(
      <PortfolioAccounts
        cashAccounts={[isaCash]}
        label="Sect. IX.i"
        onAddCash={onAddCash}
        onAddSecurities={onAddSecurities}
        securitiesAccounts={[isaSecurities]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add cash account" }));

    expect(onAddSecurities).toHaveBeenCalledOnce();
    expect(onAddCash).toHaveBeenCalledOnce();

    rerender(
      <>
        <p id="scenario-lock">Leave the scenario to add preview entries.</p>
        <PortfolioAccounts
          cashAccounts={[isaCash]}
          isReadOnly
          label="Sect. IX.i"
          onAddCash={onAddCash}
          onAddSecurities={onAddSecurities}
          readOnlyId="scenario-lock"
          securitiesAccounts={[isaSecurities]}
        />
      </>,
    );

    const addSecurities = screen.getByRole("button", {
      name: "Add securities account",
    });
    const addCash = screen.getByRole("button", { name: "Add cash account" });

    expect(addSecurities).toBeDisabled();
    expect(addCash).toBeDisabled();
    expect(addSecurities).toHaveAccessibleDescription(
      "Leave the scenario to add preview entries.",
    );
    expect(addCash).toHaveAccessibleDescription(
      "Leave the scenario to add preview entries.",
    );
  });

  it("opens securities and cash accounts (including revealed retired cash) by UUID and keeps retired securities non-interactive", () => {
    const onOpenSecurities = vi.fn<(portfolioId: string) => void>();
    const onOpenCash = vi.fn<(accountId: string) => void>();
    renderAccounts({
      cashAccounts: [isaCash, reserveCash, retiredCash],
      onOpenCash,
      onOpenSecurities,
      securitiesAccounts: [isaSecurities, jointSecurities, retiredSecurities],
    });

    fireEvent.click(
      screen.getByRole("switch", { name: "Show retired accounts" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Northstar ISA" }));
    expect(onOpenSecurities).toHaveBeenCalledExactlyOnceWith("sec-isa");

    const isaCashButtons = screen.getAllByRole("button", { name: "ISA Cash" });
    expect(isaCashButtons).toHaveLength(2);
    for (const button of isaCashButtons) {
      fireEvent.click(button);
    }
    fireEvent.click(screen.getByRole("button", { name: "Reserve Cash" }));
    fireEvent.click(screen.getByRole("button", { name: "Old Cash" }));
    expect(onOpenCash.mock.calls).toStrictEqual([
      ["cash-isa"],
      ["cash-isa"],
      ["cash-reserve"],
      ["cash-old"],
    ]);

    expect(
      screen.queryByRole("button", { name: "Closed Account" }),
    ).not.toBeInTheDocument();
  });

  it("renders sibling edit pencils on active/retired securities, non-shared reference cash, and standalone cash, aligns shared reference cash, and omits pencils in read-only mode", () => {
    const onEditSecurities =
      vi.fn<
        (
          account: SecuritiesAccount,
          fallbackFocusIds: readonly string[],
        ) => void
      >();
    const onEditCash =
      vi.fn<
        (account: CashAccount, fallbackFocusIds: readonly string[]) => void
      >();
    const { rerender } = render(
      <PortfolioAccounts
        cashAccounts={[isaCash, reserveCash, retiredCash]}
        label="Sect. IX.i"
        onAddCash={vi.fn<() => void>()}
        onAddSecurities={vi.fn<() => void>()}
        onEditCash={onEditCash}
        onEditSecurities={onEditSecurities}
        securitiesAccounts={[isaSecurities, jointSecurities, retiredSecurities]}
      />,
    );

    // Reveal retired accounts so retired securities account gets an edit pencil too.
    fireEvent.click(
      screen.getByRole("switch", { name: "Show retired accounts" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Northstar ISA" }));
    expect(onEditSecurities).toHaveBeenCalledWith(isaSecurities, [
      "cash:cash-isa",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Closed Account" }),
    );
    expect(onEditSecurities).toHaveBeenCalledWith(retiredSecurities, [
      "cash:cash-old",
      "securities:sec-joint",
    ]);

    // Shared ISA Cash has only ONE edit pencil (on first appearance).
    expect(
      screen.getAllByRole("button", { name: "Edit ISA Cash" }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Edit ISA Cash" }));
    expect(onEditCash).toHaveBeenCalledWith(isaCash, [
      "securities:sec-joint",
      "securities:sec-isa",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit Reserve Cash" }));
    expect(onEditCash).toHaveBeenCalledWith(reserveCash, ["cash:cash-old"]);

    // Read-only mode omits all row edit pencils.
    rerender(
      <PortfolioAccounts
        cashAccounts={[isaCash, reserveCash]}
        isReadOnly
        label="Sect. IX.i"
        onAddCash={vi.fn<() => void>()}
        onAddSecurities={vi.fn<() => void>()}
        onEditCash={onEditCash}
        onEditSecurities={onEditSecurities}
        securitiesAccounts={[isaSecurities, jointSecurities]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^Edit /u }),
    ).not.toBeInTheDocument();
  });
});
