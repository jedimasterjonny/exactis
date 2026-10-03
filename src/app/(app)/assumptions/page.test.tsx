import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Household } from "@/data/household";
import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { importTargets } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
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
import { getHousehold, getSourcesDaysAgo } from "@/store/household";
import { worksheet } from "@/test/dom";

import Assumptions from "./page";

vi.mock("@/store/household", () => ({
  getHousehold: vi.fn(),
  getSourcesDaysAgo: vi.fn(),
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

// The fixtures' August vintage and the reference's mappings onto it,
// 0.20% of fees and a 2% yield, the rates typed by hand live, the
// fixtures' split, curve and target allocation, and a plan whose owner
// retires at 59, laid over the household before anything is saved as
// the store reads it.
const household: Household = {
  ...soundKept(blank).household,
  allocation,
  cma: { latest: cma, previous: null },
  curve,
  deductions: { dividends: 0.02, fees: 0.002 },
  mappings,
  plan: retiring,
  rates,
  rateSet: "custom",
  targets,
};

describe("Assumptions", () => {
  beforeEach(() => {
    vi.mocked(getHousehold).mockResolvedValue(household);
    vi.mocked(getSourcesDaysAgo).mockResolvedValue(null);
  });

  it("says what the plan grows at and what its prices rise by, and hands the store's rates, split and curve to their cards", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      plan: { ...retiring, inflation: 0.0295, rate: 0.0725 },
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
    expect(worksheet("Custom rates, worked out").at(-1)).toStrictEqual([
      "Real return",
      "4.86%",
      "1.46%",
      "4.18%",
    ]);
    expect(
      screen.getByRole("region", { name: "Curve, by maturity" }),
    ).toBeInTheDocument();
  });

  // The page reads the day from the clock, so the ages are left unread.
  it("says above the tabs when each source was brought in, from the store's sources", async () => {
    render(await Assumptions());

    const [vintage, curveDay, imported, deductions] =
      screen.getAllByRole("definition");

    expect(vintage).toHaveTextContent(/^Aug 2026, data 30 Jun 2026 · /);
    expect(curveDay).toHaveTextContent(/^1 Sep 2026 · /);
    expect(imported).toHaveTextContent(/^Imported 3 Sep 2026 · /);
    expect(deductions).toHaveTextContent("Not dated");
  });

  it("hands the cards no curve and no CMA before either is pulled", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      cma: null,
      curve: null,
    });

    render(await Assumptions());

    expect(screen.getByText("No curve pulled yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    // A row a category, one for the group of them none of which is
    // blended before a CMA is pulled, and the header.
    expect(screen.getAllByRole("row")).toHaveLength(
      targets.categories.length + 1 + 1,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens on the rates, and hands the store's target allocation, the latest CMA and the mappings to its card in the tab beside them", async () => {
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
    const answer = Promise.withResolvers<Answer<Targets>>();
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

    answer.resolve(saved(targets));

    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  // August's blends less the deductions run stocks at 7.84% in all and
  // bonds at 4.25%, so the target allocation's four fifths in stocks grow
  // at 7.13%; the rates and the split typed by hand are kept, not shown.
  it("says the CMA-derived rates are live and lays out their worksheet, with the target split in place of the split typed", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      plan: { ...retiring, inflation: 0.0295, rate: 0.071255 },
      rateSet: "cma",
    });

    render(await Assumptions());

    expect(
      screen.getByText("Plan rate 7.13% · inflation 2.95% · CMA-derived rates"),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "From CMA" })).toBeChecked();
    expect(
      screen.getByRole("region", { name: "CMA-derived rates" }),
    ).toHaveTextContent("August 2026 CMA, data as of 30 Jun 2026");
    expect(screen.getByRole("textbox", { name: "Fee drag" })).toHaveValue(
      "0.20%",
    );
    expect(worksheet("CMA-derived rates, worked out")[0]).toStrictEqual([
      "Target weight",
      "80.00%",
      "20.00%",
      "100.00%",
    ]);
    expect(worksheet("CMA-derived rates, worked out")[4]).toStrictEqual([
      "Return",
      "7.84%",
      "4.25%",
      "7.13%",
    ]);
    expect(
      screen.queryByRole("textbox", { name: "Stocks share" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Inflation source" }),
    ).toHaveTextContent("Sect. V.ii");
  });

  // The household thirty days ago, with the same sources, so nothing has
  // moved the rates since.
  it("sets the CMA's rates beside the household's sources as they stood thirty days before", async () => {
    vi.mocked(getHousehold).mockResolvedValue({ ...household, rateSet: "cma" });
    vi.mocked(getSourcesDaysAgo).mockResolvedValue({
      savedOn: "2026-09-03",
      sources: {
        cma: household.cma,
        curve,
        deductions: household.deductions,
        mappings,
        targets,
      },
    });

    render(await Assumptions());

    expect(getSourcesDaysAgo).toHaveBeenCalledExactlyOnceWith(30);
    expect(
      screen.getByRole("region", { name: "What moved since 3 Sep 2026" }),
    ).toHaveTextContent("Nothing has moved the rates since 3 Sep 2026.");
  });
});
