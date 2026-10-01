import type { ComponentProps } from "react";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cma, mappings } from "@/data/cma.fixture";
import { targets, targetsUnder } from "@/data/targets.fixture";
import { bySlot } from "@/test/dom";

import { WeightedReturn } from "./weighted-return";

// The card, as a region named by its title.
function cardOf(): HTMLElement {
  return screen.getByRole("region", { name: "Weighted CMA return" });
}

// The card over the reference's August vintage, target allocation and
// mappings, with what is given in their place.
function renderReturn(
  given: Partial<ComponentProps<typeof WeightedReturn>> = {},
): void {
  render(
    <WeightedReturn
      cma={{ latest: cma, previous: null }}
      mappings={mappings}
      targets={targets}
      {...given}
    />,
  );
}

describe("WeightedReturn", () => {
  // Stocks blend to 8.0441% and bonds to 4.4655% less 0.0147 of a point
  // of hedging, 4.4508%; four fifths and a fifth come to 7.3254%.
  it("shows the target split and what the vintage expects of each sleeve and of the two together", () => {
    renderReturn();
    const card = cardOf();

    expect(within(card).getByText("Sect. V.iii")).toHaveClass("label");
    expect(within(card).getByText("Target split")).toHaveClass("label");
    expect(within(card).getByText("80.0 / 20.0")).toHaveClass("figure");
    expect(
      within(card).getByText(bySlot("split-bar-stocks"), { suggest: false }),
    ).toHaveStyle({ width: "80%" });
    expect(
      within(card)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toStrictEqual(["Equities", "Bonds", "Portfolio"]);
    expect(
      within(card)
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual(["8.044%", "4.451%", "7.325%"]);
    expect(card).toHaveTextContent(
      "Change a target weight and the CMA-derived rates above move with it.",
    );
  });

  // All in equities, the portfolio earns what equities do.
  it("dashes a sleeve nothing in the target allocation blends into", () => {
    renderReturn({ targets: targetsUnder("Equity") });
    const card = cardOf();

    expect(within(card).getByText("100.0 / 0.0")).toHaveClass("figure");
    expect(
      within(card)
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toStrictEqual(["8.044%", "—", "8.044%"]);
  });

  it("says what is missing in place of the figures while the vintage makes no blend", () => {
    renderReturn({ mappings: mappings.slice(1) });
    const card = cardOf();

    expect(card).toHaveTextContent(
      "FTSE Global All Cap ex-UK has no CMA class",
    );
    expect(within(card).queryByRole("term")).not.toBeInTheDocument();
  });

  it("says no CMA is pulled before one is", () => {
    renderReturn({ cma: null });
    const card = cardOf();

    expect(card).toHaveTextContent("No CMA is pulled");
    expect(within(card).queryByText("Target split")).not.toBeInTheDocument();
  });
});
