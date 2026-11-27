import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Holding } from "@/data/portfolio";
import type { Answer } from "@/lib/answer";
import type { FetchedQuote } from "@/lib/portfolio-quotes";

import {
  fetchPortfolioQuotes,
  updatePortfolioQuotes,
} from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { commit } from "@/test/dom";

import { PortfolioQuotesDialog } from "./portfolio-quotes-dialog";

vi.mock("@/actions/portfolio", () => ({
  fetchPortfolioQuotes: vi.fn(),
  updatePortfolioQuotes: vi.fn(),
}));

const unpricedA: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-unpriced-a",
  isin: "GB00TEST0001",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: null,
  latestPriceDate: null,
  name: "Alpha Unpriced",
  shares: 10,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 10 }],
  ticker: "ALPH",
  transactionCount: 1,
};

const unpricedB: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-unpriced-b",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: null,
  latestPriceDate: null,
  name: "Alpha Unpriced",
  shares: 5,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 5 }],
  transactionCount: 1,
};

const undatedPriced: Holding = {
  currency: "USD",
  gbpRate: 0.78,
  id: "sec-undated",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: 50,
  latestPriceDate: null,
  name: "North America ETF",
  shares: 8,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 8 }],
  ticker: "NAET",
  transactionCount: 1,
};

const oldestPriced: Holding = {
  currency: "GBX",
  gbpRate: 0.01,
  id: "sec-gbx",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: 420.5,
  latestPriceDate: "2026-08-10",
  name: "UK Equity Income",
  shares: 250,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 250 }],
  transactionCount: 1,
};

const newerPricedA: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-gbp-a",
  isin: "GB00TEST0002",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: 125,
  latestPriceDate: "2026-09-20",
  name: "Bond Index Fund",
  shares: 12,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 12 }],
  transactionCount: 1,
};

const newerPricedB: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-gbp-b",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: 210,
  latestPriceDate: "2026-09-20",
  name: "Global Equity Index",
  shares: 15,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 15 }],
  ticker: "GEIDX",
  transactionCount: 1,
};

const zeroShareHolding: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-zero",
  isRetired: false,
  isSplitCategory: false,
  latestPrice: 90,
  latestPriceDate: "2026-07-01",
  name: "Sold Legacy Fund",
  shares: 0,
  sharesByAccount: [],
  transactionCount: 0,
};

const retiredHolding: Holding = {
  currency: "GBX",
  gbpRate: 0.01,
  id: "sec-retired",
  isRetired: true,
  isSplitCategory: false,
  latestPrice: null,
  latestPriceDate: null,
  name: "Retired Gilts Trust",
  shares: 20,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 20 }],
  ticker: "RGLT",
  transactionCount: 1,
};

