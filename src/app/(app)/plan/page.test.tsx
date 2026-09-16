import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { incomeLines, plan } from "@/data/income.fixture";

import { getPlan } from "../store";
import Plan from "./page";
import { getIncomeLines } from "./store";

vi.mock("../store", () => ({ getPlan: vi.fn() }));
vi.mock("./store", () => ({ getIncomeLines: vi.fn() }));
vi.mock("./actions", () => ({ saveIncomeLine: vi.fn() }));

const [salary] = incomeLines;

describe("Plan", () => {
  it("hands the store's lines and the plan to the schedule under the header", async () => {
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getPlan).mockReturnValue(plan);

    render(await Plan());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Income & expenses",
    );
    expect(screen.getByText("Sect. III · Plan")).toHaveClass("label");
    expect(screen.getByText("4 income lines")).toBeInTheDocument();
    expect(screen.getByText("Age 68–89")).toBeInTheDocument();
  });

  it("counts a single line in the singular", async () => {
    vi.mocked(getIncomeLines).mockResolvedValue([salary]);
    vi.mocked(getPlan).mockReturnValue(plan);

    render(await Plan());

    expect(screen.getByText("1 income line")).toBeInTheDocument();
  });
});
