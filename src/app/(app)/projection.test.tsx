import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { getAccounts } from "@/store/accounts";
import { getPlan } from "@/store/plan";
import { getExpenseLines, getIncomeLines } from "@/store/schedule";

import { Projection } from "./projection";

vi.mock("@/store/accounts", () => ({ getAccounts: vi.fn() }));
vi.mock("@/store/plan", () => ({ getPlan: vi.fn() }));
vi.mock("@/store/schedule", () => ({
  getExpenseLines: vi.fn(),
  getIncomeLines: vi.fn(),
}));

describe("Projection", () => {
  // Born in 1990 and retiring at 59, the plan's owner retires within
  // the fixture's plan, which the chart marks.
  it("projects the store's accounts, lines and plan", async () => {
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getExpenseLines).mockResolvedValue([...expenseLines]);
    vi.mocked(getPlan).mockResolvedValue({ ...plan, retires: 59 });

    render(await Projection());

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.getByText("Tax-free")).toBeInTheDocument();
    expect(screen.getByText("Retirement")).toBeInTheDocument();
  });
});
