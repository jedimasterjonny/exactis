import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExpenseLine } from "@/data/expenses";
import type { Answer } from "@/lib/answer";

import { removeExpenseLine, saveExpenseLine } from "@/actions/schedule";
import { Toaster } from "@/components/kit/toast";
import { expenseLines } from "@/data/expenses.fixture";
import { plan, retiring } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { saved as accepted } from "@/lib/answer";
import { commit, openEntry, openRow } from "@/test/dom";

import { ExpenseSchedule } from "./expense-schedule";

vi.mock("@/actions/schedule", () => ({
  removeExpenseLine: vi.fn(),
  saveExpenseLine: vi.fn(),
}));

const [, , mortgagePayment, retirement] = expenseLines;

// Save reports through the toast manager, which needs its Toaster mounted.
function renderSchedule(lines: readonly ExpenseLine[] = expenseLines): void {
  render(
    <ExpenseSchedule lines={lines} milestones={milestones} plan={plan} />,
    { wrapper: Toaster },
  );
}

// The store's answer to a save: the line as it now has it. The schedule
// shows it only once the page re-reads, which is the router's work and
// not the schedule's, so the rows here stay as rendered.
function saved(line: ExpenseLine): void {
  vi.mocked(saveExpenseLine).mockResolvedValue(accepted(line));
}

