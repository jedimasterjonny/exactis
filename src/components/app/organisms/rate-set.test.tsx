import type { ComponentProps } from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Cma } from "@/data/cma";
import type { RateSet as Chosen, Rates } from "@/data/rates";
import type { Answer } from "@/lib/answer";

import { saveRates, saveRateSet } from "@/actions/plan";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { curve } from "@/data/inflation.fixture";
import { rates } from "@/data/rates.fixture";
import { targets, targetsUnder } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";
import { heldBack } from "@/test/held-back";

import { RateSet } from "./rate-set";

vi.mock("@/actions/plan", () => ({ saveRates: vi.fn(), saveRateSet: vi.fn() }));

// May's vintage, each class returning a tenth of a point more than
// August's.
const may: Cma = {
  ...cma,
  assets: cma.assets.map((asset) => ({ ...asset, rate: asset.rate + 0.001 })),
  vintage: { month: 4, year: 2026 },
};

// The set given over the rates the design shows typed by hand, and the
// reference household's sources for the CMA's: August's vintage with
// May's before it, the first of September's curve, its target
// allocation and mappings, and 0.20% of fees and a 2% yield. A save
// reports through the toast manager, which needs its Toaster mounted.
function renderSet(
  rateSet: Chosen = "custom",
  sources: Partial<ComponentProps<typeof RateSet>> = {},
): void {
  render(
    <RateSet
      cma={{ latest: cma, previous: may }}
      curve={curve}
      deductions={{ dividends: 0.02, fees: 0.002 }}
      mappings={mappings}
      rates={rates}
      rateSet={rateSet}
      targets={targets}
      {...sources}
    />,
    { wrapper: Toaster },
  );
}

// The figure the card gives for stocks' total, the one it defines.
function stocksTotal(): null | string {
  return screen.getByRole("definition").textContent;
}

