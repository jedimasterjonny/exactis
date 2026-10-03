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
import type { RateSet as Chosen } from "@/data/rates";
import type { Answer } from "@/lib/answer";

import { pullCma } from "@/actions/cma";
import { saveDeductions, saveRateSet } from "@/actions/plan";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { curve } from "@/data/inflation.fixture";
import { allocation, rates } from "@/data/rates.fixture";
import { targets, targetsUnder } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field, worksheet } from "@/test/dom";
import { heldBack } from "@/test/held-back";

import { RateSet } from "./rate-set";

vi.mock("@/actions/cma", () => ({ pullCma: vi.fn() }));
vi.mock("@/actions/plan", () => ({
  saveAllocation: vi.fn(),
  saveDeductions: vi.fn(),
  saveRates: vi.fn(),
  saveRateSet: vi.fn(),
}));

// A vintage of the month given, each class returning what August's does
// and the fraction given on top.
function shifted(by: number, month: number): Cma {
  return {
    ...cma,
    assets: cma.assets.map((asset) => ({ ...asset, rate: asset.rate + by })),
    vintage: { month, year: 2026 },
  };
}

// The CMA worksheet's name.
const derived = "CMA-derived rates, worked out";

// May's vintage, each class returning a tenth of a point more than
// August's.
const may = shifted(0.001, 4);

// The card, as a region named by the title it has under the set given.
function cardOf(title: string): HTMLElement {
  return screen.getByRole("region", { name: title });
}

