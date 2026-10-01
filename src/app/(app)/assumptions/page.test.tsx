import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { importTargets } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { retiring } from "@/data/income.fixture";
import { curve } from "@/data/inflation.fixture";
import { allocation, rates } from "@/data/rates.fixture";
import { targets } from "@/data/targets.fixture";
import { saved } from "@/lib/answer";
import {
  clientOf,
  portfolioFile,
  reference,
} from "@/lib/portfolio-file.fixture";
import {
  getAllocation,
  getCma,
  getCurve,
  getDeductions,
  getMappings,
  getPlan,
  getRates,
  getRateSet,
  getTargets,
} from "@/store/household";
import { heldBack } from "@/test/held-back";

import Assumptions from "./page";

vi.mock("@/store/household", () => ({
  getAllocation: vi.fn(),
  getCma: vi.fn(),
  getCurve: vi.fn(),
  getDeductions: vi.fn(),
  getMappings: vi.fn(),
  getPlan: vi.fn(),
  getRates: vi.fn(),
  getRateSet: vi.fn(),
  getTargets: vi.fn(),
}));
vi.mock("@/actions/cma", () => ({ pullCma: vi.fn() }));
vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));
vi.mock("@/actions/targets", () => ({
  importTargets: vi.fn(),
  mapByName: vi.fn(),
  mapCategory: vi.fn(),
}));
vi.mock("@/actions/plan", () => ({
  saveAllocation: vi.fn(),
  saveDeductions: vi.fn(),
  saveRates: vi.fn(),
  saveRateSet: vi.fn(),
}));

describe("Assumptions", () => {
  // The August vintage and the reference's mappings onto it, 0.20% of
  // fees and a 2% yield, and the rates typed by hand live.
  beforeEach(() => {
    vi.mocked(getCma).mockResolvedValue({ latest: cma, previous: null });
    vi.mocked(getDeductions).mockResolvedValue({
      dividends: 0.02,
      fees: 0.002,
    });
    vi.mocked(getMappings).mockResolvedValue(mappings);
    vi.mocked(getRateSet).mockResolvedValue("custom");
  });

  it("says what the plan grows at and what its prices rise by, and hands the store's rates, split and curve to their cards", async () => {
    vi.mocked(getAllocation).mockResolvedValue(allocation);
    vi.mocked(getCurve).mockResolvedValue(curve);
    vi.mocked(getRates).mockResolvedValue(rates);
    vi.mocked(getTargets).mockResolvedValue(targets);
    vi.mocked(getPlan).mockResolvedValue({
      ...retiring,
      inflation: 0.0295,
      rate: 0.0725,
    });

    render(await Assumptions());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Plan assumptions",
    );
    expect(screen.getByText("Sect. V · Assumptions")).toHaveClass("label");
    expect(
      screen.getByText("Plan rate 7.25% · inflation 2.95% · custom rates"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Stocks growth" })).toHaveValue(
      "5.95%",
    );
    expect(screen.getByRole("textbox", { name: "Stocks share" })).toHaveValue(
      "80.00%",
    );
    expect(
      screen.getByRole("region", { name: "Curve, by maturity" }),
    ).toBeInTheDocument();
  });

  it("hands the cards no curve and no CMA before either is pulled", async () => {
    vi.mocked(getAllocation).mockResolvedValue(allocation);
    vi.mocked(getCma).mockResolvedValue(null);
    vi.mocked(getCurve).mockResolvedValue(null);
    vi.mocked(getPlan).mockResolvedValue(retiring);
    vi.mocked(getRates).mockResolvedValue(rates);
    vi.mocked(getTargets).mockResolvedValue(targets);

    render(await Assumptions());

    expect(screen.getByText("No curve pulled yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    expect(screen.getAllByRole("row")).toHaveLength(
      targets.categories.length + 1,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens on the rates, and hands the store's target allocation, the latest CMA and the mappings to its card in the tab beside them", async () => {
    vi.mocked(getAllocation).mockResolvedValue(allocation);
    vi.mocked(getCurve).mockResolvedValue(curve);
    vi.mocked(getPlan).mockResolvedValue(retiring);
    vi.mocked(getRates).mockResolvedValue(rates);
    vi.mocked(getTargets).mockResolvedValue(targets);

    render(await Assumptions());

    expect(screen.getByRole("tab", { name: "Rates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("region", { name: "Target allocation" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    expect(
      screen.getByRole("region", { name: "Target allocation" }),
    ).toHaveTextContent("Imported 3 Sep 2026");
    expect(
      screen.getAllByRole("combobox", { name: "CMA class for UK equity" })[0],
    ).toHaveValue("UK large cap equities");
    expect(
      screen.queryByRole("region", { name: "Custom rates" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Plan rate .+ custom rates$/)).toBeInTheDocument();
  });

  // A tab left is kept rather than drawn afresh, so the import is still
  // held when the tab is opened again, and a second cannot be started
  // over it.
  it("keeps an import held while the rates are open", async () => {
    vi.mocked(getAllocation).mockResolvedValue(allocation);
    vi.mocked(getCurve).mockResolvedValue(curve);
    vi.mocked(getPlan).mockResolvedValue(retiring);
    vi.mocked(getRates).mockResolvedValue(rates);
    vi.mocked(getTargets).mockResolvedValue(targets);
    const answer = heldBack<Answer<Targets>>();
    vi.mocked(importTargets).mockReturnValue(answer.promise);
    render(await Assumptions(), { wrapper: Toaster });

    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));
    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: {
        files: [
          new File(
            [portfolioFile(clientOf([["Asset Allocation", reference]]))],
            "PortfolioPerformance.portfolio",
          ),
        ],
      },
    });
    await waitFor(() => {
      expect(importTargets).toHaveBeenCalledOnce();
    });
    fireEvent.click(screen.getByRole("tab", { name: "Rates" }));
    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    const button = screen.getByRole("button", {
      name: "Reload from Portfolio Performance",
    });

    expect(button).toBeDisabled();

    answer.answer(saved(targets));

    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  // August's blends less the deductions run stocks at 7.84% in all and
  // bonds at 4.25%, so the target allocation's four fifths in stocks grow
  // at 7.13%; the rates and the split typed by hand are kept, not shown.
  it("says the CMA-derived rates are live, lays out their return source, and shows the target split in place of the split typed", async () => {
    vi.mocked(getAllocation).mockResolvedValue(allocation);
    vi.mocked(getCurve).mockResolvedValue(curve);
    vi.mocked(getPlan).mockResolvedValue({
      ...retiring,
      inflation: 0.0295,
      rate: 0.071255,
    });
    vi.mocked(getRates).mockResolvedValue(rates);
    vi.mocked(getRateSet).mockResolvedValue("cma");
    vi.mocked(getTargets).mockResolvedValue(targets);

    render(await Assumptions());

    expect(
      screen.getByText("Plan rate 7.13% · inflation 2.95% · CMA-derived rates"),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "From CMA" })).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "Stocks growth" }),
    ).toHaveAttribute("readonly");
    expect(
      screen.getByRole("region", { name: "Return source" }),
    ).toHaveTextContent("BlackRock CMA · Aug 2026");
    expect(screen.getByRole("textbox", { name: "Fee drag" })).toHaveValue(
      "0.20%",
    );
    expect(
      screen.getByRole("region", { name: "Weighted CMA return" }),
    ).toHaveTextContent("80.0 / 20.0");
    expect(
      screen.queryByRole("region", { name: "Allocation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Stocks share" }),
    ).not.toBeInTheDocument();
  });
});
