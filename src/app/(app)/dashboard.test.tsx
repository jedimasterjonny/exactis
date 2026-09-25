import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { getAccounts } from "@/store/accounts";
import { getPlan } from "@/store/plan";
import { getExpenseLines, getIncomeLines } from "@/store/schedule";

import { Dashboard, DashboardPending } from "./dashboard";

vi.mock("@/actions/plan", () => ({ saveAges: vi.fn() }));
vi.mock("@/store/accounts", () => ({ getAccounts: vi.fn() }));
vi.mock("@/store/plan", () => ({ getPlan: vi.fn() }));
vi.mock("@/store/schedule", () => ({
  getExpenseLines: vi.fn(),
  getIncomeLines: vi.fn(),
}));

describe("Dashboard", () => {
  // The fixture's plan runs to 2079 for someone born in 1990, so to 89,
  // and they retire at 59, in 2049, within it.
  beforeEach(() => {
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getExpenseLines).mockResolvedValue([...expenseLines]);
    vi.mocked(getPlan).mockResolvedValue({ ...plan, retires: 59 });
  });

  it("opens with the dashboard header, titled with the age the plan runs to", async () => {
    render(await Dashboard());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 89",
    );
    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
  });

  // Born in 1990, a plan that runs 30 years from 2026 runs to 66, and
  // the header and the net worth tile both read it.
  it("reads the age from the plan rather than holding one", async () => {
    vi.mocked(getPlan).mockResolvedValue({ ...plan, years: 30 });

    render(await Dashboard());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 66",
    );
    expect(screen.getByText("Net worth at 66")).toBeInTheDocument();
  });

  it("opens the meta line with the plan's state badges", async () => {
    render(await Dashboard());

    expect(screen.getByText("On track")).toHaveAttribute(
      "data-variant",
      "positive",
    );
    expect(screen.getByText("CMA-derived · Aug 26")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("offers the assumptions action in the header", async () => {
    render(await Dashboard());

    expect(
      screen.getByRole("button", { name: "Assumptions" }),
    ).toBeInTheDocument();
  });

  // Retiring past the end of the plan, so the chart marks nothing and
  // each label is the tile's own.
  it("follows the header with the four dashboard tiles", async () => {
    vi.mocked(getPlan).mockResolvedValue(plan);

    render(await Dashboard());

    for (const label of [
      "Retirement",
      "Net worth at 89",
      "Chance of success",
      "Net legacy",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // Retirement is named twice, the tile's label and the chart's mark,
  // and the tile reads the plan's age.
  it("follows the tiles with the store's projection, marked where its owner retires", async () => {
    render(await Dashboard());

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.getByText("Tax-free")).toBeInTheDocument();
    expect(screen.getAllByText("Retirement")).toHaveLength(2);
    expect(screen.getByText("Last working year 58")).toBeInTheDocument();
  });
});

describe("DashboardPending", () => {
  it("holds the header and the chart's frame while the store answers", () => {
    render(<DashboardPending />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age …",
    );
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Reading the store…",
    );
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });
});
