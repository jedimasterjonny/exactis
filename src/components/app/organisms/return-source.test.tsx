import type { ComponentProps } from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Cma, Deductions } from "@/data/cma";
import type { Answer } from "@/lib/answer";

import { pullCma } from "@/actions/cma";
import { saveDeductions } from "@/actions/plan";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { targets, targetsUnder } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";
import { heldBack } from "@/test/held-back";

import { ReturnSource } from "./return-source";

vi.mock("@/actions/cma", () => ({ pullCma: vi.fn() }));
vi.mock("@/actions/plan", () => ({ saveDeductions: vi.fn() }));

// The card over the reference household's sources, August's vintage,
// its target allocation and mappings, and 0.20% of fees and a 2% yield,
// with what is given in their place. A pull or a save reports through
// the toast manager, which needs its Toaster mounted.
function renderSource(
  given: Partial<ComponentProps<typeof ReturnSource>> = {},
): void {
  render(
    <ReturnSource
      cma={{ latest: cma, previous: null }}
      deductions={{ dividends: 0.02, fees: 0.002 }}
      mappings={mappings}
      targets={targets}
      {...given}
    />,
    { wrapper: Toaster },
  );
}

// The steps of the sleeve headed as given, as read across.
function stepsOf(heading: string): readonly (null | string)[] {
  return within(screen.getByRole("region", { name: heading }))
    .getAllByRole("listitem")
    .map((step) => step.textContent);
}

// The figure the sleeve headed as given comes to.
function totalOf(heading: string): null | string {
  const region = screen.getByRole("region", { name: heading });
  return region.querySelector("p")?.textContent ?? null;
}

