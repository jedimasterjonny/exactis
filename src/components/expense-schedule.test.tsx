import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExpenseLine } from "@/data/expenses";

import { saveExpenseLine } from "@/app/(app)/plan/actions";
import { Toaster } from "@/components/ui/toast";
import { expenseKinds } from "@/data/expenses";
import { expenseLines } from "@/data/expenses.fixture";
import { plan } from "@/data/income.fixture";

import { ExpenseSchedule } from "./expense-schedule";

vi.mock("@/app/(app)/plan/actions", () => ({ saveExpenseLine: vi.fn() }));

const [, , , retirement] = expenseLines;

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function openEditor(name: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
  return screen.getByRole("dialog", { name });
}

function openEntry(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Add expense line" }));
  return screen.getByRole("dialog");
}

// Save reports through the toast manager, which needs its Toaster mounted.
function renderSchedule(lines: readonly ExpenseLine[] = expenseLines): void {
  render(
    <Toaster>
      <ExpenseSchedule lines={lines} plan={plan} />
    </Toaster>,
  );
}

// The store's answer to a save: the line as it now has it. The schedule
// shows it only once the page re-reads, which is the router's work and
// not the schedule's, so the rows here stay as rendered.
function saved(line: ExpenseLine): void {
  vi.mocked(saveExpenseLine).mockResolvedValue(line);
}

describe("ExpenseSchedule", () => {
  it("opens with the card, its rows in their kinds' tones and its note", () => {
    renderSchedule();

    expect(screen.getByText("Sect. III.ii")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Expenses by year",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(expenseLines.length);
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(
      expenseLines.length,
    );
    expect(screen.getAllByText("Core")).toHaveLength(2);
    expect(screen.getAllByText("Time-bound")).toHaveLength(2);
    expect(screen.getByText("Childcare")).toHaveClass("font-medium");
    expect(screen.getByText("Debt")).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    expect(screen.getByText("£3,500")).toHaveTextContent("£3,500 / mo");
    expect(screen.getByText("£60,000")).toHaveTextContent("£60,000 / yr");
    expect(screen.getByText("2048 – end")).toBeInTheDocument();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "An open-ended line runs to the end of the plan",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks a time-bound cost for its end and draws the empty state for none", () => {
    const { rerender } = render(
      <ExpenseSchedule lines={[expenseLines[1]]} plan={plan} />,
    );

    expect(screen.getByText("Time-bound")).toHaveAttribute(
      "data-variant",
      "caution",
    );

    rerender(<ExpenseSchedule lines={[]} plan={plan} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
  });

  it("adds a named line ending in a year and reports it", async () => {
    renderSchedule();

    const dialog = openEntry();

    expect(within(dialog).getByText("New expense line")).toHaveClass(
      "text-brand",
    );
    expect(
      within(dialog).getByRole("heading", { name: "Untitled line" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).getByRole("combobox", { name: "Category" }),
    ).toHaveValue("time-bound");
    expect(
      within(
        within(dialog).getByRole("combobox", { name: "Category" }),
      ).getAllByRole("option"),
    ).toHaveLength(expenseKinds.length);
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
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Grows with" }),
      { target: { value: "inflation-plus-2" } },
    );
    commit(within(dialog).getByRole("textbox", { name: "First year" }), "2027");
    commit(within(dialog).getByRole("textbox", { name: "Last year" }), "2035");

    expect(
      within(dialog).getByRole("heading", { name: "Nursery" }),
    ).toBeInTheDocument();

    // The store's answer is held back, so the save can be seen in flight.
    let answer!: (line: ExpenseLine) => void;
    vi.mocked(saveExpenseLine).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveExpenseLine).toHaveBeenCalledExactlyOnceWith(null, {
      amount: 1150,
      cadence: "month",
      firstYear: 2027,
      growth: "inflation-plus-2",
      kind: "time-bound",
      lastYear: 2035,
      name: "Nursery",
    });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    answer({
      amount: 1150,
      cadence: "month",
      firstYear: 2027,
      growth: "inflation-plus-2",
      id: 6,
      kind: "time-bound",
      lastYear: 2035,
      name: "Nursery",
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Nursery" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Expense line added" }),
    ).toHaveAccessibleDescription("Nursery · 2027–2035");
  });

  it("drops a cancelled draft", () => {
    renderSchedule();

    let dialog = openEntry();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Holidays" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openEntry();

    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
  });

  it("opens an open-ended line as it is, recategorises it and writes the edit back", async () => {
    renderSchedule();
    saved({ ...retirement, amount: 65000, kind: "other" });

    const dialog = openEditor("Retirement living");

    expect(within(dialog).getByText("Edit expense line")).toHaveClass(
      "text-brand",
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Category" }),
    ).toHaveValue("core");
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£60,000",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "First year" }),
    ).toHaveValue("2048");
    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "open",
    );

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Category" }),
      { target: { value: "other" } },
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
    ).toHaveAccessibleDescription("Retirement living · 2048–end of plan");
    expect(saveExpenseLine).toHaveBeenCalledExactlyOnceWith(4, {
      amount: 65000,
      cadence: "year",
      firstYear: 2048,
      growth: "inflation",
      kind: "other",
      lastYear: null,
      name: "Retirement living",
    });
  });
});
