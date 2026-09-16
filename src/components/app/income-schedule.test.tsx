import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IncomeLine } from "@/data/income";

import { saveIncomeLine } from "@/app/(app)/plan/actions";
import { Toaster } from "@/components/ui/toast";
import { incomeKinds } from "@/data/income";
import { incomeLines, plan } from "@/data/income.fixture";
import { lineGrowths } from "@/data/schedule";

import { IncomeSchedule } from "./income-schedule";

vi.mock("@/app/(app)/plan/actions", () => ({ saveIncomeLine: vi.fn() }));

const [salary, , , statePension] = incomeLines;

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function openEditor(name: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
  return screen.getByRole("dialog", { name });
}

function openEntry(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Add income line" }));
  return screen.getByRole("dialog");
}

// Save reports through the toast manager, which needs its Toaster mounted.
function renderSchedule(lines: readonly IncomeLine[] = incomeLines): void {
  render(
    <Toaster>
      <IncomeSchedule lines={lines} plan={plan} />
    </Toaster>,
  );
}

// The store's answer to a save: the line as it now has it. The schedule
// shows it only once the page re-reads, which is the router's work and
// not the schedule's, so the rows here stay as rendered.
function saved(line: IncomeLine): void {
  vi.mocked(saveIncomeLine).mockResolvedValue(line);
}

