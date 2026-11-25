import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OwnedPortfolio } from "@/store/portfolio";

import {
  addPortfolioAccount,
  addPortfolioSecurity,
  addPortfolioTransaction,
  updatePortfolioQuotes,
  uploadPortfolio,
} from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { saved } from "@/lib/answer";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";
import {
  portfolioFile,
  samplePortfolioFile,
} from "@/lib/portfolio-file.fixture";
import { commit } from "@/test/dom";

import { PortfolioScreen } from "./portfolio-screen";

vi.mock("@/actions/portfolio", () => ({
  addPortfolioAccount: vi.fn(),
  addPortfolioSecurity: vi.fn(),
  addPortfolioTransaction: vi.fn(),
  updatePortfolioQuotes: vi.fn(),
  uploadPortfolio: vi.fn(),
}));

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
  it("opens on the empty state, moves focus to h1 when the first file lands, and renders owned header actions and summary readings without View only badge", () => {
    const { rerender } = render(
      <PortfolioScreen isInScenario={false} owned={null} today="2026-09-25" />,
      { wrapper: Toaster },
    );

    expect(screen.getByText("Sect. IX · Portfolio")).toHaveClass("label");
    expect(screen.getByText("No file uploaded")).toBeInTheDocument();
    expect(screen.getByText("No portfolio file uploaded")).toBeInTheDocument();
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
    expect(screen.queryByText("View only")).not.toBeInTheDocument();
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
    expect(screen.getByText("Base currency is USD")).toBeInTheDocument();
  });

  it("cross-filters Holdings when clicking a securities account in Accounts and Transactions when clicking a cash account", () => {
    render(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
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
  });

  it("saves accounts and securities via server actions, reveals zero-share holdings after adding a security, and resets filters on file replace", async () => {
    vi.mocked(addPortfolioSecurity).mockResolvedValue(
      saved({ id: "sec-new", savedOn: "2026-09-25", version: 2 }),
    );
    vi.mocked(addPortfolioAccount).mockResolvedValue(
      saved({ id: "acc-new", savedOn: "2026-09-25", version: 3 }),
    );
    vi.mocked(uploadPortfolio).mockResolvedValue(
      saved({
        fileName: "northstar.portfolio",
        savedOn: "2026-09-25",
        version: 4,
      }),
    );

    const fileWithZero = portfolioFile([
      [1, 66],
      [
        2,
        [
          [1, "sec-world"],
          [3, "Global Equity Index"],
          [4, "GBP"],
          [
            13,
            [
              [1, 20_718],
              [2, 12_500_000_000],
            ],
          ],
        ],
      ],
      [
        2,
        [
          [1, "sec-zero"],
          [3, "Zero Share Fund"],
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
          [2, 2],
          [4, "port-isa"],
          [9, [[1, 1_789_100_000]]],
          [10, "GBP"],
          [11, 125_000],
          [12, 1_000_000_000],
          [14, "sec-world"],
        ],
      ],
      [12, "GBP"],
    ]);

    const { rerender } = render(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(fileWithZero, "northstar.portfolio", { version: 1 })}
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

    // Apply an account filter, then save a security; filter clears and Show zero-share turns ON.
    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "port-isa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "UK Gilts Fund" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(addPortfolioSecurity).toHaveBeenCalledExactlyOnceWith(1, {
        currency: "GBP",
        latestPrice: null,
        name: "UK Gilts Fund",
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "UK Gilts Fund" }),
      ).not.toBeInTheDocument();
    });
    const holdingsPanel = screen.getByRole("tabpanel");
    expect(
      within(holdingsPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("");
    expect(
      within(holdingsPanel).getByRole("switch", {
        name: "Show zero-share securities",
      }),
    ).toBeChecked();

    // A single-entry version advance with the same filename preserves the zero-share switch state.
    rerender(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(fileWithZero, "northstar.portfolio", { version: 2 })}
        today="2026-09-25"
      />,
    );
    expect(
      within(screen.getByRole("tabpanel")).getByRole("switch", {
        name: "Show zero-share securities",
      }),
    ).toBeChecked();

    // Replacing the file via PortfolioUpload (even with the same filename) resets view state cleanly.
    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: { files: [new File([fileWithZero], "northstar.portfolio")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => {
      expect(
        within(screen.getByRole("tabpanel")).getByRole("switch", {
          name: "Show zero-share securities",
        }),
      ).not.toBeChecked();
    });

    // Switch to Accounts tab to exercise Add securities / Add cash dialogs (cancel + save).
    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Untitled account" }),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add cash account" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Dollar Reserve" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(addPortfolioAccount).toHaveBeenCalledWith(2, {
        currency: "GBP",
        kind: "cash",
        name: "Dollar Reserve",
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Dollar Reserve" }),
      ).not.toBeInTheDocument();
    });
  });

  it("saves transactions and selectively clears only conflicting filters while keeping matching filters intact", async () => {
    vi.mocked(addPortfolioTransaction).mockResolvedValue(
      saved({ id: "tx-saved", savedOn: "2026-09-25", version: 2 }),
    );

    render(
      <PortfolioScreen
        initialTab="Transactions"
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const txPanel = screen.getByRole("tabpanel");

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

    // Set filters matching a Purchase on port-isa + sec-world: saving a matching purchase keeps all three filters!
    fireEvent.change(
      within(txPanel).getByRole("combobox", { name: "Account" }),
      { target: { value: "port-isa" } },
    );
    fireEvent.change(within(txPanel).getByRole("combobox", { name: "Type" }), {
      target: { value: "purchase" },
    });
    fireEvent.change(
      within(txPanel).getByRole("combobox", { name: "Security" }),
      { target: { value: "sec-world" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    commit(screen.getByRole("textbox", { name: "Shares" }), "5");
    commit(screen.getByRole("textbox", { name: "Total paid" }), "625");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Purchase · Global Equity Index",
        }),
      ).not.toBeInTheDocument();
    });
    expect(
      within(txPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("port-isa");
    expect(within(txPanel).getByRole("combobox", { name: "Type" })).toHaveValue(
      "purchase",
    );
    expect(
      within(txPanel).getByRole("combobox", { name: "Security" }),
    ).toHaveValue("sec-world");

    // Now save a cash-transfer from cash-isa to cash-reserve: conflicts with port-isa, purchase, and sec-world -> clears all three!
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    fireEvent.change(
      within(
        screen.getByRole("dialog", { name: "Purchase · Global Equity Index" }),
      ).getByRole("combobox", { name: "Type" }),
      { target: { value: "cash-transfer" } },
    );
    commit(screen.getByRole("textbox", { name: "Amount" }), "100");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        within(txPanel).getByRole("combobox", { name: "Account" }),
      ).toHaveValue("");
    });
    expect(within(txPanel).getByRole("combobox", { name: "Type" })).toHaveValue(
      "",
    );
    expect(
      within(txPanel).getByRole("combobox", { name: "Security" }),
    ).toHaveValue("");

    // Set Account filter to cash-reserve (receiving end of cash-transfer): saving a cash-transfer to cash-reserve preserves the Account filter!
    fireEvent.change(
      within(txPanel).getByRole("combobox", { name: "Account" }),
      { target: { value: "cash-reserve" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    fireEvent.change(
      within(
        screen.getByRole("dialog", { name: "Purchase · Global Equity Index" }),
      ).getByRole("combobox", { name: "Type" }),
      { target: { value: "cash-transfer" } },
    );
    commit(screen.getByRole("textbox", { name: "Amount" }), "50");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "New cash transfer" }),
      ).not.toBeInTheDocument();
    });
    expect(
      within(txPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("cash-reserve");
  });

  it("shows distinct scenario cautions, locks controls, and auto-closes open dialogs if isInScenario turns true", () => {
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

    // Open Add security while unlocked, then flip isInScenario to true -> dialog closes automatically.
    rerender(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add security" }));
    expect(
      screen.getByRole("dialog", { name: "Untitled security" }),
    ).toBeInTheDocument();

    rerender(
      <PortfolioScreen
        isInScenario
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
    );
    expect(
      screen.queryByRole("dialog", { name: "Untitled security" }),
    ).not.toBeInTheDocument();

    // Leaving scenario mode does not ghost-reopen the closed dialog.
    rerender(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
    );
    expect(
      screen.queryByRole("dialog", { name: "Untitled security" }),
    ).not.toBeInTheDocument();

    // Re-enter scenario mode to verify every locked action description.
    rerender(
      <PortfolioScreen
        isInScenario
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
    );

    const expectedOwnedDescription =
      "Portfolio belongs to the household Leave the scenario to replace the file or update the portfolio.";
    const replace = screen.getByRole("button", { name: "Replace file…" });
    expect(replace).toBeDisabled();
    expect(replace).toHaveAccessibleDescription(expectedOwnedDescription);

    const addSecurity = screen.getByRole("button", { name: "Add security" });
    expect(addSecurity).toBeDisabled();
    expect(addSecurity).toHaveAccessibleDescription(expectedOwnedDescription);

    const updateQuotes = screen.getByRole("button", { name: "Update quotes" });
    expect(updateQuotes).toBeDisabled();
    expect(updateQuotes).toHaveAccessibleDescription(expectedOwnedDescription);

    fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));
    expect(
      screen.getByRole("button", { name: "Add securities account" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Add cash account" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    const addTransaction = screen.getByRole("button", {
      name: "Add transaction",
    });
    expect(addTransaction).toBeDisabled();
    expect(addTransaction).toHaveAccessibleDescription(
      expectedOwnedDescription,
    );
  });

  it("resets Show retired accounts when a different filename lands and counts retired held securities in PortfolioSummary", () => {
    const fileWithRetired = portfolioFile([
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

    const { rerender } = render(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        owned={ownedOf(fileWithRetired, "first.portfolio", { version: 1 })}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(
      screen
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual(["£50.00", "£0.00", "1 security", "No quotes yet"]);

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
      screen.getByRole("switch", { name: "Show retired accounts" }),
    ).not.toBeChecked();
  });

  it("enables the Transactions inactive toggle when opening a retired cash account and clears hidden filters when toggled off", () => {
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
          [3, "cash-old"],
          [9, [[1, 1_789_200_000]]],
          [10, "GBP"],
          [11, 50_000],
        ],
      ],
      [12, "GBP"],
    ]);

    render(
      <PortfolioScreen
        initialTab="Accounts"
        isInScenario={false}
        owned={ownedOf(fileWithInactive, "first.portfolio", { version: 1 })}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Show retired accounts" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Closed Cash" }));

    const txPanel = screen.getByRole("tabpanel");
    const inactiveSwitch = within(txPanel).getByRole("switch", {
      name: "Show retired & zero-share in filters",
    });
    expect(inactiveSwitch).toBeChecked();
    expect(
      within(txPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("cash-old");

    fireEvent.click(inactiveSwitch);
    expect(
      within(txPanel).getByRole("combobox", { name: "Account" }),
    ).toHaveValue("");
  });

  it("opens, cancels, saves, and scenario-resets Update quotes without ghost-reopening after leaving a scenario", async () => {
    vi.mocked(updatePortfolioQuotes).mockResolvedValue(
      saved({ savedOn: "2026-09-25", updatedCount: 1, version: 2 }),
    );

    const { rerender } = render(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    fireEvent.click(screen.getByRole("button", { name: "Update quotes" }));
    expect(
      screen.getByRole("dialog", { name: "Update quotes" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Update quotes" }),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Update quotes" }));
    const quotesDialog = screen.getByRole("dialog", { name: "Update quotes" });
    commit(
      within(quotesDialog).getByRole("textbox", {
        name: "Global Equity Index (GBP)",
      }),
      "130.5",
    );
    fireEvent.click(within(quotesDialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updatePortfolioQuotes).toHaveBeenCalledExactlyOnceWith(1, {
        date: "2026-09-25",
        quotes: [{ price: 130.5, securityId: "sec-world" }],
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Update quotes" }),
      ).not.toBeInTheDocument();
    });

    // Entering and then leaving scenario mode closes Update quotes permanently without ghost-reopening.
    fireEvent.click(screen.getByRole("button", { name: "Update quotes" }));
    expect(
      screen.getByRole("dialog", { name: "Update quotes" }),
    ).toBeInTheDocument();

    rerender(
      <PortfolioScreen
        isInScenario
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
    );
    expect(
      screen.queryByRole("dialog", { name: "Update quotes" }),
    ).not.toBeInTheDocument();

    rerender(
      <PortfolioScreen
        isInScenario={false}
        owned={ownedOf(gbpFile, "northstar.portfolio")}
        today="2026-09-25"
      />,
    );
    expect(
      screen.queryByRole("dialog", { name: "Update quotes" }),
    ).not.toBeInTheDocument();
  });
});
