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
    expect(screen.getByText("Sect. IV · Income & expenses")).toHaveClass(
      "label",
    );
    // The month now puts £1,000 by as the salary's sacrifice and
    // £1,234.70 as the pension's fixed sum; from 2049, the consulting's
    // £2,000 leaves the month £6,448.65 short, which the savings carry
    // to the end of the plan.
    expect(
      screen.getByText(
        "£2,235 a month put by now · £6,449 a month drawn from 2049 · the savings last to 89",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toStrictEqual([
      "Milestones",
      "What comes in",
      "What goes out",
      "Year by year",
    ]);
    expect(screen.getByText("Age 68–89")).toBeInTheDocument();
    expect(screen.getByText("Age 82–89")).toBeInTheDocument();
    // Written in the salary's columns and again on its folded lines, only
    // one of which is on screen at any width.
    expect(
      screen.getAllByText(/10\.00% of the base into Workplace pension$/),
    ).toHaveLength(2);
    // The schedules keep their rules in their captions, with no note
    // between the cards.
    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();
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
  it("says what a plan with no account puts by", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [],
      milestones: [],
      plan,
      schedule: { expenses: [], income: [salary] },
    });

    render(await Plan());

    // With no account to put by into, what the salary leaves is taken as
    // spent, and the month is never short.
    expect(
      screen.getByText("£0 a month put by now · the savings last to 89"),
    ).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.getByText("£7,475")).toHaveClass("figure", "font-medium");
  });

  // The household's £3,500 a month with nothing coming in and no account
  // to draw on: the month is short now, and nothing covers it from the
  // plan's first year.
  it("says when the month draws on the savings now and when they run out", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [],
      milestones: [],
      plan,
      schedule: { expenses: [expenseLines[0]], income: [] },
    });

    render(await Plan());

    expect(
      screen.getByText(
        "£3,500 a month drawn from the savings now · the savings run out at 36, in 2026",
      ),
    ).toBeInTheDocument();
  });

  // The same £3,500 a month with a pension the only account to draw on:
  // at 36 it is a pension before the pension age, so the month is
  // carried by drawing it early at the 55% charge, and the plan falls
  // short there rather than lasting on paper. The fixture's £412,880
  // runs out after it, at 41 in 2031, which is said too; £10,000,000
  // never does.
  it("says when the savings are carried only by drawing a pension early, and when they then run out", async () => {
    const [pension] = accounts;
    const headlineWith = async (balance: number): Promise<null | string> => {
      vi.mocked(getHousehold).mockResolvedValue({
        ...household,
        accounts: [{ ...pension, balance }],
        milestones: [],
        owners: [...owners],
        plan,
        schedule: { expenses: [expenseLines[0]], income: [] },
      });
      const { unmount } = render(await Plan());
      const { textContent } = screen.getByText(
        /a month drawn from the savings now/,
      );
      unmount();
      return textContent;
    };

    expect(await headlineWith(412880)).toBe(
      "£3,500 a month drawn from the savings now · the savings fall short at 36, in 2026, carried by an early pension draw, and run out at 41, in 2031",
    );
    expect(await headlineWith(10000000)).toBe(
      "£3,500 a month drawn from the savings now · the savings fall short at 36, in 2026, carried by an early pension draw",
    );
  });
});
