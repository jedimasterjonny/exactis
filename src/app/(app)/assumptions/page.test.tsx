import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { retiring } from "@/data/income.fixture";
import { curve } from "@/data/inflation.fixture";
import { getCurve, getPlan } from "@/store/household";

import Assumptions from "./page";

vi.mock("@/store/household", () => ({ getCurve: vi.fn(), getPlan: vi.fn() }));
vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));

describe("Assumptions", () => {
  it("says what the plan grows at and what its prices rise by, and hands the store's curve to its card", async () => {
    vi.mocked(getCurve).mockResolvedValue(curve);
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
    expect(
      screen.getByRole("region", { name: "Curve, by maturity" }),
    ).toBeInTheDocument();
  });

  it("hands the card no curve before one is pulled", async () => {
    vi.mocked(getCurve).mockResolvedValue(null);
    vi.mocked(getPlan).mockResolvedValue(retiring);

    render(await Assumptions());

    expect(screen.getByText("No curve pulled yet")).toBeInTheDocument();
  });
});
