import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { curve } from "@/data/inflation.fixture";
import { formatDay } from "@/lib/months";
import { getCurve } from "@/store/household";

import Assumptions from "./page";

vi.mock("@/store/household", () => ({ getCurve: vi.fn() }));
vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));

describe("Assumptions", () => {
  it("says what the plan takes for inflation and hands the store's curve to its card", async () => {
    vi.mocked(getCurve).mockResolvedValue(curve);

    render(await Assumptions());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Plan assumptions",
    );
    expect(screen.getByText("Sect. V · Assumptions")).toHaveClass("label");
    expect(
      screen.getByText(
        `Inflation 2.95% · gilt curve as at ${formatDay("2026-09-01")}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Curve, by maturity" }),
    ).toBeInTheDocument();
  });

  it("says no curve has been pulled before one is", async () => {
    vi.mocked(getCurve).mockResolvedValue(null);

    render(await Assumptions());

    expect(
      screen.getByText("No inflation curve pulled yet"),
    ).toBeInTheDocument();
    expect(screen.getByText("No curve pulled yet")).toBeInTheDocument();
  });
});