describe("RateSet", () => {
  it("cautions that the rates typed by hand are live, and why that costs", () => {
    renderSet();

    expect(screen.getByRole("note")).toHaveTextContent(
      "Custom rates are live — the CMA derivation below is ignoredHand-typed rates do not move when you pull a new CMA or BoE curve, and nothing warns you when they go stale.",
    );
  });

  it("shows the rates typed by hand as chosen, offers the CMA's, and offers but refuses historical returns", () => {
    renderSet();

    const mode = screen.getByRole("region", { name: "Rate set" });
    const custom = within(mode).getByRole("radio", { name: "Custom" });
    const derived = within(mode).getByRole("radio", { name: "From CMA" });
    const historical = within(mode).getByRole("radio", { name: "Historical" });

    expect(within(mode).getByText("Mode")).toHaveClass("label");
    expect(custom).toBeChecked();
    expect(custom).toHaveAccessibleDescription(
      "One rate per class, typed by hand, flat for life",
    );
    expect(derived).not.toBeChecked();
    expect(derived).not.toHaveAttribute("aria-disabled", "true");
    expect(derived).toHaveAccessibleDescription(
      "Rates derived from the capital market assumptions and your target allocation",
    );
    expect(historical).toHaveAttribute("aria-disabled", "true");
    expect(historical).toHaveAccessibleDescription(
      "Returns replayed from history, not built yet",
    );
  });

  // 5.95% and 2% make 7.95% in all.
  it("shows each rate as kept, what it rests on, and stocks' total", () => {
    renderSet();

    const card = screen.getByRole("region", { name: "Custom rates" });

    expect(within(card).getByText("Sect. V.i")).toHaveClass("label");
    expect(field("Stocks growth", card)).toHaveValue("5.95%");
    expect(field("Dividend yield", card)).toHaveValue("2.00%");
    expect(field("Bonds growth", card)).toHaveValue("4.45%");
    expect(field("Inflation", card)).toHaveValue("2.95%");
    expect(field("Stocks growth", card)).toHaveAccessibleDescription(
      "Typed by hand",
    );
    expect(field("Dividend yield", card)).toHaveAccessibleDescription(
      "Added to growth — always change the pair",
    );
    expect(field("Inflation", card)).toHaveAccessibleDescription(
      "Typed by hand — the BoE derivation below is ignored",
    );
    expect(within(card).getByRole("term")).toHaveTextContent("Stocks total");
    expect(stocksTotal()).toBe("7.95%");
  });

  // 6.45% and 2% make 8.45% in all, and the stored rates come back
  // with the page rather than with the answer, so once the store has
  // answered the card shows the rates it was given again.
  it("saves a rate alone as the focus leaves it, showing it and stocks' total at once", async () => {
    const answer = heldBack<Answer<Rates>>();
    vi.mocked(saveRates).mockReturnValue(answer.promise);
    renderSet();

    commit(field("Stocks growth"), "6.45");

    await waitFor(() => {
      expect(stocksTotal()).toBe("8.45%");
    });
    expect(field("Stocks growth")).toHaveValue("6.45%");
    expect(saveRates).toHaveBeenCalledExactlyOnceWith({ stocks: 0.0645 });

    answer.answer(saved({ ...rates, stocks: 0.0645 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Rates saved" }),
      ).toHaveAccessibleDescription(
        "Stocks 8.45% · bonds 4.45% · inflation 2.95%",
      );
    });
    await waitFor(() => {
      expect(stocksTotal()).toBe("7.95%");
    });
  });

  it.each([
    ["Stocks growth", "6", { stocks: 0.06 }],
    ["Dividend yield", "2.5", { dividends: 0.025 }],
    ["Bonds growth", "4", { bonds: 0.04 }],
    ["Inflation", "2.5", { inflation: 0.025 }],
  ] as const)(
    "sends what is typed into %s alone, under its own name",
    async (name, typed, patch) => {
      vi.mocked(saveRates).mockResolvedValue(saved({ ...rates, ...patch }));
      renderSet();

      commit(field(name), typed);

      expect(saveRates).toHaveBeenCalledExactlyOnceWith(patch);
      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: "Rates saved" }),
        ).toBeInTheDocument();
      });
    },
  );

  it("sends nothing for a rate typed back to what it was", () => {
    renderSet();

    commit(field("Bonds growth"), "4.45");

    expect(field("Bonds growth")).toHaveValue("4.45%");
    expect(saveRates).not.toHaveBeenCalled();
  });

  // Inflation carried in off a curve at 3.0459% shows as 3.05%, and the
  // field commits 3.05% as the focus leaves it, typed or not.
  it("sends nothing for a rate the focus only passed through, however finely it is kept", () => {
    renderSet("custom", { rates: { ...rates, inflation: 0.030459 } });

    fireEvent.focus(field("Inflation"));
    fireEvent.blur(field("Inflation"));

    expect(field("Inflation")).toHaveValue("3.05%");
    expect(saveRates).not.toHaveBeenCalled();
  });

  it("puts the rate back and says why when the store refuses it", async () => {
    vi.mocked(saveRates).mockResolvedValue(
      refused("A dividend yield is nothing or more"),
    );
    renderSet();

    commit(field("Inflation"), "3.1");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Rates not saved" }),
      ).toHaveAccessibleDescription("A dividend yield is nothing or more");
    });
    expect(saveRates).toHaveBeenCalledExactlyOnceWith({ inflation: 0.031 });
    await waitFor(() => {
      expect(field("Inflation")).toHaveValue("2.95%");
    });
  });

  // The store's set comes back with the page rather than the answer, so
  // once the store has answered the card shows the set it was given.
  it("chooses the CMA's rates as the radio is pressed, showing them at once, and says so under a toast", async () => {
    const answer = heldBack<Answer<Chosen>>();
    vi.mocked(saveRateSet).mockReturnValue(answer.promise);
    renderSet();

    fireEvent.click(screen.getByRole("radio", { name: "From CMA" }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "From CMA" })).toBeChecked();
    });
    expect(
      screen.getByRole("region", { name: "CMA-derived rates" }),
    ).toBeInTheDocument();
    expect(screen.getByText("CMA-derived set is live")).toHaveAttribute(
      "data-variant",
      "positive",
    );
    expect(saveRateSet).toHaveBeenCalledExactlyOnceWith("cma");

    answer.answer(saved("cma"));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Rate set chosen" }),
      ).toHaveAccessibleDescription("The plan runs on the CMA-derived rates");
    });
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
    });
  });

  it("chooses the rates typed by hand back", async () => {
    vi.mocked(saveRateSet).mockResolvedValue(saved("custom"));
    renderSet("cma");

    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));

    expect(saveRateSet).toHaveBeenCalledExactlyOnceWith("custom");
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Rate set chosen" }),
      ).toHaveAccessibleDescription("The plan runs on the custom rates");
    });
  });

  it("puts the set back and says why when the store refuses it", async () => {
    vi.mocked(saveRateSet).mockResolvedValue(
      refused(
        "UK equity has no CMA class, so the plan cannot run on the CMA's rates",
      ),
    );
    renderSet();

    fireEvent.click(screen.getByRole("radio", { name: "From CMA" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Rate set not changed" }),
      ).toHaveAccessibleDescription(
        "UK equity has no CMA class, so the plan cannot run on the CMA's rates",
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
    });
  });

  // August's blends less 0.20% of fees and the 2% yield: stocks 5.84%
  // growth and 2.00% yield, 7.84% in all, bonds 4.25%, and the curve's
  // 2.95%. May priced every class a tenth of a point higher, so August
  // moved stocks down by 0.10 of a point.
  it("shows the CMA's rates read-only, each with where it comes from, stocks' total, the move from the vintage before and the vintage", () => {
    renderSet("cma");

    const card = screen.getByRole("region", { name: "CMA-derived rates" });

    expect(within(card).getByText("Sect. V.i")).toHaveClass("label");
    expect(
      within(card).getByText("Derived — edit the sources below"),
    ).toHaveClass("label");
    expect(field("Stocks growth", card)).toHaveValue("5.84%");
    expect(field("Dividend yield", card)).toHaveValue("2.00%");
    expect(field("Bonds growth", card)).toHaveValue("4.25%");
    expect(field("Inflation", card)).toHaveValue("2.95%");
    for (const name of [
      "Stocks growth",
      "Dividend yield",
      "Bonds growth",
      "Inflation",
    ]) {
      expect(field(name, card)).toHaveAttribute("readonly");
    }
    expect(field("Stocks growth", card)).toHaveAccessibleDescription(
      "From the Aug 2026 CMA, less fees and yield",
    );
    expect(field("Dividend yield", card)).toHaveAccessibleDescription(
      "Typed in the return source below",
    );
    expect(field("Bonds growth", card)).toHaveAccessibleDescription(
      "Blended from the bond sleeve, less fees",
    );
    expect(field("Inflation", card)).toHaveAccessibleDescription(
      "From the BoE curve, 1 Sep 2026",
    );
    expect(
      within(card)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toStrictEqual(["Stocks total", "vs May 2026", "CMA vintage"]);
    expect(
      within(card)
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual(["7.84%", "−0.10pp", "Aug 2026"]);
    expect(
      screen.queryByRole("region", { name: "Custom rates" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("gives no move before a vintage before the latest is pulled", () => {
    renderSet("cma", { cma: { latest: cma, previous: null } });

    expect(
      within(screen.getByRole("region", { name: "CMA-derived rates" }))
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toStrictEqual(["Stocks total", "CMA vintage"]);
  });

  // The store refuses the set chosen in either case, so the card is
  // only drawn so while it is asked.
  it("leaves the CMA's rates blank while the CMA gives none", () => {
    renderSet("cma", { mappings: mappings.slice(1) });

    const card = screen.getByRole("region", { name: "CMA-derived rates" });

    expect(field("Stocks growth", card)).toHaveValue("");
    expect(
      within(card)
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual(["—", "Aug 2026"]);
  });

  // All in equities, bonds stand in at stocks' return and weigh
  // nothing, so their growth is left blank and says why.
  it("leaves blank the rate of a sleeve nothing in the target allocation blends into", () => {
    renderSet("cma", { targets: targetsUnder("Equity") });

    const card = screen.getByRole("region", { name: "CMA-derived rates" });

    expect(field("Stocks growth", card)).toHaveValue("5.84%");
    expect(field("Bonds growth", card)).toHaveValue("");
    expect(field("Bonds growth", card)).toHaveAccessibleDescription(
      "Nothing in the target allocation blends into bonds",
    );
  });

  // All in bonds, stocks have no growth, yield or total of their own,
  // and no move from the vintage before.
  it("leaves stocks' rates, total and move blank when nothing blends into stocks", () => {
    renderSet("cma", { targets: targetsUnder("Bonds") });

    const card = screen.getByRole("region", { name: "CMA-derived rates" });

    expect(field("Stocks growth", card)).toHaveValue("");
    expect(field("Stocks growth", card)).toHaveAccessibleDescription(
      "Nothing in the target allocation blends into stocks",
    );
    expect(field("Dividend yield", card)).toHaveValue("");
    expect(field("Bonds growth", card)).not.toHaveValue("");
    expect(
      within(card)
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual(["—", "Aug 2026"]);
  });

  it("leaves the vintage and the curve's day out before either is pulled", () => {
    renderSet("cma", { cma: null, curve: null });

    const card = screen.getByRole("region", { name: "CMA-derived rates" });

    expect(field("Inflation", card)).toHaveValue("");
    expect(field("Stocks growth", card)).toHaveAccessibleDescription(
      "From the CMA, once one is pulled",
    );
    expect(field("Inflation", card)).toHaveAccessibleDescription(
      "From the BoE curve, once one is pulled",
    );
    expect(
      within(card)
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual(["—", "—"]);
  });
});
