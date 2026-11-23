import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OwnedPortfolio } from "@/store/portfolio";

import { Toaster } from "@/components/kit/toast";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";
import {
  portfolioFile,
  samplePortfolioFile,
} from "@/lib/portfolio-file.fixture";
import { commit } from "@/test/dom";

import { PortfolioScreen } from "./portfolio-screen";

vi.mock("@/actions/portfolio", () => ({ uploadPortfolio: vi.fn() }));

const gbpFile = samplePortfolioFile("GBP");
const usdFile = samplePortfolioFile("USD");

function ownedOf(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  {
    savedOn = "2026-09-24",
    version = 1,
  }: { readonly savedOn?: string; readonly version?: number } = {},
): OwnedPortfolio {
  return { savedOn, snapshot: readPortfolioSnapshot(bytes, name), version };
}

describe("PortfolioScreen", () => {
  it("opens on the empty state, moves focus to h1 when the first file lands, and renders owned header actions and summary readings", () => {
    const { rerender } = render(
      <PortfolioScreen isInScenario={false} owned={null} today="2026-09-25" />,
      { wrapper: Toaster },
    );

    expect(screen.getByText("Sect. IX · Portfolio")).toHaveClass("label");
    expect(screen.getByText("No file uploaded")).toBeInTheDocument();
    expect(screen.getByText("No portfolio file uploaded")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Stored with the household, not in scenarios. Accepts a Portfolio Performance file saved in binary without a password, up to 4 MB.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload .portfolio file" }),
    ).toBeEnabled();

    rerender(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    const meta = screen.getByText(
      "northstar.portfolio · GBP · Saved 24 Sep 2026",
    );
    expect(meta).toHaveClass("min-w-0", "wrap-anywhere");
    expect(screen.getByText("View only")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    const download = screen.getByRole("link", { name: "Download .portfolio" });
    expect(download).toHaveAttribute("href", "/portfolio/download");
    expect(download).not.toHaveAttribute("download");
    expect(screen.getByRole("button", { name: "Replace file…" })).toBeEnabled();
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

  it("does not steal focus to h1 on initial owned mount or on version replacement", () => {
    const { rerender } = render(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio", { version: 1 })}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).not.toHaveFocus();

    const replace = screen.getByRole("button", { name: "Replace file…" });
    replace.focus();
    expect(replace).toHaveFocus();

    rerender(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(usdFile, "dollar.portfolio", {
          savedOn: "2026-09-25",
          version: 2,
        })}
        today="2026-09-25"
      />,
    );

    expect(heading).not.toHaveFocus();
    expect(replace).toHaveFocus();
  });

  it("cross-filters Holdings when clicking a securities account in Accounts and restores focus to the Holdings panel", () => {
    render(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

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

  it("adds preview entries, warns in Replace ConfirmDialog, clears preview, and resets drafts when version advances", async () => {
    const { rerender } = render(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio", { version: 1 })}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

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

    // Choosing a replacement file while preview entries exist warns in ConfirmDialog.
    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: { files: [new File([usdFile], "dollar.portfolio")] },
    });
    expect(
      screen.getByRole("alertdialog", { name: "Replace portfolio file?" }),
    ).toHaveAccessibleDescription(
      "dollar.portfolio replaces northstar.portfolio for the household, kept as the next version. Download .portfolio first to keep a copy of the current file. Unsaved preview entries in this tab will be cleared.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

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

    // Add a preview security on v1, then advance to a v2 USD-base file:
    // drafts from v1 are cleared, Base currency caution shows, and a fresh v2 preview starts clean.
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

    rerender(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(usdFile, "dollar.portfolio", {
          savedOn: "2026-09-25",
          version: 2,
        })}
        today="2026-09-25"
      />,
    );

    expect(
      screen.getByText("dollar.portfolio · USD · Saved 25 Sep 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("Base currency is USD")).toBeInTheDocument();
    expect(screen.queryByText("Temporary Fund")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Preview entries are kept in this browser tab only"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Second Version Fund" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(
      await within(screen.getByRole("tabpanel")).findAllByText(
        "Second Version Fund",
      ),
    ).toHaveLength(2);
    expect(screen.queryByText("Temporary Fund")).not.toBeInTheDocument();
  });

  it("shows distinct scenario cautions and describes disabled upload, replace, and add controls in both empty and owned states", () => {
    const { rerender } = render(
      <PortfolioScreen isInScenario owned={null} today="2026-09-25" />,
      { wrapper: Toaster },
    );

    const upload = screen.getByRole("button", {
      name: "Upload .portfolio file",
    });
    expect(upload).toBeDisabled();
    expect(upload).toHaveAccessibleDescription(
      "Portfolio belongs to the household Leave the scenario to upload a portfolio file.",
    );

    rerender(
      <PortfolioScreen
        isInScenario
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
    );

    const expectedOwnedDescription =
      "Portfolio belongs to the household Leave the scenario to replace the file or add preview entries.";
    const replace = screen.getByRole("button", { name: "Replace file…" });
    expect(replace).toBeDisabled();
    expect(replace).toHaveAccessibleDescription(expectedOwnedDescription);
    expect(
      screen.getByRole("link", { name: "Download .portfolio" }),
    ).toHaveAttribute("href", "/portfolio/download");

    const addSecurity = screen.getByRole("button", { name: "Add security" });
    expect(addSecurity).toBeDisabled();
    expect(addSecurity).toHaveAccessibleDescription(expectedOwnedDescription);

    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));

    const addSecurities = screen.getByRole("button", {
      name: "Add securities account",
    });
    const addCash = screen.getByRole("button", { name: "Add cash account" });
    expect(addSecurities).toBeDisabled();
    expect(addCash).toBeDisabled();
    expect(addSecurities).toHaveAccessibleDescription(expectedOwnedDescription);
    expect(addCash).toHaveAccessibleDescription(expectedOwnedDescription);

    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    const addTransaction = screen.getByRole("button", {
      name: "Add transaction",
    });
    expect(addTransaction).toBeDisabled();
    expect(addTransaction).toHaveAccessibleDescription(
      expectedOwnedDescription,
    );
  });

  it("opens on ?tab=transactions, adds preview purchase and transfers, clears filters on add, and clears preview transactions", async () => {
    render(
      <PortfolioScreen
        initialTab="Transactions"
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

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

  it("resets Show retired accounts when the stored file version advances", () => {
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

    const { rerender } = render(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        owned={ownedOf(fileWithRetired, "first.portfolio", { version: 1 })}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const toggle = screen.getByRole("switch", {
      name: "Show retired accounts",
    });
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();

    rerender(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        owned={ownedOf(fileWithRetired, "second.portfolio", { version: 2 })}
        today="2026-09-25"
      />,
    );

    expect(
      screen.getByText("second.portfolio · GBP · Saved 24 Sep 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Show retired accounts" }),
    ).not.toBeChecked();
  });

  it("counts retired securities with positive shares in PortfolioSummary so the summary matches HoldingsTable", () => {
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

    render(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(fileWithRetiredHeld, "legacy.portfolio")}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

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

  it("enables the Transactions inactive toggle when opening a retired cash account, handles toggling off end-to-end, and resets when version advances", () => {
    const fileWithInactive = portfolioFile([
      [1, 66],
      [
        2,
        [
          [1, "sec-world"],
          [3, "Global Equity Index"],
          [4, "GBP"],
          [16, [[2, 12_500_000_000]]],
        ],
      ],
      [
        2,
        [
          [1, "sec-sold"],
          [3, "Cleared Equity Fund"],
          [4, "GBP"],
        ],
      ],
      [
        3,
        [
          [1, "cash-isa"],
          [2, "Northstar ISA Cash"],
          [3, "GBP"],
        ],
      ],
      [
        3,
        [
          [1, "cash-old"],
          [2, "Closed Cash"],
          [3, "GBP"],
          [5, 1],
        ],
      ],
      [
        4,
        [
          [1, "port-isa"],
          [2, "Northstar ISA"],
          [5, "cash-isa"],
        ],
      ],
      [
        5,
        [
          [1, "tx-1"],
          [2, 6],
          [3, "cash-isa"],
          [9, [[1, 1_789_000_000]]],
          [10, "GBP"],
          [11, 200_000],
        ],
      ],
      [
        5,
        [
          [1, "tx-2"],
          [2, 0],
          [3, "cash-isa"],
          [4, "port-isa"],
          [9, [[1, 1_789_100_000]]],
          [10, "GBP"],
          [11, 125_000],
          [12, 1_000_000_000],
          [14, "sec-world"],
        ],
      ],
      [
        5,
        [
          [1, "tx-3"],
          [2, 6],
          [3, "cash-old"],
          [9, [[1, 1_789_200_000]]],
          [10, "GBP"],
          [11, 50_000],
        ],
      ],
      [12, "GBP"],
    ]);

    const { rerender } = render(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        owned={ownedOf(fileWithInactive, "first.portfolio", { version: 1 })}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const retiredAccountsSwitch = screen.getByRole("switch", {
      name: "Show retired accounts",
    });
    fireEvent.click(retiredAccountsSwitch);
    fireEvent.click(screen.getByRole("button", { name: "Closed Cash" }));

    const txPanel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: "Transactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const inactiveSwitch = within(txPanel).getByRole("switch", {
      name: "Show retired & zero-share in filters",
    });
    expect(inactiveSwitch).toBeChecked();
    expect(
      within(txPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("cash-old");
    expect(within(txPanel).getByText("1 transaction")).toBeInTheDocument();

    // Select the zero-share security alongside the retired cash account, then switch OFF;
    // both hidden selections clear and all historical transactions remain visible.
    fireEvent.change(
      within(txPanel).getByRole("combobox", { name: "Security" }),
      { target: { value: "sec-sold" } },
    );
    fireEvent.click(inactiveSwitch);

    expect(inactiveSwitch).not.toBeChecked();
    expect(
      within(txPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("");
    expect(
      within(txPanel).getByRole("combobox", { name: "Security" }),
    ).toHaveValue("");
    expect(within(txPanel).getByText("3 transactions")).toBeInTheDocument();
    expect(
      within(txPanel).queryByRole("option", { name: "Closed Cash (retired)" }),
    ).not.toBeInTheDocument();
    expect(
      within(txPanel).queryByRole("option", {
        name: "Cleared Equity Fund (0 shares)",
      }),
    ).not.toBeInTheDocument();

    // Toggling ON, selecting active filters, and toggling OFF keeps active filters selected.
    fireEvent.click(inactiveSwitch);
    expect(inactiveSwitch).toBeChecked();
    fireEvent.change(
      within(txPanel).getByRole("combobox", { name: "Account" }),
      { target: { value: "cash-isa" } },
    );
    fireEvent.change(
      within(txPanel).getByRole("combobox", { name: "Security" }),
      { target: { value: "sec-world" } },
    );
    fireEvent.click(inactiveSwitch);

    expect(inactiveSwitch).not.toBeChecked();
    expect(
      within(txPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("cash-isa");
    expect(
      within(txPanel).getByRole("combobox", { name: "Security" }),
    ).toHaveValue("sec-world");

    // Advancing the stored version resets the Transactions inactive toggle back to OFF
    // while keeping the Transactions tab active.
    fireEvent.click(inactiveSwitch);
    expect(inactiveSwitch).toBeChecked();

    rerender(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        owned={ownedOf(fileWithInactive, "second.portfolio", { version: 2 })}
        today="2026-09-25"
      />,
    );

    expect(
      screen.getByText("second.portfolio · GBP · Saved 24 Sep 2026"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Transactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(screen.getByRole("tabpanel")).getByRole("switch", {
        name: "Show retired & zero-share in filters",
      }),
    ).not.toBeChecked();
  });

  it("keeps newly added preview securities selectable in Transactions filters without enabling the inactive toggle", () => {
    render(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Preview Gilts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    const txPanel = screen.getByRole("tabpanel");

    expect(within(txPanel).queryByRole("switch")).not.toBeInTheDocument();
    expect(
      within(txPanel).getByRole("option", { name: "Preview Gilts" }),
    ).toBeInTheDocument();
  });
});
