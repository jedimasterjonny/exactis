import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Pulled } from "@/data/house-prices";
import type { Answer } from "@/lib/answer";

import { pullHousePrices } from "@/actions/house-prices";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";

import { HousePricesPull } from "./house-prices-pull";

vi.mock("@/actions/house-prices", () => ({ pullHousePrices: vi.fn() }));

// The button as the header mounts it. A pull reports through the toast
// manager, which needs its Toaster mounted.
function pullButton(): HTMLElement {
  render(<HousePricesPull />, { wrapper: Toaster });
  return screen.getByRole("button", { name: "Pull house prices" });
}

describe("HousePricesPull", () => {
  it("holds the pull while it is on its way, then says what the house is now worth and which month the index ran to", async () => {
    const answer = Promise.withResolvers<Answer<Pulled>>();
    vi.mocked(pullHousePrices).mockReturnValue(answer.promise);
    const button = pullButton();

    fireEvent.click(button);

    expect(pullHousePrices).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-busy", "true");
    });

    answer.resolve(
      saved({
        from: { month: 5, year: 2022 },
        name: "Home",
        pulledOn: "2026-10-08",
        to: { month: 6, year: 2026 },
        worth: 416424,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "House prices pulled" }),
      ).toHaveAccessibleDescription(
        "Home now £416,424; index to Jul 2026, the months after rolled forward from it",
      );
    });
    // The toast lands before the transition ends, so the pull frees a
    // beat after it.
    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-busy");
    });
  });

  it("says why when the pull is refused", async () => {
    vi.mocked(pullHousePrices).mockResolvedValue(
      refused("The Land Registry did not send its house price index"),
    );

    fireEvent.click(pullButton());

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "House prices not pulled" }),
      ).toHaveAccessibleDescription(
        "The Land Registry did not send its house price index",
      );
    });
  });
});
