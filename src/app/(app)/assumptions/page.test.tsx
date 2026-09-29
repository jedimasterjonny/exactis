import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { retiring } from "@/data/income.fixture";
import { curve } from "@/data/inflation.fixture";
import { rates } from "@/data/rates.fixture";
import { getCurve, getPlan, getRates } from "@/store/household";

import Assumptions from "./page";

vi.mock("@/store/household", () => ({
  getCurve: vi.fn(),
  getPlan: vi.fn(),
  getRates: vi.fn(),
}));
vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));
vi.mock("@/actions/plan", () => ({ saveRates: vi.fn() }));

describe("Assumptions", () => {
  it("says what the plan grows at and what its prices rise by, and hands the store's rates and curve to their cards", async () => {
    vi.mocked(getCurve).mockResolvedValue(curve);
    vi.mocked(getRates).mockResolvedValue(rates);
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
    expect(
      screen.getByRole("region", { name: "Curve, by maturity" }),
    ).toBeInTheDocument();
  });

  it("hands the card no curve before one is pulled", async () => {
    vi.mocked(getCurve).mockResolvedValue(null);
    vi.mocked(getPlan).mockResolvedValue(retiring);
    vi.mocked(getRates).mockResolvedValue(rates);

    render(await Assumptions());

    expect(screen.getByText("No curve pulled yet")).toBeInTheDocument();
  });
});