describe("IncomeSchedule", () => {
  it("opens with the card, its rows and its note", () => {
    renderSchedule();

    expect(screen.getByText("Sect. III.i")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Income by year",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(incomeLines.length);
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(
      incomeLines.length,
    );
    expect(screen.getByText("£147,000")).toHaveTextContent("£147,000 / yr");
    expect(
      screen.getByText("£120,000 base · £15,000 bonus · £12,000 RSUs"),
    ).toHaveClass("text-muted-foreground");
    expect(screen.queryByText(/£168,000 base/)).not.toBeInTheDocument();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Lines overlap freely",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("draws the empty state for none", () => {
    render(<IncomeSchedule lines={[]} plan={plan} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No income yet")).toBeInTheDocument();
  });

  it("names only the parts a line has beyond its base", () => {
    render(
      <IncomeSchedule
        lines={[
          { ...salary, bonus: 0, id: 5 },
          { ...salary, id: 6, rsu: 0 },
        ]}
        plan={plan}
      />,
    );

    expect(screen.getByText("£120,000 base · £12,000 RSUs")).toBeVisible();
    expect(screen.getByText("£120,000 base · £15,000 bonus")).toBeVisible();
    expect(screen.getByText("£132,000")).toHaveTextContent("£132,000 / yr");
    expect(screen.getByText("£135,000")).toHaveTextContent("£135,000 / yr");
  });

  it("adds a named line ending in a year and reports it", async () => {
    renderSchedule();

    const dialog = openEntry();

    expect(within(dialog).getByText("New income line")).toHaveClass(
      "text-brand",
    );
    expect(
      within(dialog).getByRole("heading", { name: "Untitled line" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "open",
    );
    expect(
      within(dialog).queryByRole("textbox", { name: "Last year" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Runs to 2079, the last year of the plan."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Plan · 2026–2079")).toHaveClass("label");
    expect(
      within(dialog).getByRole("textbox", { name: "Base salary" }),
    ).toHaveValue("£0");
    expect(within(dialog).getByRole("textbox", { name: "Bonus" })).toHaveValue(
      "£0",
    );
    expect(within(dialog).getByRole("textbox", { name: "RSUs" })).toHaveValue(
      "£0",
    );
    expect(
      within(
        within(dialog).getByRole("combobox", { name: "Category" }),
      ).getAllByRole("option"),
    ).toHaveLength(incomeKinds.length);
    expect(
      within(
        within(dialog).getByRole("combobox", { name: "Grows with" }),
      ).getAllByRole("option"),
    ).toHaveLength(lineGrowths.length);

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: " Bonus scheme " },
    });
    commit(within(dialog).getByRole("textbox", { name: "Bonus" }), "1,000");
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Category" }),
      { target: { value: "self-employment" } },
    );

    // A line of another kind has no parts: the fields go, and the bonus
    // typed before the change goes with them.
    expect(
      within(dialog).queryByRole("textbox", { name: "Base salary" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("textbox", { name: "Bonus" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("textbox", { name: "RSUs" }),
    ).not.toBeInTheDocument();

    commit(within(dialog).getByRole("textbox", { name: "Amount" }), "12,000");
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cadence" }),
      { target: { value: "month" } },
    );
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Grows with" }),
      { target: { value: "triple-lock" } },
    );
    commit(within(dialog).getByRole("textbox", { name: "First year" }), "2030");

    expect(
      within(dialog).getByRole("textbox", { name: "First year" }),
    ).toHaveAccessibleDescription("Age 40");

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Ends" }), {
      target: { value: "fixed" },
    });

    // A line that opened with no last year ends in its first year until
    // told otherwise, the year the plan starts for a new line.
    expect(
      within(dialog).getByRole("textbox", { name: "Last year" }),
    ).toHaveValue("2026");

    commit(within(dialog).getByRole("textbox", { name: "Last year" }), "2035");

    expect(
      within(dialog).getByRole("textbox", { name: "Last year" }),
    ).toHaveAccessibleDescription("Age 45");
    expect(
      within(dialog).getByRole("heading", { name: "Bonus scheme" }),
    ).toBeInTheDocument();

    // The store's answer is held back, so the save can be seen in flight.
    let answer!: (line: IncomeLine) => void;
    vi.mocked(saveIncomeLine).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(null, {
      amount: 12000,
      bonus: 0,
      cadence: "month",
      firstYear: 2030,
      growth: "triple-lock",
      kind: "self-employment",
      lastYear: 2035,
      name: "Bonus scheme",
      rsu: 0,
    });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("dialog", { name: "Bonus scheme" })).toBeVisible();

    answer({
      amount: 12000,
      bonus: 0,
      cadence: "month",
      firstYear: 2030,
      growth: "triple-lock",
      id: 5,
      kind: "self-employment",
      lastYear: 2035,
      name: "Bonus scheme",
      rsu: 0,
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Bonus scheme" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Income line added" }),
    ).toHaveAccessibleDescription("Bonus scheme · 2030–2035");
  });

  it("drops a cancelled draft and leaves a cleared figure as it was", () => {
    renderSchedule();

    let dialog = openEntry();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Consulting" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Base salary" }), "");
    commit(within(dialog).getByRole("textbox", { name: "Bonus" }), "");
    commit(within(dialog).getByRole("textbox", { name: "First year" }), "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openEntry();

    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Base salary" }),
    ).toHaveValue("£0");
    expect(within(dialog).getByRole("textbox", { name: "Bonus" })).toHaveValue(
      "£0",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "First year" }),
    ).toHaveValue("2026");
  });

  it("opens an open-ended line as it is, ends it in a year and writes the edit back", async () => {
    renderSchedule();
    saved({ ...statePension, lastYear: 2070 });

    const dialog = openEditor("State pension");

    expect(within(dialog).getByText("Edit income line")).toHaveClass(
      "text-brand",
    );
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "State pension",
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Category" }),
    ).toHaveValue("pension");
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£23,400",
    );
    expect(
      within(dialog).queryByRole("textbox", { name: "Bonus" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "Cadence" }),
    ).toHaveValue("year");
    expect(
      within(dialog).getByRole("combobox", { name: "Grows with" }),
    ).toHaveValue("triple-lock");
    expect(
      within(dialog).getByRole("textbox", { name: "First year" }),
    ).toHaveValue("2058");
    expect(
      within(dialog).getByRole("textbox", { name: "First year" }),
    ).toHaveAccessibleDescription("Age 68");
    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "open",
    );
    expect(
      within(dialog).queryByRole("textbox", { name: "Last year" }),
    ).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Ends" }), {
      target: { value: "fixed" },
    });

    expect(
      within(dialog).getByRole("textbox", { name: "Last year" }),
    ).toHaveValue("2058");

    commit(within(dialog).getByRole("textbox", { name: "Last year" }), "2070");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "State pension" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Income line updated" }),
    ).toHaveAccessibleDescription("State pension · 2058–2070");
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(4, {
      amount: 23400,
      bonus: 0,
      cadence: "year",
      firstYear: 2058,
      growth: "triple-lock",
      kind: "pension",
      lastYear: 2070,
      name: "State pension",
      rsu: 0,
    });
  });

  it("opens an employment line's parts as they are, keeps them across the category and writes an edit back", async () => {
    renderSchedule();
    saved({ ...salary, rsu: 20000 });

    const dialog = openEditor("Salary");

    expect(
      within(dialog).getByRole("textbox", { name: "Base salary" }),
    ).toHaveValue("£120,000");
    expect(within(dialog).getByRole("textbox", { name: "Bonus" })).toHaveValue(
      "£15,000",
    );
    expect(within(dialog).getByRole("textbox", { name: "RSUs" })).toHaveValue(
      "£12,000",
    );

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Category" }),
      { target: { value: "pension" } },
    );

    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£120,000",
    );
    expect(
      within(dialog).queryByRole("textbox", { name: "Bonus" }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Category" }),
      { target: { value: "employment" } },
    );

    expect(within(dialog).getByRole("textbox", { name: "Bonus" })).toHaveValue(
      "£15,000",
    );
    expect(within(dialog).getByRole("textbox", { name: "RSUs" })).toHaveValue(
      "£12,000",
    );

    commit(within(dialog).getByRole("textbox", { name: "RSUs" }), "20,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Salary" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Income line updated" }),
    ).toHaveAccessibleDescription("Salary · 2026–2048");
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(1, {
      amount: 120000,
      bonus: 15000,
      cadence: "year",
      firstYear: 2026,
      growth: "inflation-plus-1",
      kind: "employment",
      lastYear: 2048,
      name: "Salary",
      rsu: 20000,
    });
  });

  it("holds the save while the line ends before it starts, and frees it when it runs to the end", async () => {
    renderSchedule();
    saved({ ...salary, lastYear: null });

    const dialog = openEditor("Salary");

    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "fixed",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Last year" }),
    ).toHaveValue("2048");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(within(dialog).getByRole("textbox", { name: "First year" }), "2050");

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Ends" }), {
      target: { value: "open" },
    });

    expect(
      within(dialog).queryByRole("textbox", { name: "Last year" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Salary" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Income line updated" }),
    ).toHaveAccessibleDescription("Salary · 2026–end of plan");
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(1, {
      amount: 120000,
      bonus: 15000,
      cadence: "year",
      firstYear: 2050,
      growth: "inflation-plus-1",
      kind: "employment",
      lastYear: null,
      name: "Salary",
      rsu: 12000,
    });
  });
});
