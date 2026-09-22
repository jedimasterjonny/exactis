import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { getAccounts } from "@/store/accounts";
import { getPlan } from "@/store/plan";
import { getExpenseLines, getIncomeLines } from "@/store/schedule";

import Plan from "./page";

vi.mock("@/store/accounts", () => ({ getAccounts: vi.fn() }));
vi.mock("@/store/plan", () => ({ getPlan: vi.fn() }));
vi.mock("@/store/schedule", () => ({
  getExpenseLines: vi.fn(),
  getIncomeLines: vi.fn(),
}));
vi.mock("@/actions/schedule", () => ({
  removeIncomeLine: vi.fn(),
  saveExpenseLine: vi.fn(),
  saveIncomeLine: vi.fn(),
}));

const [salary] = incomeLines;

describe("Plan", () => {
  // The fixture's first year: the salary's £12,250 a month, less the
  // £1,000 sacrificed into the pension, against the household's £3,500,
  // the pension's, the ISA's and the mortgage's fixed sums, leaving
  // £1,607.
  it("hands the store's lines and the plan to both schedules under one header, and this year's cash flow beneath", async () => {
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getExpenseLines).mockResolvedValue([...expenseLines]);
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
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
    ).toStrictEqual([
      "Income by year",
      "Expenses by year",
      "Cash flow each month",
    ]);
    expect(screen.getByText("Age 68–89")).toBeInTheDocument();
    expect(screen.getByText("Age 82–89")).toBeInTheDocument();
    expect(
      screen.getByText(/10\.00% of the base into Workplace pension$/),
    ).toBeInTheDocument();
    // The two schedules' notes, and the hint under the cash flow's year.
    expect(screen.getAllByRole("paragraph")).toHaveLength(3);
    expect(
      screen.getByText("September 2026, age 36, in today's money"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Year" })).getByRole("slider", {
        hidden: true,
      }),
    ).toHaveValue("2026");
    expect(screen.getByText("Left over")).toBeInTheDocument();
    expect(screen.getByText("£1,607")).toHaveClass("figure", "font-medium");
  });

  // The salary alone, with nothing going out and no account to pay,
  // leaves all of its £12,250 a month.
  it("counts a single line in the singular and none as none", async () => {
    vi.mocked(getIncomeLines).mockResolvedValue([salary]);
    vi.mocked(getExpenseLines).mockResolvedValue([]);
    vi.mocked(getAccounts).mockResolvedValue([]);
    vi.mocked(getPlan).mockReturnValue(plan);

    render(await Plan());

    expect(
      screen.getByText("1 income line · 0 expense lines"),
    ).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.getAllByText("£12,250")).toHaveLength(2);
  });
});
