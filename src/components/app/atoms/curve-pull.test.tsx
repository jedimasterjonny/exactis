import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Curve } from "@/data/inflation";
import type { Answer } from "@/lib/answer";

import { pullCurve } from "@/actions/inflation";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { formatDay } from "@/lib/months";

import { CurvePull } from "./curve-pull";

vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));

describe("CurvePull", () => {
  // The page is drawn again from the store's curve, which the toast
  // reads: 3.459% at 20 years on 24 September, less 0.109 of the wedge
  // and the premium.
  it("holds the pull while it is on its way, then says what it derives", async () => {
    const pulled = {
      asOf: "2026-09-24",
      implied: { 5: 0.03777, 10: 0.0346, 20: 0.03459, 30: 0.03492 },
    };
    const answer = Promise.withResolvers<Answer<Curve>>();
    vi.mocked(pullCurve).mockReturnValue(answer.promise);
    render(<CurvePull />, { wrapper: Toaster });

    const button = screen.getByRole("button", { name: "Pull latest curve" });
    fireEvent.click(button);

    expect(pullCurve).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-busy", "true");
    });

    answer.resolve(saved(pulled));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Curve pulled" }),
      ).toHaveAccessibleDescription(
        `As at ${formatDay("2026-09-24")}, derived inflation 3.05%`,
      );
    });
    // The toast lands before the transition ends, so the pull frees a
    // beat after it.
    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-busy");
    });
  });

  it("says why when the pull is refused", async () => {
    vi.mocked(pullCurve).mockResolvedValue(
      refused("The Bank of England did not send its yield curves"),
    );
    render(<CurvePull />, { wrapper: Toaster });

    fireEvent.click(screen.getByRole("button", { name: "Pull latest curve" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Curve not pulled" }),
      ).toHaveAccessibleDescription(
        "The Bank of England did not send its yield curves",
      );
    });
  });
});
