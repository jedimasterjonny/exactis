import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortfolioSnapshot } from "@/data/portfolio";
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
  fetchPortfolioQuotes: vi.fn(),
  updatePortfolioQuotes: vi.fn(),
  uploadPortfolio: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

const gbpFile = samplePortfolioFile("GBP");
const usdFile = samplePortfolioFile("USD");
const routerReplace = vi.fn<ReturnType<typeof useRouter>["replace"]>();

const multiAccountSnapshot: PortfolioSnapshot = {
  baseCurrency: "GBP",
  cashAccounts: [
    {
      balance: 1500,
      balanceGbp: 1500,
      currency: "GBP",
      id: "cash-isa",
      isRetired: false,
      name: "Northstar ISA Cash",
      transactionCount: 2,
    },
    {
      balance: 900,
      balanceGbp: 900,
      currency: "GBP",
      id: "cash-gia",
      isRetired: false,
      name: "Dealing Cash",
      transactionCount: 1,
    },
  ],
  categories: [
    {
      id: "cat-equity",
      name: "Global Equity",
      securityIds: ["sec-alpha", "sec-beta", "sec-gamma", "sec-retired"],
    },
    {
      id: "cat-gilts",
      name: "UK Gilts",
      securityIds: ["sec-gilt", "sec-retired"],
    },
    { id: "cat-empty", name: "Commodities", securityIds: ["sec-retired"] },
    {
      id: "cat-mixed",
      name: "Mixed Sleeve",
      securityIds: ["sec-gilt", "sec-gamma"],
    },
    {
      id: "cat-unheld",
      name: "Unheld Sleeve",
      securityIds: ["sec-gamma", "sec-delta"],
    },
  ],
  fileName: "multi.portfolio",
  gbpRates: Object.fromEntries([
    ["GBP", 1],
    ["GBX", 0.01],
  ]),
  holdings: [
    {
      category: "Global Equity",
      categoryId: "cat-global",
      currency: "GBP",
      gbpRate: 1,
      id: "sec-alpha",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 120,
      latestPriceDate: "2026-09-22",
      name: "Alpha World Equity",
      shares: 10,
      sharesByAccount: [
        { portfolioId: "port-isa", shares: 10 },
        { portfolioId: "port-gia", shares: 0 },
      ],
      transactionCount: 1,
    },
    {
      category: "Global Equity",
      categoryId: "cat-global",
      currency: "GBP",
      gbpRate: 1,
      id: "sec-beta",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 80,
      latestPriceDate: "2026-09-22",
      name: "Beta Core Equity",
      shares: 5,
      sharesByAccount: [{ portfolioId: "port-isa", shares: 5 }],
      transactionCount: 1,
    },
    {
      category: "Global Equity",
      categoryId: "cat-global",
      currency: "GBP",
      gbpRate: 1,
      id: "sec-gamma",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 60,
      latestPriceDate: "2026-09-22",
      name: "Gamma Unheld Equity",
      shares: 0,
      sharesByAccount: [],
      transactionCount: 0,
    },
    {
      category: "Unheld Sleeve",
      categoryId: "cat-unheld",
      currency: "GBP",
      gbpRate: 1,
      id: "sec-delta",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 40,
      latestPriceDate: "2026-09-22",
      name: "Delta Reserve Equity",
      shares: 0,
      sharesByAccount: [],
      transactionCount: 0,
    },
    {
      category: "UK Gilts",
      categoryId: "cat-gilts",
      currency: "GBP",
      gbpRate: 1,
      id: "sec-gilt",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 50,
      latestPriceDate: "2026-09-22",
      name: "Sovereign Gilts Fund",
      shares: 8,
      sharesByAccount: [{ portfolioId: "port-gia", shares: 8 }],
      transactionCount: 1,
    },
    {
      currency: "GBP",
      gbpRate: 1,
      id: "sec-retired",
      isRetired: true,
      isSplitCategory: false,
      latestPrice: 50,
      latestPriceDate: "2026-09-22",
      name: "Retired Index Fund",
      shares: 0,
      sharesByAccount: [],
      transactionCount: 0,
    },
  ],
  latestQuoteDate: "2026-09-22",
  securitiesAccounts: [
    {
      holdingsCount: 2,
      id: "port-isa",
      isRetired: false,
      marketValue: 1600,
      name: "Northstar ISA",
      referenceAccountId: "cash-isa",
      transactionCount: 2,
    },
    {
      holdingsCount: 1,
      id: "port-gia",
      isRetired: false,
      marketValue: 400,
      name: "Dealing Account",
      referenceAccountId: "cash-gia",
      transactionCount: 1,
    },
    {
      holdingsCount: 0,
      id: "port-old",
      isRetired: true,
      marketValue: 0,
      name: "Closed Brokerage",
      transactionCount: 0,
    },
  ],
  totalCash: 2400,
  totalInvested: 2000,
  transactions: [],
};