// The set given over the rates and the split the design shows typed by
// hand, and the reference household's sources for the CMA's: August's
// vintage with May's before it, the first of September's curve, its
// target allocation and mappings, and 0.20% of fees and a 2% yield. A
// save reports through the toast manager, which needs its Toaster
// mounted.
function renderSet(
  rateSet: Chosen = "custom",
  sources: Partial<ComponentProps<typeof RateSet>> = {},
): void {
  render(
    <RateSet
      allocation={allocation}
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

describe("RateSet", () => {
  it("cautions that the rates typed by hand are live, and why that costs", () => {
    renderSet();

    expect(screen.getByRole("note")).toHaveTextContent(
      "Custom rates are live — the CMA derivation is set asideHand-typed rates do not move when you pull a new CMA or BoE curve, and nothing warns you when they go stale.",
    );
  });

  it("heads the card as the screen's first, with the choice of set in its header, the custom rates chosen and historical returns refused", () => {
    renderSet();

    const card = cardOf("Custom rates");
    const choice = within(card).getByRole("radiogroup", { name: "Rate set" });
    const custom = within(choice).getByRole("radio", { name: "Custom" });
    const derived = within(choice).getByRole("radio", { name: "From CMA" });
    const historical = within(choice).getByRole("radio", {
      name: "Historical",
    });

    expect(within(card).getByText("Sect. V.i")).toHaveClass("label");
    expect(card).toHaveTextContent("Typed by hand, flat for life");
    expect(custom).toBeChecked();
    expect(custom).toHaveAccessibleDescription(
      "One rate per class, typed by hand, flat for life",
    );
    expect(derived).not.toBeChecked();
    expect(derived).toHaveAccessibleDescription(
      "Derived from the capital market assumptions and your target allocation",
    );
    expect(historical).toHaveAttribute("aria-disabled", "true");
    expect(historical).toHaveAccessibleDescription(
      "Returns replayed from history, not built yet",
    );
  });

  it("lays out the rates and the split typed by hand under the custom rates, with the derivation set aside", () => {
    renderSet();

    expect(field("Stocks growth", cardOf("Custom rates"))).toHaveValue("5.95%");
    expect(field("Stocks share")).toHaveValue("80.00%");
    expect(
      screen.getByRole("table", { name: "Custom rates, worked out" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "CMA-derived rates, worked out" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "For the CMA's rates" }),
    ).toHaveTextContent(
      "Set aside while the custom rates are live, and taken up as they stand when From CMA is chosen.",
    );
  });

  // The deductions are typed under the custom rates too, so they are
  // ready before the CMA's are chosen.
  it("types the deductions under the custom rates as well, set aside, and saves them", async () => {
    vi.mocked(saveDeductions).mockResolvedValue(
      saved({ dividends: 0.02, fees: 0.0025 }),
    );
    renderSet();
    const aside = screen.getByRole("region", { name: "For the CMA's rates" });

    expect(field("Dividend yield", aside)).toHaveValue("2.00%");

    commit(field("Fee drag", aside), "0.25");

    expect(saveDeductions).toHaveBeenCalledExactlyOnceWith({ fees: 0.0025 });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Deductions saved" }),
      ).toBeInTheDocument();
    });
  });

  // May priced every class a tenth of a point higher, so August moved
  // stocks down by 0.10 of a point.
  it("lays out the worksheet under the CMA's rates, saying which vintage it reads and how far it moved stocks", () => {
    renderSet("cma");

    const card = cardOf("CMA-derived rates");

    expect(card).toHaveTextContent(
      "August 2026 CMA, data as of 30 Jun 2026 · stocks down 0.10pp on May 2026",
    );
    expect(
      within(card).getByRole("table", {
        name: "CMA-derived rates, worked out",
      }),
    ).toBeInTheDocument();
    expect(field("Fee drag", card)).toHaveValue("0.20%");
    expect(
      screen.queryByRole("textbox", { name: "Stocks share" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says a vintage moved stocks up when it prices them higher than the one before", () => {
    renderSet("cma", { cma: { latest: cma, previous: shifted(-0.001, 4) } });

    expect(cardOf("CMA-derived rates")).toHaveTextContent(
      "· stocks up 0.10pp on May 2026",
    );
  });

  it("gives no move before a vintage before the latest is pulled", () => {
    renderSet("cma", { cma: { latest: cma, previous: null } });

    expect(
      screen.getByText("August 2026 CMA, data as of 30 Jun 2026"),
    ).toBeInTheDocument();
  });

  it("gives no move while nothing blends into stocks", () => {
    renderSet("cma", { targets: targetsUnder("Bonds") });

    expect(
      screen.getByText("August 2026 CMA, data as of 30 Jun 2026"),
    ).toBeInTheDocument();
  });

  it("says no CMA is pulled before one is", () => {
    renderSet("cma", { cma: null });

    expect(cardOf("CMA-derived rates")).toHaveTextContent("No CMA pulled yet");
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
    expect(cardOf("CMA-derived rates")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
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

  it("types the deductions at the head of the worksheet under the CMA's rates, each with what it is", () => {
    renderSet("cma");

    expect(field("Fee drag")).toHaveValue("0.20%");
    expect(field("Fee drag")).toHaveAccessibleDescription(
      "Fund OCFs plus platform charge, off both sleeves",
    );
    expect(field("Dividend yield")).toHaveValue("2.00%");
    expect(field("Dividend yield")).toHaveAccessibleDescription(
      "Split out of stocks' return and added back on top",
    );
  });

  // Fees of 0.25% take stocks to 7.79% and bonds to 4.20% at once, and
  // the stored deductions come back with the page rather than the
  // answer.
  it("saves a deduction alone as the focus leaves it, the worksheet following at once", async () => {
    const answer = heldBack<Answer<Deductions>>();
    vi.mocked(saveDeductions).mockReturnValue(answer.promise);
    renderSet("cma");

    commit(field("Fee drag"), "0.25");

    await waitFor(() => {
      expect(worksheet(derived)[4]).toStrictEqual([
        "Return",
        "7.79%",
        "4.20%",
        "7.08%",
      ]);
    });
    expect(saveDeductions).toHaveBeenCalledExactlyOnceWith({ fees: 0.0025 });

    answer.answer(saved({ dividends: 0.02, fees: 0.0025 }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Deductions saved" }),
      ).toHaveAccessibleDescription("Fees 0.25% · dividend yield 2.00%");
    });
    await waitFor(() => {
      expect(worksheet(derived)[4]?.[1]).toBe("7.84%");
    });
  });

  // A yield of 2.5% moves half a point of stocks' return from growth to
  // yield, and their return stays at 7.84%.
  it("sends the dividend yield under its own name, moving return from growth to yield, and nothing for one typed back to what it was", async () => {
    const answer = heldBack<Answer<Deductions>>();
    vi.mocked(saveDeductions).mockReturnValue(answer.promise);
    renderSet("cma");

    commit(field("Fee drag"), "0.2");

    expect(saveDeductions).not.toHaveBeenCalled();

    commit(field("Dividend yield"), "2.5");

    expect(saveDeductions).toHaveBeenCalledExactlyOnceWith({
      dividends: 0.025,
    });
    await waitFor(() => {
      expect(worksheet(derived).slice(4, 7)).toStrictEqual([
        ["Return", "7.84%", "4.25%", "7.13%"],
        ["Growth", "5.34%", "4.25%", "5.13%"],
        ["Dividend yield", "2.50%", "—", "2.00%"],
      ]);
    });

    answer.answer(saved({ dividends: 0.025, fees: 0.002 }));

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
    renderSet("cma");

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

  it("says when the deductions were last set", () => {
    renderSet("cma", {
      deductions: { dividends: 0.02, fees: 0.002, setOn: "2026-09-03" },
    });

    expect(cardOf("CMA-derived rates")).toHaveTextContent(
      "Fees and yield last set or confirmed 3 Sep 2026",
    );
  });

  it("says the deductions are not dated while no day is kept, under either set", () => {
    renderSet();

    expect(
      screen.getByRole("region", { name: "For the CMA's rates" }),
    ).toHaveTextContent(
      "Fees and yield are not dated: they were set before the day was kept",
    );
  });

  // Confirming sends nothing to change, so the store keeps both and
  // dates them today; the press holds while it is asked.
  it("confirms the deductions still right, holding while the store is asked, and says so under a toast", async () => {
    const answer = heldBack<Answer<Deductions>>();
    vi.mocked(saveDeductions).mockReturnValue(answer.promise);
    renderSet("cma");
    const confirm = screen.getByRole("button", { name: "Still right" });

    fireEvent.click(confirm);

    expect(saveDeductions).toHaveBeenCalledExactlyOnceWith({});
    await waitFor(() => {
      expect(confirm).toBeDisabled();
    });

    answer.answer(saved({ dividends: 0.02, fees: 0.002, setOn: "2026-10-03" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Deductions confirmed" }),
      ).toHaveAccessibleDescription("Fees 0.20% · dividend yield 2.00%");
    });
    await waitFor(() => {
      expect(confirm).toBeEnabled();
    });
  });

  // The pull is offered under the custom rates too, so a vintage can be
  // pulled before the CMA's rates are chosen.
  it("pulls BlackRock's workbook under either set, holding while it is on its way, and says what it pulled", async () => {
    const answer = heldBack<Answer<Cma>>();
    vi.mocked(pullCma).mockReturnValue(answer.promise);
    renderSet();
    const pull = within(cardOf("Custom rates")).getByRole("button", {
      name: "Pull CMA workbook",
    });

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
    renderSet("cma");

    fireEvent.click(screen.getByRole("button", { name: "Pull CMA workbook" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA not pulled" }),
      ).toHaveAccessibleDescription(
        "BlackRock did not send its capital market assumptions",
      );
    });
  });
});
