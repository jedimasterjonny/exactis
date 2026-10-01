import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Allocation } from "@/data/rates";
import type { Answer } from "@/lib/answer";

import { saveAllocation } from "@/actions/plan";
import { Toaster } from "@/components/kit/toast";
import { allocation, rates } from "@/data/rates.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";
import { heldBack } from "@/test/held-back";

import { AssetAllocation } from "./asset-allocation";

vi.mock("@/actions/plan", () => ({ saveAllocation: vi.fn() }));

// What the card comes to, each figure by its name.
function figures(): Record<string, null | string> {
  const terms = screen.getAllByRole("term");
  const definitions = screen.getAllByRole("definition");
  return Object.fromEntries(
    terms.map((term, place) => [
      term.textContent,
      definitions[place]?.textContent ?? null,
    ]),
  );
}

// Four fifths in stocks over the design's rates. A save reports through
// the toast manager, which needs its Toaster mounted.
function renderAllocation(): void {
  render(<AssetAllocation allocation={allocation} rates={rates} />, {
    wrapper: Toaster,
  });
}

describe("AssetAllocation", () => {
  // Four fifths at stocks' 7.95% and a fifth at bonds' 4.45%.
  it("shows the share in stocks, the rest in bonds, and the plan rate they make", () => {
    renderAllocation();

    const card = screen.getByRole("region", { name: "Allocation" });

    expect(within(card).getByText("Sect. V.iii")).toHaveClass("label");
    expect(field("Stocks share", card)).toHaveValue("80.00%");
    expect(field("Stocks share", card)).toHaveAccessibleDescription(
      "The rest is held in bonds, flat for life",
    );
    expect(figures()).toStrictEqual({
      "Bonds share": "20.00%",
      "Plan rate": "7.25%",
    });
  });

  // Three fifths at 7.95% and two at 4.45% make 6.55%. The stored split
  // comes back with the page rather than with the answer, so once the
  // store has answered the card shows the split it was given again.
  it("saves the share as the focus leaves it, showing the bonds' share and the plan rate at once", async () => {
    const answer = heldBack<Answer<Allocation>>();
    vi.mocked(saveAllocation).mockReturnValue(answer.promise);
    renderAllocation();

    commit(field("Stocks share"), "60");

    await waitFor(() => {
      expect(figures()).toStrictEqual({
        "Bonds share": "40.00%",
        "Plan rate": "6.55%",
      });
    });
    expect(saveAllocation).toHaveBeenCalledExactlyOnceWith({ stocks: 0.6 });

    answer.answer(saved({ stocks: 0.6 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation saved" }),
      ).toHaveAccessibleDescription("60.00% in stocks, 40.00% in bonds");
    });
    await waitFor(() => {
      expect(figures()).toMatchObject({ "Plan rate": "7.25%" });
    });
  });

  it("holds the share between none of the savings and all of them", async () => {
    vi.mocked(saveAllocation).mockResolvedValue(saved({ stocks: 1 }));
    renderAllocation();

    commit(field("Stocks share"), "120");

    expect(saveAllocation).toHaveBeenCalledExactlyOnceWith({ stocks: 1 });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation saved" }),
      ).toBeInTheDocument();
    });
  });

  it("sends nothing for a share typed back to what it was", () => {
    renderAllocation();

    commit(field("Stocks share"), "80");

    expect(saveAllocation).not.toHaveBeenCalled();
  });

  it("puts the share back and says why when the store refuses it", async () => {
    vi.mocked(saveAllocation).mockResolvedValue(
      refused(
        "The household changed while this was being saved, so nothing was",
      ),
    );
    renderAllocation();

    commit(field("Stocks share"), "50");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not saved" }),
      ).toHaveAccessibleDescription(
        "The household changed while this was being saved, so nothing was",
      );
    });
    await waitFor(() => {
      expect(field("Stocks share")).toHaveValue("80.00%");
    });
  });
});