function itemAt(items: readonly HTMLElement[], index: number): HTMLElement {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected listitem at index ${String(index)}`);
  }
  return item;
}

describe("PortfolioQuotesDialog", () => {
  it("opens blank, sorts active held securities unpriced then undated then oldest then A-Z, and shows currency and quote cues", () => {
    render(
      <PortfolioQuotesDialog
        holdings={[
          newerPricedB,
          retiredHolding,
          oldestPriced,
          newerPricedA,
          unpricedB,
          undatedPriced,
          zeroShareHolding,
          unpricedA,
        ]}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<() => void>()}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    expect(dialog).toHaveClass("sm:max-w-xl");

    const dateInput = within(dialog).getByLabelText("Quote date");
    expect(dateInput).toHaveValue("2026-09-25");
    expect(dateInput).toHaveAccessibleDescription(
      "Applies to every price entered below",
    );

    const items = within(dialog).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    const expectedLabels = [
      "Alpha Unpriced (GBP)",
      "Alpha Unpriced (GBP)",
      "North America ETF (USD)",
      "UK Equity Income (pence)",
      "Bond Index Fund (GBP)",
      "Global Equity Index (GBP)",
    ];
    for (const [index, label] of expectedLabels.entries()) {
      expect(
        within(itemAt(items, index)).getByRole("textbox"),
      ).toHaveAccessibleName(label);
    }

    // Duplicate unpriced name breaks ties deterministically by id (sec-unpriced-a before sec-unpriced-b).
    const firstItem = itemAt(items, 0);
    const secondItem = itemAt(items, 1);
    const thirdItem = itemAt(items, 2);
    const fourthItem = itemAt(items, 3);
    expect(firstItem).toHaveTextContent("ALPH · GB00TEST0001 · GBP");
    expect(secondItem).not.toHaveTextContent("ALPH");

    // Unpriced row uses caution tone; undated row omits date separator; GBX row uses outline pence badge.
    const firstParagraphs = within(firstItem).getAllByRole("paragraph");
    expect(firstParagraphs[1]).toHaveTextContent("Unpriced");
    expect(firstParagraphs[1]).toHaveClass("text-caution");
    expect(thirdItem).toHaveTextContent("Last US$50.00");
    expect(thirdItem).not.toHaveTextContent("Last US$50.00 ·");

    const gbxBadge = within(fourthItem).getByText("GBX · pence");
    expect(gbxBadge).toHaveAttribute("data-variant", "outline");
    expect(fourthItem).toHaveTextContent("Last 420.50p · 10 Aug 2026");

    // All inputs open blank and Save is held until at least one price is entered.
    for (const input of within(dialog).getAllByRole("textbox")) {
      expect(input).toHaveValue("");
    }
    expect(
      within(dialog).getByText("No prices entered yet"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("enables Save live on typing, accepts same-price confirmation on a new date, warns calmly on 10x outliers, and submits one batch", async () => {
    const onSaved = vi.fn<() => void>();
    vi.mocked(updatePortfolioQuotes).mockResolvedValue(
      saved({ savedOn: "2026-09-25", updatedCount: 3, version: 4 }),
    );

    render(
      <PortfolioQuotesDialog
        holdings={[oldestPriced, newerPricedB, unpricedA]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    const gbxInput = within(dialog).getByRole("textbox", {
      name: "UK Equity Income (pence)",
    });
    const gbpInput = within(dialog).getByRole("textbox", {
      name: "Global Equity Index (GBP)",
    });
    const unpricedInput = within(dialog).getByRole("textbox", {
      name: "Alpha Unpriced (GBP)",
    });
    const save = within(dialog).getByRole("button", { name: "Save" });

    // Typing a 0.1x outlier (4.20 pounds instead of 420.50p) shows a calm non-blocking hint.
    fireEvent.change(gbxInput, { target: { value: "4.2" } });
    expect(gbxInput).toHaveAccessibleDescription("Check pounds vs pence");
    expect(within(dialog).getByText("1 price entered")).toBeInTheDocument();
    expect(save).toBeEnabled();

    // Typing a 10x outlier also triggers the hint; correcting to 425 clears it.
    fireEvent.change(gbxInput, { target: { value: "4205" } });
    expect(gbxInput).toHaveAccessibleDescription("Check pounds vs pence");

    commit(gbxInput, "425");
    expect(gbxInput).not.toHaveAccessibleDescription("Check pounds vs pence");

    // Re-entering the exact last recorded price (210) on a new date still counts as entered.
    commit(gbpInput, "210");
    commit(unpricedInput, "98.75");
    expect(within(dialog).getByText("3 prices entered")).toBeInTheDocument();

    // Clearing an entered row removes it from the batch; re-entering puts it back.
    commit(unpricedInput, "");
    expect(within(dialog).getByText("2 prices entered")).toBeInTheDocument();
    commit(unpricedInput, "98.75");

    // Change quote date and submit.
    fireEvent.change(within(dialog).getByLabelText("Quote date"), {
      target: { value: "2026-09-24" },
    });
    fireEvent.click(save);

    await waitFor(() => {
      expect(updatePortfolioQuotes).toHaveBeenCalledExactlyOnceWith(3, {
        date: "2026-09-24",
        quotes: [
          { price: 98.75, securityId: "sec-unpriced-a" },
          { price: 425, securityId: "sec-gbx" },
          { price: 210, securityId: "sec-gbp-b" },
        ],
      });
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Quotes updated" }),
      ).toHaveAccessibleDescription("3 prices saved for 24 Sep 2026");
    });
  });

  it("blocks Save on zero or invalid-date inputs, including mixed valid and zero rows, and formats currency-less index rows cleanly", () => {
    const indexBenchmark: Holding = {
      currency: "",
      gbpRate: null,
      id: "sec-index",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 5400,
      latestPriceDate: "2026-09-20",
      name: "Index Benchmark",
      shares: 0,
      sharesByAccount: [],
      ticker: "BENCH",
      transactionCount: 0,
    };

    render(
      <PortfolioQuotesDialog
        holdings={[newerPricedA, newerPricedB, indexBenchmark]}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<() => void>()}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    const firstInput = within(dialog).getByRole("textbox", {
      name: "Bond Index Fund (GBP)",
    });
    const secondInput = within(dialog).getByRole("textbox", {
      name: "Global Equity Index (GBP)",
    });
    const save = within(dialog).getByRole("button", { name: "Save" });

    // One valid price combined with one zero price still blocks Save.
    commit(firstInput, "130");
    expect(save).toBeEnabled();

    fireEvent.change(secondInput, { target: { value: "0" } });
    expect(
      within(dialog).getByText("Price must be greater than zero"),
    ).toBeInTheDocument();
    expect(secondInput).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText("1 price entered")).toBeInTheDocument();
    expect(save).toBeDisabled();

    commit(secondInput, "215");
    expect(save).toBeEnabled();

    // Reveal the currency-less zero-share index and confirm no "()" cue or dangling middle dot.
    fireEvent.click(
      within(dialog).getByRole("switch", {
        name: "Show retired & zero-share securities",
      }),
    );
    const indexItem = itemAt(within(dialog).getAllByRole("listitem"), 2);
    expect(within(indexItem).getByRole("textbox")).toHaveAccessibleName(
      "Index Benchmark",
    );
    expect(
      within(indexItem)
        .getAllByRole("paragraph")
        .map((paragraph) => paragraph.textContent),
    ).toStrictEqual(["BENCH · Zero shares", "Last 5,400.00 · 20 Sep 2026"]);

    fireEvent.change(within(dialog).getByLabelText("Quote date"), {
      target: { value: "" },
    });
    expect(save).toBeDisabled();
  });

  it("toggles retired and zero-share securities and prunes hidden prices when toggled back off", async () => {
    const onSaved = vi.fn<() => void>();
    vi.mocked(updatePortfolioQuotes).mockResolvedValue(
      saved({ savedOn: "2026-09-25", updatedCount: 1, version: 4 }),
    );

    render(
      <PortfolioQuotesDialog
        holdings={[newerPricedB, retiredHolding, zeroShareHolding]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);

    const toggle = within(dialog).getByRole("switch", {
      name: "Show retired & zero-share securities",
    });
    fireEvent.click(toggle);

    const items = within(dialog).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(itemAt(items, 0)).getByRole("textbox")).toHaveAccessibleName(
      "Global Equity Index (GBP)",
    );
    expect(within(itemAt(items, 1)).getByRole("textbox")).toHaveAccessibleName(
      "Retired Gilts Trust (pence)",
    );
    expect(within(itemAt(items, 2)).getByRole("textbox")).toHaveAccessibleName(
      "Sold Legacy Fund (GBP)",
    );
    expect(within(itemAt(items, 1)).getByText("Retired")).toHaveAttribute(
      "data-variant",
      "outline",
    );
    expect(itemAt(items, 2)).toHaveTextContent("GBP · Zero shares");

    // Enter a price on both an active holding and an inactive holding, then toggle inactive OFF.
    commit(
      within(dialog).getByRole("textbox", {
        name: "Global Equity Index (GBP)",
      }),
      "212",
    );
    commit(
      within(dialog).getByRole("textbox", { name: "Sold Legacy Fund (GBP)" }),
      "95",
    );
    expect(within(dialog).getByText("2 prices entered")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(within(dialog).getByText("1 price entered")).toBeInTheDocument();

    // Toggling back ON confirms the hidden price was pruned and mounts blank again.
    fireEvent.click(toggle);
    expect(
      within(dialog).getByRole("textbox", { name: "Sold Legacy Fund (GBP)" }),
    ).toHaveValue("");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(updatePortfolioQuotes).toHaveBeenCalledExactlyOnceWith(3, {
        date: "2026-09-25",
        quotes: [{ price: 212, securityId: "sec-gbp-b" }],
      });
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  it("opens showing inactive securities when no active held security exists and omits the switch", () => {
    render(
      <PortfolioQuotesDialog
        holdings={[zeroShareHolding, retiredHolding]}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<() => void>()}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    expect(within(dialog).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
  });

  it("stays open on refusal, drops vanished securities after a stale refresh, retries against live version, and handles an empty refreshed catalogue", async () => {
    const onSaved = vi.fn<() => void>();
    vi.mocked(updatePortfolioQuotes)
      .mockResolvedValueOnce(
        refused("The portfolio file changed while this was being saved"),
      )
      .mockResolvedValueOnce(
        saved({ savedOn: "2026-09-25", updatedCount: 1, version: 5 }),
      );

    const { rerender } = render(
      <PortfolioQuotesDialog
        holdings={[newerPricedA, newerPricedB]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    commit(
      within(dialog).getByRole("textbox", { name: "Bond Index Fund (GBP)" }),
      "128",
    );
    commit(
      within(dialog).getByRole("textbox", {
        name: "Global Equity Index (GBP)",
      }),
      "220",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Quotes not saved" }),
      ).toHaveAccessibleDescription(
        "The portfolio file changed while this was being saved",
      );
    });
    expect(onSaved).not.toHaveBeenCalled();

    // Simulate a Stale refresh where version advanced to 4 and Bond Index Fund vanished.
    rerender(
      <PortfolioQuotesDialog
        holdings={[newerPricedB]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={4}
      />,
    );

    expect(within(dialog).getByText("1 price entered")).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => {
      expect(save).toBeEnabled();
    });
    fireEvent.click(save);

    await waitFor(() => {
      expect(updatePortfolioQuotes).toHaveBeenLastCalledWith(4, {
        date: "2026-09-25",
        quotes: [{ price: 220, securityId: "sec-gbp-b" }],
      });
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });

    // If a refreshed file has no securities left, show the empty note and disable Save.
    rerender(
      <PortfolioQuotesDialog
        holdings={[]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={5}
      />,
    );
    expect(
      within(dialog)
        .getAllByRole("paragraph")
        .map((paragraph) => paragraph.textContent),
    ).toContain("No securities in this file to price.");
    expect(save).toBeDisabled();
  });

  it("surfaces a target sync warning in the success toast while still calling onSaved", async () => {
    const onSaved = vi.fn<() => void>();
    vi.mocked(updatePortfolioQuotes).mockResolvedValue(
      saved({
        savedOn: "2026-09-25",
        syncWarning: "The portfolio file has no Asset Allocation taxonomy",
        updatedCount: 1,
        version: 4,
      }),
    );

    render(
      <PortfolioQuotesDialog
        holdings={[newerPricedB]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    commit(
      within(dialog).getByRole("textbox", {
        name: "Global Equity Index (GBP)",
      }),
      "215",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Quotes updated" }),
      ).toHaveAccessibleDescription(
        "1 price saved for 25 Sep 2026. Targets not synced: The portfolio file has no Asset Allocation taxonomy",
      );
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("fetches latest quotes into preview inputs, preserves manual edits, guards outliers, clears rows, and saves mixed dates", async () => {
    const onSaved = vi.fn<() => void>();
    vi.mocked(fetchPortfolioQuotes)
      .mockResolvedValueOnce(
        saved([
          {
            convertedFrom: "GBp",
            date: "2026-09-24",
            price: 105,
            securityId: "sec-unpriced-a",
            status: "fetched",
          },
          {
            date: "2026-09-18",
            price: 120,
            securityId: "sec-gbp-a",
            status: "fetched",
          },
          {
            date: "2026-09-25",
            price: 215,
            securityId: "sec-gbp-b",
            status: "fetched",
          },
          {
            date: "2026-09-25",
            price: 42_050,
            securityId: "sec-gbx",
            status: "outlier",
          },
          {
            reason: "No ticker — enter manually",
            securityId: "sec-unpriced-b",
            status: "missing-ticker",
          },
          {
            reason: "Provider returned EUR (expected USD)",
            securityId: "sec-undated",
            status: "currency-mismatch",
          },
        ]),
      )
      .mockResolvedValueOnce(
        saved([
          {
            date: "2026-09-25",
            price: 122,
            securityId: "sec-gbp-a",
            status: "fetched",
          },
          {
            date: "2026-09-25",
            price: 230,
            securityId: "sec-gbp-b",
            status: "fetched",
          },
        ]),
      );
    vi.mocked(updatePortfolioQuotes).mockResolvedValue(
      saved({ savedOn: "2026-09-25", updatedCount: 2, version: 4 }),
    );

    render(
      <PortfolioQuotesDialog
        holdings={[
          unpricedA,
          unpricedB,
          undatedPriced,
          oldestPriced,
          newerPricedA,
          newerPricedB,
        ]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    // Pre-type a manual price on Global Equity Index — fetch must not overwrite it.
    const gbpBInput = within(dialog).getByRole("textbox", {
      name: "Global Equity Index (GBP)",
    });
    commit(gbpBInput, "211");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fetch latest quotes" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "2 quotes fetched · 1 skipped · 2 need review",
      );
    });

    // Fetched rows populate preview inputs; manual row keeps 211 with no fetched status; outlier & mismatch stay blank.
    expect(
      within(dialog).getByRole("textbox", { name: "Bond Index Fund (GBP)" }),
    ).toHaveValue("£120.00");
    expect(gbpBInput).toHaveValue("£211.00");
    expect(
      within(dialog).getByRole("textbox", { name: "UK Equity Income (pence)" }),
    ).toHaveValue("");

    // Calm per-row status lines show delta with real minus, conversion, older cue, outlier caution, and skip reason.
    const items = within(dialog).getAllByRole("listitem");
    expect(itemAt(items, 0)).toHaveTextContent(
      "Fetched 24 Sep 2026 · Converted from GBp",
    );
    expect(itemAt(items, 1)).toHaveTextContent("No ticker — enter manually");
    const mismatchParagraphs = within(itemAt(items, 2)).getAllByRole(
      "paragraph",
    );
    expect(mismatchParagraphs.at(-1)).toHaveTextContent(
      "Provider returned EUR (expected USD)",
    );
    expect(mismatchParagraphs.at(-1)).toHaveClass("text-caution");
    const outlierParagraphs = within(itemAt(items, 3)).getAllByRole(
      "paragraph",
    );
    expect(outlierParagraphs.at(-1)).toHaveTextContent(
      "Fetched 42,050.00p (25 Sep 2026) — ≥10× off last price; enter manually if intended",
    );
    expect(outlierParagraphs.at(-1)).toHaveClass("text-caution");
    expect(itemAt(items, 4)).toHaveTextContent(
      "Fetched 18 Sep 2026 · −4.00% · Older than latest quote",
    );
    expect(itemAt(items, 5)).not.toHaveTextContent("Fetched");
    expect(
      within(dialog).getByLabelText("Quote date"),
    ).toHaveAccessibleDescription(
      "Applies to manual entries; fetched quotes keep their market date",
    );
    expect(
      within(dialog).getByText("3 prices ready (2 fetched)"),
    ).toBeInTheDocument();

    // Re-fetching refreshes previously fetched Bond Index Fund without clobbering manual 211.
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fetch latest quotes" }),
    );
    await waitFor(() => {
      expect(
        within(dialog).getByRole("textbox", { name: "Bond Index Fund (GBP)" }),
      ).toHaveValue("£122.00");
    });
    expect(gbpBInput).toHaveValue("£211.00");

    // Clear Bond Index Fund via RowAction and verify it leaves the batch and drops its fetched status.
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Clear quote for Bond Index Fund",
      }),
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Bond Index Fund (GBP)" }),
    ).toHaveValue("");
    expect(
      within(dialog).getByText("2 prices ready (1 fetched)"),
    ).toBeInTheDocument();

    // Save submits per-quote market date for fetched row and omits date for manual row.
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(updatePortfolioQuotes).toHaveBeenCalledExactlyOnceWith(3, {
        date: "2026-09-25",
        quotes: [
          { date: "2026-09-24", price: 105, securityId: "sec-unpriced-a" },
          { price: 211, securityId: "sec-gbp-b" },
        ],
      });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Quotes updated" }),
      ).toHaveAccessibleDescription("2 prices saved");
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("chunks >50 holdings, clears fetched date on manual edit, handles fetch refusals, and prunes hidden statuses", async () => {
    const manyHoldings: Holding[] = Array.from({ length: 52 }, (_, index) => ({
      currency: "GBP",
      gbpRate: 1,
      id: `sec-bulk-${String(index)}`,
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 100,
      latestPriceDate: "2026-09-20",
      name: `Fund ${String(index).padStart(2, "0")}`,
      shares: 1,
      sharesByAccount: [{ portfolioId: "port-isa", shares: 1 }],
      ticker: `F${String(index)}.L`,
      transactionCount: 1,
    }));
    vi.mocked(fetchPortfolioQuotes)
      .mockResolvedValueOnce(
        saved([
          {
            date: "2026-09-24",
            price: 105,
            securityId: "sec-bulk-0",
            status: "fetched",
          },
          {
            reason: "Manual feed — enter manually",
            securityId: "sec-bulk-1",
            status: "manual-feed",
          },
          {
            reason: "FT feed — enter manually",
            securityId: "sec-bulk-2",
            status: "unsupported-feed",
          },
          {
            reason: "Quote lookup timed out",
            securityId: "sec-bulk-3",
            status: "failed",
          },
        ]),
      )
      .mockResolvedValueOnce(
        saved([
          {
            date: "2026-09-24",
            price: 100.001,
            securityId: "sec-bulk-50",
            status: "fetched",
          },
        ]),
      )
      .mockResolvedValueOnce(refused("Leave the scenario to fetch quotes"));
    vi.mocked(updatePortfolioQuotes).mockResolvedValue(
      saved({ savedOn: "2026-09-25", updatedCount: 2, version: 4 }),
    );
    const onSaved = vi.fn<() => void>();

    const { rerender } = render(
      <PortfolioQuotesDialog
        holdings={[...manyHoldings, zeroShareHolding]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fetch latest quotes" }),
    );

    await waitFor(() => {
      expect(fetchPortfolioQuotes).toHaveBeenCalledTimes(2);
    });
    expect(fetchPortfolioQuotes).toHaveBeenNthCalledWith(1, {
      securityIds: manyHoldings.slice(0, 50).map((h) => h.id),
    });
    expect(fetchPortfolioQuotes).toHaveBeenNthCalledWith(2, {
      securityIds: manyHoldings.slice(50).map((h) => h.id),
    });

    // Positive fetched delta formats with leading plus; tiny positive delta rounds to unsigned 0.00%.
    await waitFor(() => {
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "2 quotes fetched · 2 skipped · 1 need review",
      );
    });
    const listItems = within(dialog).getAllByRole("listitem");
    const firstRow = itemAt(listItems, 0);
    expect(firstRow).toHaveTextContent("Fetched 24 Sep 2026 · +5.00%");
    expect(itemAt(listItems, 50)).toHaveTextContent(
      "Fetched 24 Sep 2026 · 0.00%",
    );
    expect(itemAt(listItems, 50)).not.toHaveTextContent("+0.00%");

    // Manually typing over a fetched row clears its per-row market date and fetched status.
    const fund0Input = within(dialog).getByRole("textbox", {
      name: "Fund 00 (GBP)",
    });
    commit(fund0Input, "108");
    expect(firstRow).not.toHaveTextContent("Fetched 24 Sep 2026");

    // Saving submits manual override without per-row date (follows Quote date) while fetched Fund 50 keeps its market date.
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(updatePortfolioQuotes).toHaveBeenCalledExactlyOnceWith(3, {
        date: "2026-09-25",
        quotes: [
          { price: 108, securityId: "sec-bulk-0" },
          { date: "2026-09-24", price: 100.001, securityId: "sec-bulk-50" },
        ],
      });
    });
    expect(onSaved).toHaveBeenCalledOnce();
    const fetchButton = within(dialog).getByRole("button", {
      name: "Fetch latest quotes",
    });
    await waitFor(() => {
      expect(fetchButton).toBeEnabled();
    });

    // Refused fetch raises error toast without wiping preview inputs.
    fireEvent.click(fetchButton);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Quotes not fetched" }),
      ).toHaveAccessibleDescription("Leave the scenario to fetch quotes");
    });
    expect(fund0Input).toHaveValue("£108.00");

    // Vanished security after rerender is ignored by fetch summary.
    rerender(
      <PortfolioQuotesDialog
        holdings={[manyHoldings[0] ?? newerPricedA]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={4}
      />,
    );
    expect(within(dialog).getByRole("status")).toHaveTextContent("");
  });

  it("disables Save and inactive toggle during fetch, disables Fetch during save, prunes hidden statuses, and cancels chunked fetch on unmount", async () => {
    const manyHoldings: Holding[] = Array.from({ length: 52 }, (_, index) => ({
      currency: "GBP",
      gbpRate: 1,
      id: `sec-cancel-${String(index)}`,
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 100,
      latestPriceDate: "2026-09-20",
      name: `Fund ${String(index).padStart(2, "0")}`,
      shares: 1,
      sharesByAccount: [{ portfolioId: "port-isa", shares: 1 }],
      ticker: `C${String(index)}.L`,
      transactionCount: 1,
    }));

    // 1. In-flight fetch disables Save and inactive toggle; unmounting mid-fetch cancels chunk 2 and suppresses stray toasts.
    const chunk1 = Promise.withResolvers<Answer<readonly FetchedQuote[]>>();
    vi.mocked(fetchPortfolioQuotes).mockImplementationOnce(
      async () => chunk1.promise,
    );

    const { unmount } = render(
      <PortfolioQuotesDialog
        holdings={[...manyHoldings, zeroShareHolding]}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<() => void>()}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog = screen.getByRole("dialog", { name: "Update quotes" });
    commit(
      within(dialog).getByRole("textbox", { name: "Fund 00 (GBP)" }),
      "105",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fetch latest quotes" }),
    );
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Save" }),
      ).toBeDisabled();
    });
    expect(
      within(dialog).getByRole("switch", {
        name: "Show retired & zero-share securities",
      }),
    ).toHaveAttribute("aria-disabled", "true");

    unmount();
    chunk1.resolve(refused("Stale refusal after unmount"));
    await Promise.resolve();
    expect(fetchPortfolioQuotes).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("dialog", { name: "Quotes not fetched" }),
    ).not.toBeInTheDocument();

    // 2. Toggling inactive switch off prunes inactive fetched statuses, and in-flight Save disables Fetch.
    vi.mocked(fetchPortfolioQuotes).mockResolvedValueOnce(
      saved([
        {
          date: "2026-09-25",
          price: 95,
          securityId: zeroShareHolding.id,
          status: "fetched",
        },
      ]),
    );
    const pendingSave =
      Promise.withResolvers<
        Answer<{
          readonly savedOn: string;
          readonly updatedCount: number;
          readonly version: number;
        }>
      >();
    vi.mocked(updatePortfolioQuotes).mockImplementationOnce(
      async () => pendingSave.promise,
    );

    render(
      <PortfolioQuotesDialog
        holdings={[newerPricedA, zeroShareHolding]}
        onDismiss={vi.fn<() => void>()}
        onSaved={vi.fn<() => void>()}
        today="2026-09-25"
        version={3}
      />,
      { wrapper: Toaster },
    );

    const dialog2 = screen.getByRole("dialog", { name: "Update quotes" });
    const inactiveSwitch = within(dialog2).getByRole("switch", {
      name: "Show retired & zero-share securities",
    });
    fireEvent.click(inactiveSwitch);
    fireEvent.click(
      within(dialog2).getByRole("button", { name: "Fetch latest quotes" }),
    );
    await waitFor(() => {
      expect(within(dialog2).getByRole("status")).toHaveTextContent(
        "1 quote fetched",
      );
    });
    // Hide inactive -> prunes fetched status; show again -> status stays pruned.
    fireEvent.click(inactiveSwitch);
    expect(within(dialog2).getByRole("status")).toHaveTextContent("");
    fireEvent.click(inactiveSwitch);
    expect(within(dialog2).getByRole("status")).toHaveTextContent("");

    // In-flight Save disables Fetch button.
    commit(
      within(dialog2).getByRole("textbox", { name: "Bond Index Fund (GBP)" }),
      "121",
    );
    fireEvent.click(within(dialog2).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        within(dialog2).getByRole("button", { name: "Fetch latest quotes" }),
      ).toBeDisabled();
    });
    pendingSave.resolve(
      saved({ savedOn: "2026-09-25", updatedCount: 1, version: 4 }),
    );
  });
});