describe("ExpenseSchedule", () => {
  it("opens with the card, its rows and its note", () => {
    renderSchedule();

    expect(screen.getByText("Sect. III.iii")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Expenses by year",
    );
    expect(
      screen.getByRole("region", { name: "Expenses by year" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(expenseLines.length);
    // A line paying no loan carries no badge: its name says what it is.
    expect(
      screen.queryByText(/^(Core|Time-bound|Debt|Other)$/),
    ).not.toBeInTheDocument();
    // A row is drawn in its columns and again in its folded lines, only
    // one of which is on screen at any width, and opens from its name in
    // either.
    for (const name of screen.getAllByRole("button", { name: "Childcare" })) {
      expect(name).toHaveClass("font-medium");
    }
    expect(screen.getByText("£3,500")).toHaveTextContent("£3,500 / mo");
    expect(screen.getByText("£60,000")).toHaveTextContent("£60,000 / yr");
    expect(screen.getByText("2048 on")).toBeInTheDocument();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "An open-ended line runs to the end of the plan",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("draws the empty state for none", () => {
    render(<ExpenseSchedule lines={[]} milestones={milestones} plan={plan} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
  });

  it("adds a named line ending in a year and reports it", async () => {
    renderSchedule();

    const dialog = openEntry("Add expense line");

    expect(within(dialog).getByText("New expense line")).toHaveClass(
      "text-brand",
    );
    expect(
      within(dialog).getByRole("heading", { name: "Untitled line" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).queryByRole("combobox", { name: "Category" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£0",
    );
    expect(
      within(dialog).queryByRole("textbox", { name: "Bonus" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "Cadence" }),
    ).toHaveValue("month");
    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "fixed",
    );
    // A new expense runs ten years from the plan's first, as the
    // reference's opens.
    expect(
      within(dialog).getByRole("textbox", { name: "Last year" }),
    ).toHaveValue("2036");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: " Nursery " },
    });
    commit(within(dialog).getByRole("textbox", { name: "Amount" }), "1,150");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Growth" }), {
      target: { value: "inflation-plus-2" },
    });
    commit(within(dialog).getByRole("textbox", { name: "First year" }), "2027");
    commit(within(dialog).getByRole("textbox", { name: "Last year" }), "2035");

    expect(
      within(dialog).getByRole("heading", { name: "Nursery" }),
    ).toBeInTheDocument();

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<ExpenseLine>>();
    vi.mocked(saveExpenseLine).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveExpenseLine).toHaveBeenCalledExactlyOnceWith(null, {
      amount: 1150,
      cadence: "month",
      endsAfter: 0,
      endsAt: null,
      firstYear: 2027,
      growth: "inflation-plus-2",
      lastMonth: null,
      lastYear: 2035,
      name: "Nursery",
      startsAt: null,
    });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    answer(
      accepted({
        amount: 1150,
        cadence: "month",
        endsAfter: 0,
        endsAt: null,
        firstYear: 2027,
        growth: "inflation-plus-2",
        id: 6,
        lastMonth: null,
        lastYear: 2035,
        name: "Nursery",
        startsAt: null,
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Nursery" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Expense line added" }),
    ).toHaveAccessibleDescription("Nursery · 2027–2035");
  });

  // A saved line's dialog is where it is deleted from: the Delete closes
  // the dialog and asks first, holds the confirm while the store answers,
  // and closes on the answer; the row goes when the page re-reads. A new
  // line has nothing yet to delete.
  it("asks from a saved line's dialog before deleting it, the dialog closing first", async () => {
    renderSchedule();
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<undefined>>();
    vi.mocked(removeExpenseLine).mockReturnValue(promise);

    expect(
      within(openEntry("Add expense line")).queryByRole("button", {
        name: "Delete",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      within(openRow("Childcare")).getByRole("button", { name: "Delete" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const question = screen.getByRole("alertdialog", {
      name: "Delete Childcare?",
    });
    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(removeExpenseLine).toHaveBeenCalledExactlyOnceWith(2);
    expect(
      within(question).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();

    answer(accepted(undefined));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("drops a cancelled draft", () => {
    renderSchedule();

    let dialog = openEntry("Add expense line");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Holidays" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openEntry("Add expense line");

    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
  });

  it("opens an open-ended line as it is and writes the edit back", async () => {
    renderSchedule();
    saved({ ...retirement, amount: 65000 });

    const dialog = openRow("Retirement living");

    expect(within(dialog).getByText("Edit expense line")).toHaveClass(
      "text-brand",
    );
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£60,000",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "First year" }),
    ).toHaveValue("2048");
    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "open",
    );

    commit(within(dialog).getByRole("textbox", { name: "Amount" }), "65,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Retirement living" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Expense line updated" }),
    ).toHaveAccessibleDescription("Retirement living · 2048 on");
    expect(saveExpenseLine).toHaveBeenCalledExactlyOnceWith(4, {
      amount: 65000,
      cadence: "year",
      endsAfter: 0,
      endsAt: null,
      firstYear: 2048,
      growth: "inflation",
      lastMonth: null,
      lastYear: null,
      name: "Retirement living",
      startsAt: null,
    });
  });

  // A line that is a loan's payments is written by the dialog of the
  // asset the loan is on, so it says it is a loan's and is locked here,
  // with the reason where its chevron would be.
  it("locks a line that is a loan's payments", () => {
    render(
      <ExpenseSchedule
        lines={[retirement, { ...mortgagePayment, pays: 5 }]}
        milestones={milestones}
        plan={plan}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getAllByRole("button", { name: "Retirement living" }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Mortgage payment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Mortgage payment" }).at(-1),
    ).toHaveAttribute("href", "/accounts");
    // The badge and the lock are drawn in the row's columns and on its
    // folded lines, the badge only for the loan's line.
    expect(screen.getByText("Loan")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getByText("Loan · Fixed in pounds")).toBeInTheDocument();
    // The retirement living's folded lines name its growth alone, as its
    // column does, with no badge before it.
    expect(screen.getAllByText("Rises with inflation")).toHaveLength(2);
    expect(
      screen.getAllByRole("img", {
        name: "Edited with its asset on the accounts screen",
      }),
    ).toHaveLength(2);
  });

  // With its owner retiring at 59, the plan's retirement falls in 2049,
  // so a line ending at it runs to 2048, as the dialog says beneath the
  // choice, and one ending three years after it runs to 2051, as the
  // save sends.
  it("ties a new line's end to years after a milestone and saves the tie with the year it gives", async () => {
    render(
      <ExpenseSchedule
        lines={expenseLines}
        milestones={milestones}
        plan={retiring}
      />,
      { wrapper: Toaster },
    );
    saved({
      amount: 0,
      cadence: "month",
      endsAfter: 3,
      endsAt: "retirement",
      firstYear: 2026,
      growth: "inflation",
      id: 6,
      lastMonth: null,
      lastYear: 2051,
      name: "Household",
      startsAt: null,
    });

    const dialog = openEntry("Add expense line");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Household" },
    });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Ends" }), {
      target: { value: "retirement" },
    });

    expect(
      within(dialog).getByRole("textbox", { name: "Years after" }),
    ).toHaveAccessibleDescription("Runs to 2048, the year before Retirement.");

    commit(within(dialog).getByRole("textbox", { name: "Years after" }), "3");

    expect(
      within(dialog).getByRole("textbox", { name: "Years after" }),
    ).toHaveAccessibleDescription(
      "Runs to 2051, ending 3 years after Retirement.",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveExpenseLine).toHaveBeenCalledExactlyOnceWith(null, {
      amount: 0,
      cadence: "month",
      endsAfter: 3,
      endsAt: "retirement",
      firstYear: 2026,
      growth: "inflation",
      lastMonth: null,
      lastYear: 2051,
      name: "Household",
      startsAt: null,
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Household" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Expense line added" }),
    ).toHaveAccessibleDescription("Household · 2026–2051");
  });
});
