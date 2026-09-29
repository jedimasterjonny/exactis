import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Rates } from "@/data/rates";
import type { Answer } from "@/lib/answer";

import { saveRates } from "@/actions/plan";
import { Toaster } from "@/components/kit/toast";
import { rates } from "@/data/rates.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";
import { heldBack } from "@/test/held-back";

import { RateSet } from "./rate-set";

vi.mock("@/actions/plan", () => ({ saveRates: vi.fn() }));

// The rates the design shows. A save reports through the toast manager,
// which needs its Toaster mounted.
function renderSet(): void {
  render(<RateSet rates={rates} />, { wrapper: Toaster });
}

// The figure the card gives for stocks' total, the one it defines.
function stocksTotal(): null | string {
  return screen.getByRole("definition").textContent;
}

describe("RateSet", () => {
  it("cautions that the rates typed by hand are live, and why that costs", () => {
    renderSet();

    expect(screen.getByRole("note")).toHaveTextContent(
      "Custom rates are live — the derivation below is ignoredHand-typed rates do not move when you pull a new BoE curve, and nothing warns you when they go stale.",
    );
  });

  it("chooses custom rates, and offers but refuses deriving them from the CMA", () => {
    renderSet();

    const mode = screen.getByRole("region", { name: "Rate set" });
    const custom = within(mode).getByRole("radio", { name: "Custom" });
    const cma = within(mode).getByRole("radio", { name: "From CMA" });

    expect(within(mode).getByText("Mode")).toHaveClass("label");
    expect(custom).toBeChecked();
    expect(custom).toHaveAccessibleDescription(
      "One rate per class, typed by hand, flat for life",
    );
    expect(cma).not.toBeChecked();
    expect(cma).toHaveAttribute("aria-disabled", "true");
    expect(cma).toHaveAccessibleDescription(
      "Rates derived from the capital market assumptions and your target allocation",
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
    render(<RateSet rates={{ ...rates, inflation: 0.030459 }} />, {
      wrapper: Toaster,
    });

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
});
