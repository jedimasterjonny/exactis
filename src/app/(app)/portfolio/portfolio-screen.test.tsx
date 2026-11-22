import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Toaster } from "@/components/kit/toast";
import {
  portfolioFile,
  samplePortfolioFile,
} from "@/lib/portfolio-file.fixture";
import { commit } from "@/test/dom";

import { PortfolioScreen } from "./portfolio-screen";

const gbpFile = samplePortfolioFile("GBP");
const usdFile = samplePortfolioFile("USD");

function openPortfolio(bytes: Uint8Array<ArrayBuffer>, name: string): void {
  fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
    target: { files: [new File([bytes], name)] },
  });
}

describe("PortfolioScreen", () => {
  it("opens on the empty state, reads a chosen file, and renders Holdings and Accounts tabs with summary readings", async () => {
    render(<PortfolioScreen isInScenario={false} today="2026-09-25" />, {
      wrapper: Toaster,
    });

    expect(screen.getByText("Sect. IX · Portfolio")).toHaveClass("label");
    expect(screen.getByText("No file open")).toBeInTheDocument();
    expect(screen.getByText("No portfolio file open")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The file is read in your browser and never leaves this device.",
      ),
    ).toBeInTheDocument();

    openPortfolio(gbpFile, "northstar.portfolio");

    expect(
      await screen.findByText("northstar.portfolio · GBP"),
    ).toBeInTheDocument();
    expect(screen.getByText("View only")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: /^The portfolio holds/ }),
    ).toHaveTextContent(
      "The portfolio holds £2,500 across 1 securities account and 2 cash accounts, with £1,250 uninvested.",
    );
    expect(
      screen
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual([
      "£1,250.00",
      "£1,250.00",
      "1 security",
      "22 Sep 2026 · 3 days old",
    ]);
    expect(screen.getByRole("tab", { name: "Holdings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(screen.getByRole("tabpanel")).getAllByText("Global Equity Index"),
    ).toHaveLength(2);
    expect(
      screen.queryByText("Portfolio belongs to the household"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Base currency is/)).not.toBeInTheDocument();
  });

  it("cross-filters Holdings when clicking a securities account in Accounts and restores focus to the Holdings panel", async () => {
    render(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    openPortfolio(gbpFile, "northstar.portfolio");
    await screen.findByText("northstar.portfolio · GBP");

    expect(screen.getByRole("tab", { name: "Accounts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const northstarButton = screen.getByRole("button", {
      name: "Northstar ISA",
    });
    northstarButton.focus();
    fireEvent.click(northstarButton);

    const holdingsPanel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: "Holdings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(holdingsPanel).toHaveFocus();
    expect(
      within(holdingsPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("port-isa");
    expect(
      within(holdingsPanel).getByText("Northstar ISA subtotal"),
    ).toBeInTheDocument();

    // Switch back to Accounts and drill down from a cash account into filtered Transactions.
    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));
    const cashButton = screen.getByRole("button", { name: "Reserve Cash" });
    cashButton.focus();
    fireEvent.click(cashButton);

    const transactionsPanel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: "Transactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(transactionsPanel).toHaveFocus();
    expect(
      within(transactionsPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("cash-reserve");
    expect(
      within(transactionsPanel).getByText("1 transaction"),
    ).toBeInTheDocument();
  });

  it("adds preview securities with auto-reveal of zero-share rows, adds preview accounts, clears preview, and resets on file switch", async () => {
    render(<PortfolioScreen isInScenario={false} today="2026-09-25" />, {
      wrapper: Toaster,
    });

    openPortfolio(gbpFile, "northstar.portfolio");
    await screen.findByText("northstar.portfolio · GBP");

    // Open and cancel Add security first.
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Add a full GBX preview security while an account filter is active;
    // it auto-clears the filter and turns on Show zero-share securities so the row is visible immediately.
    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "port-isa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "UK Gilts Preview" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Currency" }), {
      target: { value: "GBX" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "ISIN" }), {
      target: { value: "GB00TEST0002" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Ticker" }), {
      target: { value: "UKGP" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Asset class" }), {
      target: { value: "Global equity" },
    });
    commit(
      screen.getByRole("textbox", { name: "Latest price (pence)" }),
      "214.015",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Draft gilt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    const holdingsPanel = screen.getByRole("tabpanel");
    expect(
      await within(holdingsPanel).findAllByText("UK Gilts Preview"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("dialog", { name: "Security added to preview" }),
    ).toHaveAccessibleDescription(
      "Shown in this view only. Changes are not saved to the file yet.",
    );
    expect(
      within(holdingsPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("");
    expect(
      within(holdingsPanel).getByRole("switch", {
        name: "Show zero-share securities",
      }),
    ).toBeChecked();

    // Add minimal USD and GBP preview securities to cover all draft currency branches.
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "US Preview ETF" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Currency" }), {
      target: { value: "USD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(holdingsPanel).findAllByText("US Preview ETF"),
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Sterling Preview Bond" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(holdingsPanel).findAllByText("Sterling Preview Bond"),
    ).toHaveLength(2);

    // Switch to Accounts tab to add preview securities and cash accounts.
    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Harbour GIA" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Reference cash account" }),
      { target: { value: "cash-reserve" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Draft dealing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    const accountsPanel = screen.getByRole("tabpanel");
    expect(
      await within(accountsPanel).findByRole("button", { name: "Harbour GIA" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Direct Certs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(accountsPanel).findByRole("button", {
        name: "Direct Certs",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add cash account" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Dollar Reserve" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Currency" }), {
      target: { value: "USD" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "FX pot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(accountsPanel).findByRole("button", {
        name: "Dollar Reserve",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add cash account" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Euro Float" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(accountsPanel).findByRole("button", { name: "Euro Float" }),
    ).toBeInTheDocument();

    // Real-file headline and summary KPIs stay unchanged despite preview entries,
    // while newly previewed cash accounts are selectable as reference accounts.
    expect(
      screen.getByRole("heading", { level: 2, name: /^The portfolio holds/ }),
    ).toHaveTextContent(
      "The portfolio holds £2,500 across 1 securities account and 2 cash accounts, with £1,250 uninvested.",
    );
    expect(
      screen
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toContain("1 security");

    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    expect(
      screen.getByRole("option", { name: "Dollar Reserve (USD)" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Clear preview removes draft accounts and draft securities alike.
    fireEvent.click(screen.getByRole("button", { name: "Clear preview" }));
    expect(screen.queryByText("Harbour GIA")).not.toBeInTheDocument();
    expect(screen.queryByText("Dollar Reserve")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Preview entries are kept in this browser tab only"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Holdings" }));
    expect(screen.queryByText("UK Gilts Preview")).not.toBeInTheDocument();

    // Add one preview security again and switch to a USD-base file to verify reset and non-GBP caution.
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Temporary Fund" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(screen.getByRole("tabpanel")).findAllByText(
        "Temporary Fund",
      ),
    ).toHaveLength(2);

    openPortfolio(usdFile, "dollar.portfolio");

    expect(
      await screen.findByText("dollar.portfolio · USD"),
    ).toBeInTheDocument();
    expect(screen.getByText("Base currency is USD")).toBeInTheDocument();
    expect(screen.queryByText("Temporary Fund")).not.toBeInTheDocument();
  });

  it("shows the scenario caution and describes disabled add buttons on both tabs when a scenario is open", async () => {
    render(<PortfolioScreen isInScenario today="2026-09-25" />, {
      wrapper: Toaster,
    });

    openPortfolio(gbpFile, "northstar.portfolio");

    expect(
      await screen.findByText("Portfolio belongs to the household"),
    ).toBeInTheDocument();

    const addSecurity = screen.getByRole("button", { name: "Add security" });
    expect(addSecurity).toBeDisabled();
    expect(addSecurity).toHaveAccessibleDescription(
      "Portfolio belongs to the household Leave the scenario to add preview entries.",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));

    const addSecurities = screen.getByRole("button", {
      name: "Add securities account",
    });
    const addCash = screen.getByRole("button", { name: "Add cash account" });

    expect(addSecurities).toBeDisabled();
    expect(addCash).toBeDisabled();
    expect(addSecurities).toHaveAccessibleDescription(
      "Portfolio belongs to the household Leave the scenario to add preview entries.",
    );
    expect(addCash).toHaveAccessibleDescription(
      "Portfolio belongs to the household Leave the scenario to add preview entries.",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    const addTransaction = screen.getByRole("button", {
      name: "Add transaction",
    });
    expect(addTransaction).toBeDisabled();
    expect(addTransaction).toHaveAccessibleDescription(
      "Portfolio belongs to the household Leave the scenario to add preview entries.",
    );
  });

  it("opens on ?tab=transactions, adds preview purchase and transfers, clears filters on add, and clears preview transactions", async () => {
    render(
      <PortfolioScreen
        initialTab="Transactions"
        isInScenario={false}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    openPortfolio(gbpFile, "northstar.portfolio");
    await screen.findByText("northstar.portfolio · GBP");

    expect(screen.getByRole("tab", { name: "Transactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Add a second preview securities account so security-transfer can also be exercised.
    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Harbour GIA" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));

    // Open and cancel Add transaction first.
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(
      screen.getByRole("dialog", { name: "Purchase · Global Equity Index" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Purchase · Global Equity Index",
        }),
      ).not.toBeInTheDocument();
    });

    // Apply a filter, then add a preview purchase; filters reset so the new entry shows immediately.
    const txPanel = screen.getByRole("tabpanel");
    fireEvent.change(within(txPanel).getByRole("combobox", { name: "Type" }), {
      target: { value: "deposit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    commit(screen.getByRole("textbox", { name: "Shares" }), "5");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "625");
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Preview buy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(
      await screen.findByRole("dialog", {
        name: "Transaction added to preview",
      }),
    ).toHaveAccessibleDescription(
      "Shown in this view only. Changes are not saved to the file yet.",
    );
    expect(within(txPanel).getByRole("combobox", { name: "Type" })).toHaveValue(
      "",
    );
    expect(within(txPanel).getAllByText("Preview buy")).toHaveLength(2);

    // Add a preview cash transfer and security transfer to cover every reference-name branch.
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    fireEvent.change(
      within(
        screen.getByRole("dialog", { name: "Purchase · Global Equity Index" }),
      ).getByRole("combobox", { name: "Type" }),
      { target: { value: "cash-transfer" } },
    );
    commit(screen.getByRole("textbox", { name: "Amount" }), "100");
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(txPanel).findByRole("cell", {
        name: "Northstar ISA Cash → Reserve Cash",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    fireEvent.change(
      within(
        screen.getByRole("dialog", { name: "Purchase · Global Equity Index" }),
      ).getByRole("combobox", { name: "Type" }),
      { target: { value: "security-transfer" } },
    );
    commit(screen.getByRole("textbox", { name: "Shares" }), "2");
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(txPanel).findByRole("cell", {
        name: "Northstar ISA → Harbour GIA",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear preview" }));
    expect(within(txPanel).queryByText("Preview buy")).not.toBeInTheDocument();
  });

  it("resets Show retired accounts when switching to another file", async () => {
    const fileWithRetired = portfolioFile([
      [
        3,
        [
          [1, "cash-old"],
          [2, "Closed Cash"],
          [3, "GBP"],
          [5, 1],
        ],
      ],
      [12, "GBP"],
    ]);

    render(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    openPortfolio(fileWithRetired, "first.portfolio");
    const toggle = await screen.findByRole("switch", {
      name: "Show retired accounts",
    });
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();

    openPortfolio(fileWithRetired, "second.portfolio");
    expect(
      await screen.findByText("second.portfolio · GBP"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Show retired accounts" }),
    ).not.toBeChecked();
  });

  it("counts retired securities with positive shares in PortfolioSummary so the summary matches HoldingsTable", async () => {
    const fileWithRetiredHeld = portfolioFile([
      [
        2,
        [
          [1, "sec-active"],
          [3, "Global Equity Index"],
          [4, "GBP"],
          [16, [[2, 10_000_000_000]]],
        ],
      ],
      [
        2,
        [
          [1, "sec-retired"],
          [3, "Legacy Income Trust"],
          [4, "GBP"],
          [16, [[2, 5_000_000_000]]],
          [20, 1],
        ],
      ],
      [
        4,
        [
          [1, "port-isa"],
          [2, "Northstar ISA"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-isa"],
          [12, 200_000_000],
          [14, "sec-active"],
        ],
      ],
      [
        5,
        [
          [2, 2],
          [4, "port-isa"],
          [12, 100_000_000],
          [14, "sec-retired"],
        ],
      ],
      [12, "GBP"],
    ]);

    render(<PortfolioScreen isInScenario={false} today="2026-09-25" />, {
      wrapper: Toaster,
    });

    openPortfolio(fileWithRetiredHeld, "legacy.portfolio");
    await screen.findByText("legacy.portfolio · GBP");

    expect(
      screen
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual(["£250.00", "£0.00", "2 securities", "No quotes yet"]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getAllByText("Retired")[1]).toHaveAttribute(
      "data-variant",
      "outline",
    );
  });
});
