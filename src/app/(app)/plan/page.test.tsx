import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";

import { getPlan } from "../store";
import Plan from "./page";
import { getExpenseLines, getIncomeLines } from "./store";

vi.mock("../store", () => ({ getPlan: vi.fn() }));
vi.mock("./store", () => ({
  getExpenseLines: vi.fn(),
  getIncomeLines: vi.fn(),
}));
vi.mock("./actions", () => ({
  saveExpenseLine: vi.fn(),
  saveIncomeLine: vi.fn(),
}));

const [salary] = incomeLines;

describe("Plan", () => {
  it("hands the store's lines and the plan to both schedules under one header", async () => {
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getExpenseLines).mockResolvedValue([...expenseLines]);
    vi.mocked(getPlan).mockReturnValue(plan);

    render(await Plan());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Income & expenses",
    );
    expect(screen.getByText("Sect. III · Plan")).toHaveClass("label");
    expect(
      screen.getByText("4 income lines · 5 expense lines"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toStrictEqual(["Income by year", "Expenses by year"]);
    expect(screen.getByText("Age 68–89")).toBeInTheDocument();
    expect(screen.getByText("Age 82–89")).toBeInTheDocument();
    expect(screen.getAllByRole("paragraph")).toHaveLength(2);
  });

  it("counts a single line in the singular and none as none", async () => {
    vi.mocked(getIncomeLines).mockResolvedValue([salary]);
    vi.mocked(getExpenseLines).mockResolvedValue([]);
    vi.mocked(getPlan).mockReturnValue(plan);

    render(await Plan());

    expect(
      screen.getByText("1 income line · 0 expense lines"),
    ).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
  });
});
