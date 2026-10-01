import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { importTargets } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
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
  getCurve,
  getPlan,
  getRates,
  getTargets,
} from "@/store/household";
import { heldBack } from "@/test/held-back";

import Assumptions from "./page";

vi.mock("@/store/household", () => ({
  getAllocation: vi.fn(),
  getCurve: vi.fn(),
  getPlan: vi.fn(),
  getRates: vi.fn(),
  getTargets: vi.fn(),
}));
vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));
vi.mock("@/actions/targets", () => ({ importTargets: vi.fn() }));
vi.mock("@/actions/plan", () => ({
  saveAllocation: vi.fn(),
  saveRates: vi.fn(),
}));

describe("Assumptions", () => {
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

  it("hands the card no curve before one is pulled", async () => {
    vi.mocked(getAllocation).mockResolvedValue(allocation);
    vi.mocked(getCurve).mockResolvedValue(null);
    vi.mocked(getPlan).mockResolvedValue(retiring);
    vi.mocked(getRates).mockResolvedValue(rates);
    vi.mocked(getTargets).mockResolvedValue(null);

    render(await Assumptions());

    expect(screen.getByText("No curve pulled yet")).toBeInTheDocument();
  });

  it("opens on the rates, and hands the store's target allocation to its card in the tab beside them", async () => {
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
});
