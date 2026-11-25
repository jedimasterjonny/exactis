import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Holding } from "@/data/portfolio";

import { updatePortfolioQuotes } from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { commit } from "@/test/dom";

import { PortfolioQuotesDialog } from "./portfolio-quotes-dialog";

vi.mock("@/actions/portfolio", () => ({ updatePortfolioQuotes: vi.fn() }));

const unpricedA: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-unpriced-a",
  isin: "GB00TEST0001",
  isRetired: false,
  latestPrice: null,
  latestPriceDate: null,
  name: "Alpha Unpriced",
  shares: 10,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 10 }],
  ticker: "ALPH",
};

const unpricedB: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-unpriced-b",
  isRetired: false,
  latestPrice: null,
  latestPriceDate: null,
  name: "Alpha Unpriced",
  shares: 5,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 5 }],
};

const undatedPriced: Holding = {
  currency: "USD",
  gbpRate: 0.78,
  id: "sec-undated",
  isRetired: false,
  latestPrice: 50,
  latestPriceDate: null,
  name: "North America ETF",
  shares: 8,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 8 }],
  ticker: "NAET",
};

const oldestPriced: Holding = {
  currency: "GBX",
  gbpRate: 0.01,
  id: "sec-gbx",
  isRetired: false,
  latestPrice: 420.5,
  latestPriceDate: "2026-08-10",
  name: "UK Equity Income",
  shares: 250,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 250 }],
};

const newerPricedA: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-gbp-a",
  isin: "GB00TEST0002",
  isRetired: false,
  latestPrice: 125,
  latestPriceDate: "2026-09-20",
  name: "Bond Index Fund",
  shares: 12,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 12 }],
};

const newerPricedB: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-gbp-b",
  isRetired: false,
  latestPrice: 210,
  latestPriceDate: "2026-09-20",
  name: "Global Equity Index",
  shares: 15,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 15 }],
  ticker: "GEIDX",
};

const zeroShareHolding: Holding = {
  currency: "GBP",
  gbpRate: 1,
  id: "sec-zero",
  isRetired: false,
  latestPrice: 90,
  latestPriceDate: "2026-07-01",
  name: "Sold Legacy Fund",
  shares: 0,
  sharesByAccount: [],
};

const retiredHolding: Holding = {
  currency: "GBX",
  gbpRate: 0.01,
  id: "sec-retired",
  isRetired: true,
  latestPrice: null,
  latestPriceDate: null,
  name: "Retired Gilts Trust",
  shares: 20,
  sharesByAccount: [{ portfolioId: "port-isa", shares: 20 }],
  ticker: "RGLT",
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
      latestPrice: 5400,
      latestPriceDate: "2026-09-20",
      name: "Index Benchmark",
      shares: 0,
      sharesByAccount: [],
      ticker: "BENCH",
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
});