const ownedMulti: OwnedPortfolio = {
  savedOn: "2026-09-24",
  snapshot: multiAccountSnapshot,
  version: 1,
};

const ownedSingleAccountWithCategories: OwnedPortfolio = {
  savedOn: "2026-09-24",
  snapshot: {
    ...multiAccountSnapshot,
    securitiesAccounts: multiAccountSnapshot.securitiesAccounts.filter(
      (account) => account.id === "port-gia" || account.isRetired,
    ),
  },
  version: 1,
};

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
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({
      back: vi.fn<() => void>(),
      bfcacheId: "",
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<() => void>(),
      push: vi.fn<() => void>(),
      refresh: vi.fn<() => void>(),
      replace: routerReplace,
    });
  });
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

  it("opens on Transactions with prefilled trade handoff fields for a matching account and security", () => {
    const { unmount } = render(
      <PortfolioScreen
        initialTab="Accounts"
        initialTrade={{
          amount: 1250,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("tab", { hidden: true, name: "Transactions" }),
    ).toHaveAttribute("aria-selected", "true");
    const purchaseDialog = screen.getByRole("dialog", {
      name: "Purchase · Alpha World Equity",
    });
    expect(
      within(purchaseDialog).getByRole("combobox", { name: "Type" }),
    ).toHaveValue("purchase");
    expect(
      within(purchaseDialog).getByRole("combobox", {
        name: "Securities account",
      }),
    ).toHaveValue("port-isa");
    expect(
      within(purchaseDialog).getByRole("combobox", { name: "Cash account" }),
    ).toHaveValue("cash-isa");
    expect(
      within(purchaseDialog).getByRole("combobox", { name: "Security" }),
    ).toHaveValue("sec-alpha");
    expect(
      within(purchaseDialog).getByRole("textbox", { name: "Total paid" }),
    ).toHaveValue("£1,250.00");
    const sharesInput = within(purchaseDialog).getByRole("textbox", {
      name: "Shares",
    });
    expect(sharesInput).toHaveValue("");
    expect(sharesInput).toHaveAccessibleDescription("Enter executed shares");

    unmount();

    render(
      <PortfolioScreen
        initialTrade={{
          amount: 800.5,
          portfolioId: "port-gia",
          securityId: "sec-gilt",
          type: "sale",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const saleDialog = screen.getByRole("dialog", {
      name: "Sale · Sovereign Gilts Fund",
    });
    expect(
      within(saleDialog).getByRole("combobox", { name: "Type" }),
    ).toHaveValue("sale");
    expect(
      within(saleDialog).getByRole("combobox", { name: "Securities account" }),
    ).toHaveValue("port-gia");
    expect(
      within(saleDialog).getByRole("combobox", { name: "Cash account" }),
    ).toHaveValue("cash-gia");
    expect(
      within(saleDialog).getByRole("textbox", { name: "Net proceeds" }),
    ).toHaveValue("£800.50");
  });

  it("handles missing, retired, or unknown portfolioId and securityId handoff targets safely", () => {
    // Missing portfolioId with >1 active securities accounts -> explicit blank + hint; omitted securityId -> first holding.
    const { unmount: unmountMissingPortfolio } = render(
      <PortfolioScreen
        initialTrade={{ amount: 500, type: "purchase" }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const missingPortfolioSelect = screen.getByRole("combobox", {
      name: "Securities account",
    });
    expect(missingPortfolioSelect).toHaveValue("");
    expect(
      within(missingPortfolioSelect).getByRole("option", {
        name: "Select an account",
      }),
    ).toBeInTheDocument();
    expect(missingPortfolioSelect).toHaveAccessibleDescription(
      "Choose the account for this trade",
    );
    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue(
      "sec-alpha",
    );
    unmountMissingPortfolio();

    // Retired portfolioId and retired securityId with >1 active securities accounts -> both explicitly blank.
    const { unmount: unmountRetired } = render(
      <PortfolioScreen
        initialTrade={{
          portfolioId: "port-old",
          securityId: "sec-retired",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveValue("");
    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveAccessibleDescription("Choose the account for this trade");
    const retiredSecuritySelect = screen.getByRole("combobox", {
      name: "Security",
    });
    expect(retiredSecuritySelect).toHaveValue("");
    expect(
      within(retiredSecuritySelect).getByRole("option", {
        name: "Select a security",
      }),
    ).toBeInTheDocument();
    unmountRetired();

    // Stale or retired portfolioId with a single active securities account stays explicitly unselected.
    const { unmount: unmountStaleSingle } = render(
      <PortfolioScreen
        initialTrade={{
          portfolioId: "port-unknown",
          securityId: "sec-unknown",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedSingleAccountWithCategories}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const staleSinglePortfolio = screen.getByRole("combobox", {
      name: "Securities account",
    });
    expect(staleSinglePortfolio).toHaveValue("");
    expect(
      within(staleSinglePortfolio).getByRole("option", {
        name: "Select an account",
      }),
    ).toBeInTheDocument();
    expect(staleSinglePortfolio).toHaveAccessibleDescription(
      "Choose the account for this trade",
    );
    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue("");
    unmountStaleSingle();

    // Omitted portfolioId with a single active securities account still auto-selects the sole active account.
    render(
      <PortfolioScreen
        initialTrade={{ securityId: "sec-unknown", type: "purchase" }}
        isInScenario={false}
        owned={ownedSingleAccountWithCategories}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveValue("port-gia");
    expect(
      screen.getByRole("combobox", { name: "Securities account" }),
    ).toHaveAccessibleDescription("");
    expect(screen.getByRole("combobox", { name: "Cash account" })).toHaveValue(
      "cash-gia",
    );
    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue("");
  });

  it("resolves categoryId handoffs across multi-security, single-security, empty, and unknown categories", () => {
    // Multiple active securities in category -> grouped optgroup, category title, and category hint.
    const { unmount: unmountMulti } = render(
      <PortfolioScreen
        initialTrade={{
          amount: 1000,
          categoryId: "cat-equity",
          portfolioId: "port-isa",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const multiDialog = screen.getByRole("dialog", {
      name: "Purchase · Global Equity",
    });
    const multiSecurity = within(multiDialog).getByRole("combobox", {
      name: "Security",
    });
    expect(multiSecurity).toHaveValue("");
    expect(multiSecurity).toHaveAccessibleDescription(
      "Choose a security in Global Equity",
    );
    expect(
      within(
        within(multiSecurity).getByRole("group", { name: "Global Equity" }),
      )
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "Alpha World Equity",
      "Beta Core Equity",
      "Gamma Unheld Equity",
    ]);
    unmountMulti();

    // Exactly 1 active security in category -> auto-selected without optgroup.
    const { unmount: unmountSingle } = render(
      <PortfolioScreen
        initialTrade={{
          categoryId: "cat-gilts",
          portfolioId: "port-gia",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const singleDialog = screen.getByRole("dialog", {
      name: "Purchase · Sovereign Gilts Fund",
    });
    const singleSecurity = within(singleDialog).getByRole("combobox", {
      name: "Security",
    });
    expect(singleSecurity).toHaveValue("sec-gilt");
    expect(within(singleSecurity).queryByRole("group")).not.toBeInTheDocument();
    unmountSingle();

    // 0 active securities in category -> flat select (no optgroup) + explanatory hint.
    const { unmount: unmountEmpty } = render(
      <PortfolioScreen
        initialTrade={{
          categoryId: "cat-empty",
          portfolioId: "port-isa",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const emptyDialog = screen.getByRole("dialog", {
      name: "Purchase · Commodities",
    });
    const emptySecurity = within(emptyDialog).getByRole("combobox", {
      name: "Security",
    });
    expect(emptySecurity).toHaveValue("");
    expect(within(emptySecurity).queryByRole("group")).not.toBeInTheDocument();
    expect(emptySecurity).toHaveAccessibleDescription(
      "No active security assigned to Commodities",
    );
    unmountEmpty();

    // Unknown categoryId -> explicit blank security without suggestedCategory.
    render(
      <PortfolioScreen
        initialTrade={{
          categoryId: "cat-missing",
          portfolioId: "port-isa",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const unknownDialog = screen.getByRole("dialog", { name: "New purchase" });
    const unknownSecurity = within(unknownDialog).getByRole("combobox", {
      name: "Security",
    });
    expect(unknownSecurity).toHaveValue("");
    expect(
      within(unknownSecurity).queryByRole("group"),
    ).not.toBeInTheDocument();
    expect(unknownSecurity).toHaveAccessibleDescription("");
  });

  it("narrows sale categoryId handoffs to held securities in the account or across accounts and falls back when unheld", () => {
    // (a1) portfolioId set + single held security in that account -> auto-selects it.
    const { unmount: unmountSingleHeldInAccount } = render(
      <PortfolioScreen
        initialTrade={{
          categoryId: "cat-mixed",
          portfolioId: "port-gia",
          type: "sale",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("dialog", { name: "Sale · Sovereign Gilts Fund" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue(
      "sec-gilt",
    );
    unmountSingleHeldInAccount();

    // (a2) portfolioId set + multiple held securities in that account -> grouped to only held ones.
    const { unmount: unmountMultiHeldInAccount } = render(
      <PortfolioScreen
        initialTrade={{
          categoryId: "cat-equity",
          portfolioId: "port-isa",
          type: "sale",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const multiHeldSelect = within(
      screen.getByRole("dialog", { name: "Sale · Global Equity" }),
    ).getByRole("combobox", { name: "Security" });
    expect(
      within(
        within(multiHeldSelect).getByRole("group", { name: "Global Equity" }),
      )
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Alpha World Equity", "Beta Core Equity"]);
    unmountMultiHeldInAccount();

    // (b1) No portfolioId (>1 active accounts -> portfolioId === "") -> narrows across accounts by shares > 0.
    const { unmount: unmountBlankPortfolio } = render(
      <PortfolioScreen
        initialTrade={{ categoryId: "cat-mixed", type: "sale" }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue(
      "sec-gilt",
    );
    unmountBlankPortfolio();

    // (b2) No portfolioId (1 active account -> portfolioId === undefined) -> narrows by shares > 0.
    const { unmount: unmountUndefinedPortfolio } = render(
      <PortfolioScreen
        initialTrade={{ categoryId: "cat-mixed", type: "sale" }}
        isInScenario={false}
        owned={ownedSingleAccountWithCategories}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(screen.getByRole("combobox", { name: "Security" })).toHaveValue(
      "sec-gilt",
    );
    unmountUndefinedPortfolio();

    // (c1) Fallback when 0 held in chosen portfolioId (including a 0-share lot in sharesByAccount).
    const { unmount: unmountFallbackAccount } = render(
      <PortfolioScreen
        initialTrade={{
          categoryId: "cat-equity",
          portfolioId: "port-gia",
          type: "sale",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const fallbackAccountSelect = within(
      screen.getByRole("dialog", { name: "Sale · Global Equity" }),
    ).getByRole("combobox", { name: "Security" });
    expect(
      within(
        within(fallbackAccountSelect).getByRole("group", {
          name: "Global Equity",
        }),
      )
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "Alpha World Equity",
      "Beta Core Equity",
      "Gamma Unheld Equity",
    ]);
    unmountFallbackAccount();

    // (c2) Fallback when 0 held overall across accounts.
    render(
      <PortfolioScreen
        initialTrade={{ categoryId: "cat-unheld", type: "sale" }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const fallbackOverallSelect = within(
      screen.getByRole("dialog", { name: "Sale · Unheld Sleeve" }),
    ).getByRole("combobox", { name: "Security" });
    expect(
      within(
        within(fallbackOverallSelect).getByRole("group", {
          name: "Unheld Sleeve",
        }),
      )
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Delta Reserve Equity", "Gamma Unheld Equity"]);
  });

  it("clears URL and focuses h1 on handoff dismiss, save, or scenario flip, and never re-opens after file replacement", async () => {
    vi.mocked(addPortfolioTransaction).mockResolvedValue(
      saved({ id: "tx-handoff", savedOn: "2026-09-25", version: 2 }),
    );
    vi.mocked(uploadPortfolio).mockResolvedValue(
      saved({ fileName: "multi.portfolio", savedOn: "2026-09-25", version: 2 }),
    );

    // Dismissing a handoff dialog calls router.replace, focuses h1, leaves manual Add transaction clean, and never re-opens on replace.
    const { unmount: unmountDismiss } = render(
      <PortfolioScreen
        initialTrade={{
          amount: 750,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
      ).not.toBeInTheDocument();
    });
    expect(routerReplace).toHaveBeenCalledExactlyOnceWith(
      "/portfolio?tab=transactions",
      { scroll: false },
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();

    // Opening manual Add transaction afterwards mounts cleanly with key="manual" and does not touch router or h1 on dismiss.
    const addButton = screen.getByRole("button", { name: "Add transaction" });
    addButton.focus();
    fireEvent.click(addButton);
    const manualDialog = screen.getByRole("dialog", {
      name: "Purchase · Alpha World Equity",
    });
    expect(
      within(manualDialog).getByRole("textbox", { name: "Total paid" }),
    ).toHaveValue("");
    expect(
      within(manualDialog).getByRole("textbox", { name: "Shares" }),
    ).toHaveAccessibleDescription("");

    fireEvent.click(
      within(manualDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
      ).not.toBeInTheDocument();
    });
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();

    // Replacing the portfolio file afterwards remounts tabs without re-opening the dismissed handoff dialog.
    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: { files: [new File([gbpFile], "multi.portfolio")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Portfolio file replaced" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
    ).not.toBeInTheDocument();
    unmountDismiss();

    // Saving a handoff dialog submits the prefilled trade, clears URL, focuses h1, and never re-opens on replace.
    routerReplace.mockClear();
    const { unmount: unmountSave } = render(
      <PortfolioScreen
        initialTrade={{
          amount: 600,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const saveDialog = screen.getByRole("dialog", {
      name: "Purchase · Alpha World Equity",
    });
    commit(within(saveDialog).getByRole("textbox", { name: "Shares" }), "5");
    fireEvent.click(within(saveDialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(addPortfolioTransaction).toHaveBeenCalledExactlyOnceWith(1, {
        accountId: "cash-isa",
        amount: 600,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        portfolioId: "port-isa",
        securityId: "sec-alpha",
        shares: 5,
        taxes: 0,
        type: "purchase",
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
      ).not.toBeInTheDocument();
    });
    expect(routerReplace).toHaveBeenCalledExactlyOnceWith(
      "/portfolio?tab=transactions",
      { scroll: false },
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: { files: [new File([gbpFile], "multi.portfolio")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Portfolio file replaced" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
    ).not.toBeInTheDocument();
    unmountSave();

    // Flipping isInScenario from false to true closes the handoff dialog, clears URL, focuses h1, and never re-opens after leaving scenario and replacing the file.
    routerReplace.mockClear();
    const { rerender } = render(
      <PortfolioScreen
        initialTrade={{
          amount: 400,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("dialog", { name: "Purchase · Alpha World Equity" }),
    ).toBeInTheDocument();

    rerender(
      <PortfolioScreen
        initialTrade={{
          amount: 400,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario
        owned={ownedMulti}
        today="2026-09-25"
      />,
    );

    expect(
      screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(routerReplace).toHaveBeenCalledExactlyOnceWith(
      "/portfolio?tab=transactions",
      { scroll: false },
    );

    rerender(
      <PortfolioScreen
        initialTrade={{
          amount: 400,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
    );
    expect(
      screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: { files: [new File([gbpFile], "multi.portfolio")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Portfolio file replaced" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
    ).not.toBeInTheDocument();
  });

  it("strips suppressed trade handoff params on empty-state and scenario arrival so later uploads or replacements never pop open a stale dialog", async () => {
    vi.mocked(uploadPortfolio).mockResolvedValue(
      saved({ fileName: "multi.portfolio", savedOn: "2026-09-25", version: 2 }),
    );

    // Arriving with owned === null and initialTrade strips URL to /portfolio; first upload focuses h1 without opening the stale handoff.
    const { rerender: rerenderEmpty, unmount: unmountEmpty } = render(
      <PortfolioScreen
        initialTrade={{
          amount: 500,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={null}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(routerReplace).toHaveBeenCalledExactlyOnceWith("/portfolio", {
      scroll: false,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerenderEmpty(
      <PortfolioScreen
        initialTrade={{
          amount: 500,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Holdings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(routerReplace).toHaveBeenCalledTimes(1);
    unmountEmpty();

    // Arriving with isInScenario === true and initialTrade strips URL to /portfolio?tab=transactions; leaving scenario and replacing never opens the stale handoff.
    routerReplace.mockClear();
    const { rerender: rerenderScenario } = render(
      <PortfolioScreen
        initialTrade={{
          amount: 500,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario
        owned={ownedMulti}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    expect(routerReplace).toHaveBeenCalledExactlyOnceWith(
      "/portfolio?tab=transactions",
      { scroll: false },
    );
    expect(screen.getByRole("tab", { name: "Transactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerenderScenario(
      <PortfolioScreen
        initialTrade={{
          amount: 500,
          portfolioId: "port-isa",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={ownedMulti}
        today="2026-09-25"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: { files: [new File([gbpFile], "multi.portfolio")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Portfolio file replaced" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", { name: "Purchase · Alpha World Equity" }),
    ).not.toBeInTheDocument();
    expect(routerReplace).toHaveBeenCalledTimes(1);
  });

  it("passes gbpRates and handoffAmountGbp into PortfolioTransactionDialog when a Cogitator trade lands on a non-GBP account", () => {
    const usdOwned: OwnedPortfolio = {
      ...ownedMulti,
      snapshot: {
        ...ownedMulti.snapshot,
        cashAccounts: [
          ...ownedMulti.snapshot.cashAccounts,
          {
            balance: 1000,
            balanceGbp: 800,
            currency: "USD",
            id: "cash-usd",
            isRetired: false,
            name: "Dollar Cash",
            transactionCount: 1,
          },
        ],
        gbpRates: Object.fromEntries([
          ["GBP", 1],
          ["USD", 0.8],
        ]),
        securitiesAccounts: [
          ...ownedMulti.snapshot.securitiesAccounts,
          {
            holdingsCount: 0,
            id: "port-usd",
            isRetired: false,
            marketValue: 0,
            name: "Dollar Brokerage",
            referenceAccountId: "cash-usd",
            transactionCount: 0,
          },
        ],
      },
    };

    render(
      <PortfolioScreen
        initialTrade={{
          amount: 400,
          portfolioId: "port-usd",
          securityId: "sec-alpha",
          type: "purchase",
        }}
        isInScenario={false}
        owned={usdOwned}
        today="2026-09-25"
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", {
      name: "Purchase · Alpha World Equity",
    });
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Cogitator trade is £400",
    );
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "about US$500.00 at the last known rate",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Total paid" }),
    ).toHaveValue("");
  });
});
