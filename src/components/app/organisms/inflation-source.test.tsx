import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Curve } from "@/data/inflation";
import type { Answer } from "@/lib/answer";

import { pullCurve } from "@/actions/inflation";
import { Toaster } from "@/components/kit/toast";
import { curve } from "@/data/inflation.fixture";
import { refused, saved } from "@/lib/answer";
import { formatDay } from "@/lib/months";

import { InflationSource } from "./inflation-source";

vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));

// The card over the curve given, the reference kit's by default. A pull
// reports through the toast manager, which needs its Toaster mounted.
function renderSource(held: Curve | null = curve): void {
  render(<InflationSource curve={held} />, { wrapper: Toaster });
}

describe("InflationSource", () => {
  it("heads the card as the screen's fourth, naming the source", () => {
    renderSource();

    const card = screen.getByRole("region", { name: "Inflation source" });

    expect(within(card).getByText("Sect. VI.ii")).toHaveClass("label");
    expect(within(card).getByText("BoE implied curve")).not.toHaveClass(
      "label",
    );
    expect(
      within(card).getByRole("button", { name: "Pull latest curve" }),
    ).toBeEnabled();
  });

  // The reference kit's card: 3.365% on 1 September 2026, less 0.111
  // of the wedge for the 3.42 years before February 2030 and 0.3 for
  // the premium.
  it("lays out the steps from the curve to the inflation it derives", () => {
    renderSource();

    const steps = screen.getAllByRole("listitem");

    expect(steps.map((step) => step.textContent)).toStrictEqual([
      `BoE implied inflation, 20-yearGilt curve as at ${formatDay("2026-09-01")}3.365%`,
      "RPI → CPIH wedge, pre-Feb-2030 share3.42 / 20 of the 0.65pp wedge−0.111pp",
      "Inflation risk premiumStanding assumption−0.300pp",
    ]);
    expect(
      screen.getByRole("region", { name: "Inflation source" }),
    ).toHaveTextContent("−0.300ppDerived inflation2.95%");
  });

  it("sets the curve beside the steps, the point derived from in the foreground", () => {
    renderSource();

    const panel = screen.getByRole("region", { name: "Curve, by maturity" });
    const terms = within(panel).getAllByRole("term");
    const rates = within(panel).getAllByRole("definition");

    expect(terms.map((term) => term.textContent)).toStrictEqual([
      "5y",
      "10y",
      "20y",
      "30y",
    ]);
    expect(rates.map((rate) => rate.textContent)).toStrictEqual([
      "3.512%",
      "3.441%",
      "3.365%",
      "3.298%",
    ]);
    expect(terms[2]).not.toHaveClass("text-muted-foreground");
    expect(rates[2]).not.toHaveClass("text-muted-foreground");
    expect(terms[0]).toHaveClass("text-muted-foreground");
    expect(rates[3]).toHaveClass("text-muted-foreground");
    expect(panel).toHaveTextContent(
      "The 20-year point is the one derived from.",
    );
  });

  it("says no curve has been pulled before one is, what one is for, and offers the pull", () => {
    renderSource(null);

    expect(screen.getByText("No curve pulled yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pull the latest curve to derive inflation from the gilt market, as a check on the rate the plan is set to.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pull latest curve" }),
    ).toBeEnabled();
  });

  it("states the check every curve passes before it is kept", () => {
    renderSource(null);

    expect(
      screen.getByText(
        /^Nominal − real = implied is checked on every maturity/,
      ),
    ).toBeInTheDocument();
  });

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
    renderSource();

    const button = screen.getByRole("button", { name: "Pull latest curve" });
    fireEvent.click(button);

    expect(pullCurve).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(button).toBeDisabled();
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
      expect(button).toBeEnabled();
    });
  });

  it("says why when the pull is refused", async () => {
    vi.mocked(pullCurve).mockResolvedValue(
      refused("The Bank of England did not send its yield curves"),
    );
    renderSource();

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