describe("ReturnSource", () => {
  it("heads the card as the screen's second, naming the vintage", () => {
    renderSource();

    const card = screen.getByRole("region", { name: "Return source" });

    expect(within(card).getByText("Sect. V.ii")).toHaveClass("label");
    expect(within(card).getByText("BlackRock CMA · Aug 2026")).toHaveClass(
      "label",
    );
    expect(
      within(card).getByRole("button", { name: "Pull CMA workbook" }),
    ).toBeEnabled();
  });

  // Stocks blend to 8.044% with nothing hedged, less 0.20% of fees and
  // the 2% yield, to 5.84%. Bonds blend to 4.466%, hedging takes 0.015
  // of a point and fees 0.20%, to 4.25%. The index-linked gilts, which
  // nothing holds, are in the blend and have no step of their own, since
  // the steps are what the growth is worked out from.
  it("lays out a ledger a sleeve, from the blended return to the growth the rates take", () => {
    renderSource();

    expect(stepsOf("Equities")).toStrictEqual([
      "Blended 20y GBP returnWeighted by target allocation8.044%",
      "Fee dragFund OCFs plus platform charge−0.200pp",
      "Dividend yield, split outEntered separately and added back−2.000pp",
    ]);
    expect(totalOf("Equities")).toBe("Stocks growth5.84%");
    expect(stepsOf("Bonds")).toStrictEqual([
      "Blended 20y GBP returnGlobal bonds, hedged 70.00% of the sleeve4.466%",
      "GBP-hedging adjustmentCarried from US to UK cash, 20y point−0.015pp",
      "Fee dragSame basis as equities−0.200pp",
    ]);
    expect(totalOf("Bonds")).toBe("Bonds growth4.25%");
  });

  // All in equities, bonds stand in at stocks' return and weigh nothing.
  it("notes in place of a ledger that nothing blends into a sleeve", () => {
    renderSource({ targets: targetsUnder("Equity") });

    const bonds = screen.getByRole("region", { name: "Bonds" });

    expect(bonds).toHaveTextContent(
      "BondsNothing in the target allocation blends into bonds",
    );
    expect(within(bonds).queryByRole("listitem")).not.toBeInTheDocument();
    expect(totalOf("Equities")).toBe("Stocks growth5.84%");
  });

  // Each category under the sleeve its class blends into, in the file's
  // order. FTSE North America asks for nothing and has no class, so it
  // blends into neither and is left out; FTSE 100 asks for nothing too,
  // and is muted under equities.
  it("lays every category's share of the whole beneath the ledgers under the sleeve it blends into, a share of nothing muted", () => {
    renderSource();

    const weights = screen.getByRole("region", { name: "Target weights" });
    const equities = within(weights).getByRole("group", { name: "Equities" });
    const terms = within(equities).getAllByRole("term");
    const shares = within(equities).getAllByRole("definition");

    expect(terms.map((term) => term.textContent)).toStrictEqual([
      "FTSE Global All Cap ex-UK",
      "Global emerging markets",
      "UK equity",
      "Global small cap",
      "FTSE 100",
    ]);
    expect(
      within(within(weights).getByRole("group", { name: "Bonds" }))
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toStrictEqual([
      "Global bonds, hedged",
      "UK index-linked gilts, 5y+",
      "Short-dated gilts",
    ]);
    expect(shares[0]).toHaveTextContent("48.00%");
    expect(shares[0]).not.toHaveClass("text-muted-foreground");
    expect(shares[4]).toHaveTextContent("0.00%");
    expect(shares[4]).toHaveClass("text-muted-foreground");
    expect(terms[4]).toHaveClass("text-muted-foreground");
    expect(weights).toHaveTextContent(
      "From the Target allocation tab — portfolio targets, not current holdings.",
    );
  });

  it("states what the figures are, as of the vintage's day", () => {
    renderSource();

    expect(
      screen.getByText(
        "GBP rows, 20-year column, data as of 30 Jun 2026. Figures are nominal. Growth and dividend yield are added — never change one without the other.",
      ),
    ).toBeInTheDocument();
  });

  it("types the deductions at the head of the card, each with what it is", () => {
    renderSource();

    expect(field("Fee drag")).toHaveValue("0.20%");
    expect(field("Fee drag")).toHaveAccessibleDescription(
      "Fund OCFs plus platform charge, off both sleeves",
    );
    expect(field("Dividend yield")).toHaveValue("2.00%");
    expect(field("Dividend yield")).toHaveAccessibleDescription(
      "Split out of stocks' return and added back on top",
    );
  });

  // Fees of 0.25% take stocks to 5.79% and bonds to 4.20% at once, and
  // the stored deductions come back with the page rather than the
  // answer.
  it("saves a deduction alone as the focus leaves it, the ledgers following at once", async () => {
    const answer = heldBack<Answer<Deductions>>();
    vi.mocked(saveDeductions).mockReturnValue(answer.promise);
    renderSource();

    commit(field("Fee drag"), "0.25");

    await waitFor(() => {
      expect(totalOf("Equities")).toBe("Stocks growth5.79%");
    });
    expect(totalOf("Bonds")).toBe("Bonds growth4.20%");
    expect(saveDeductions).toHaveBeenCalledExactlyOnceWith({ fees: 0.0025 });

    answer.answer(saved({ dividends: 0.02, fees: 0.0025 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Deductions saved" }),
      ).toHaveAccessibleDescription("Fees 0.25% · dividend yield 2.00%");
    });
    await waitFor(() => {
      expect(totalOf("Equities")).toBe("Stocks growth5.84%");
    });
  });

  it("sends the dividend yield under its own name, and nothing for one typed back to what it was", async () => {
    vi.mocked(saveDeductions).mockResolvedValue(
      saved({ dividends: 0.025, fees: 0.002 }),
    );
    renderSource();

    commit(field("Fee drag"), "0.2");

    expect(saveDeductions).not.toHaveBeenCalled();

    commit(field("Dividend yield"), "2.5");

    expect(saveDeductions).toHaveBeenCalledExactlyOnceWith({
      dividends: 0.025,
    });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Deductions saved" }),
      ).toBeInTheDocument();
    });
  });

  it("puts a deduction back and says why when the store refuses it", async () => {
    vi.mocked(saveDeductions).mockResolvedValue(
      refused("A rate loses no more than everything"),
    );
    renderSource();

    commit(field("Fee drag"), "150");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Deductions not saved" }),
      ).toHaveAccessibleDescription("A rate loses no more than everything");
    });
    await waitFor(() => {
      expect(field("Fee drag")).toHaveValue("0.20%");
    });
  });

  it("pulls BlackRock's workbook, holding while it is on its way, and says what it pulled", async () => {
    const answer = heldBack<Answer<Cma>>();
    vi.mocked(pullCma).mockReturnValue(answer.promise);
    renderSource();
    const pull = screen.getByRole("button", { name: "Pull CMA workbook" });

    fireEvent.click(pull);

    await waitFor(() => {
      expect(pull).toBeDisabled();
    });

    answer.answer(saved(cma));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA pulled" }),
      ).toHaveAccessibleDescription("August 2026, data as of 30 Jun 2026");
    });
    await waitFor(() => {
      expect(pull).toBeEnabled();
    });
  });

  it("says why when the pull is refused", async () => {
    vi.mocked(pullCma).mockResolvedValue(
      refused("BlackRock did not send its capital market assumptions"),
    );
    renderSource();

    fireEvent.click(screen.getByRole("button", { name: "Pull CMA workbook" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA not pulled" }),
      ).toHaveAccessibleDescription(
        "BlackRock did not send its capital market assumptions",
      );
    });
  });

  it("says nothing has been pulled before a vintage is, and offers the pull", () => {
    renderSource({ cma: null });

    expect(screen.getByText("No CMA pulled yet")).toBeInTheDocument();
    expect(screen.queryByText(/^BlackRock CMA/)).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(field("Fee drag")).toHaveValue("0.20%");
    expect(
      screen.getByText(
        "GBP rows, 20-year column. Figures are nominal. Growth and dividend yield are added — never change one without the other.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing is blended before a target allocation is imported", () => {
    renderSource({ targets: null });

    expect(screen.getByText("No allocation imported yet")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("says what keeps the vintage from being blended, in the caution tone", () => {
    renderSource({ mappings: mappings.slice(1) });

    expect(screen.getByRole("note")).toHaveTextContent(
      "The CMA cannot be blended yetFTSE Global All Cap ex-UK has no CMA class. Set it right on the Target allocation tab, and the rates are derived again.",
    );
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
