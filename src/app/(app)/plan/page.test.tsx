import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { owners } from "@/data/owners.fixture";
import { getHousehold } from "@/store/household";

import Plan from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));
vi.mock("@/actions/milestones", () => ({
  removeMilestone: vi.fn(),
  saveMilestone: vi.fn(),
}));
vi.mock("@/actions/schedule", () => ({
  removeExpenseLine: vi.fn(),
  removeIncomeLine: vi.fn(),
  saveExpenseLine: vi.fn(),
  saveIncomeLine: vi.fn(),
}));

const [salary] = incomeLines;

// The household before anything is saved, as the store reads it, for
// each test to lay what the page reads over.
const { household } = soundKept(blank);

describe("Plan", () => {
  // The fixture's first year: the salary's £12,250 a month, less the
  // £1,000 sacrificed into the pension and the tax on the rest, against
  // the household's £3,500, and the pension's and the ISA's fixed sums
  // taking all that leaves before the mortgage's is reached, so the last
  // of the ledger's figures, what is left, is nothing.
  it("hands the store's milestones, lines and plan to their cards under one header, and this year's cash flow beneath", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [...accounts],
      milestones: [...milestones],
      owners: [...owners],
      plan,
      schedule: { expenses: [...expenseLines], income: [...incomeLines] },
    });

    render(await Plan());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Income & expenses",
    );
    expect(screen.getByText("Sect. III · Plan")).toHaveClass("label");
    expect(
      screen.getByText("3 milestones · 4 income lines · 5 expense lines"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toStrictEqual([
      "Milestones",
      "Income by year",
      "Expenses by year",
      "Year by year",
    ]);
    expect(screen.getByText("Age 68–89")).toBeInTheDocument();
    expect(screen.getByText("Age 82–89")).toBeInTheDocument();
    // Written in the salary's columns and again on its folded lines, only
    // one of which is on screen at any width.
    expect(
      screen.getAllByText(/10\.00% of the base into Workplace pension$/),
    ).toHaveLength(2);
    // The two schedules' notes.
    expect(screen.getAllByRole("paragraph")).toHaveLength(2);
    // The year book opens on the plan's first year, its month laid out
    // beneath the strip.
    expect(
      screen.getByText("September 2026, age 36, in today's money"),
    ).toBeInTheDocument();
    expect(screen.getByText("Left over")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Year by year" }))
        .getAllByText("£0")
        .at(-1),
    ).toHaveClass("figure", "font-medium");
  });

  // The salary alone, with nothing going out and no account to pay,
  // leaves all of its £12,250 a month that the tax does not take,
  // £7,474.70.
  it("counts a single line in the singular and none as none", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [],
      milestones: [],
      plan,
      schedule: { expenses: [], income: [salary] },
    });

    render(await Plan());

    expect(
      screen.getByText("1 milestone · 1 income line · 0 expense lines"),
    ).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.getByText("£7,475")).toHaveClass("figure", "font-medium");
  });
});
