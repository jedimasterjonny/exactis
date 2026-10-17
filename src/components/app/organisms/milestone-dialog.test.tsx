import type { ComponentProps } from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Milestone } from "@/data/milestones";
import type { Schedule } from "@/engine/cash-flow";
import type { Answer } from "@/lib/answer";

import {
  removeMilestone,
  saveMilestone,
  saveRetirement,
} from "@/actions/milestones";
import { Toaster } from "@/components/kit/toast";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, retiring } from "@/data/income.fixture";
import { atAge } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field, openDialog, select } from "@/test/dom";

import { MilestoneDialog } from "./milestone-dialog";

vi.mock("@/actions/milestones", () => ({
  removeMilestone: vi.fn(),
  saveMilestone: vi.fn(),
  saveRetirement: vi.fn(),
}));

const [kidsLeave, downsize, firstMillion, independence] = milestones;
const [, stepUp] = incomeLines;
const [, childcare, mortgage] = expenseLines;

// Nothing coming in or going out, so nothing tied to any milestone.
const nothing: Schedule = { expenses: [], income: [] };

// The childcare tied to end at the children leaving home.
const oneTied: Schedule = {
  expenses: [{ ...childcare, endsAt: 7 }],
  income: [],
};

// The childcare and the mortgage, three years after, tied to end at
// the children leaving home, and the step-up to start at it.
const threeTied: Schedule = {
  expenses: [
    { ...childcare, endsAt: 7 },
    { ...mortgage, endsAfter: 3, endsAt: 7 },
  ],
  income: [{ ...stepUp, startsAt: 7 }],
};

function radio(name: string): HTMLElement {
  return screen.getByRole("radio", { name });
}

// The dialog as a list mounts it, on a new milestone or one to edit,
// with a spy where the list listens. Save and delete report through the
// toast manager, which needs its Toaster mounted.
function renderDialog(
  props: Partial<ComponentProps<typeof MilestoneDialog>> = {},
): void {
  render(
    <MilestoneDialog
      milestone={null}
      onClose={vi.fn<() => void>()}
      plan={retiring}
      schedule={nothing}
      {...props}
    />,
    { wrapper: Toaster },
  );
}

describe("MilestoneDialog", () => {
  // The plan runs from 2026, when its owner is 36, so ten years in is
  // 46, in 2036.
  it("opens a new milestone reached at an age ten years into the plan, with the save held", () => {
    renderDialog();
    const dialog = openDialog();

    expect(within(dialog).getByText("New milestone")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled milestone" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("radiogroup", { name: "Reached" }),
    ).toBeInTheDocument();
    expect(radio("At an age")).toBeChecked();
    expect(field("Age", dialog)).toHaveValue("46");
    expect(field("Age", dialog)).toHaveAccessibleDescription("In 2036");
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens a new milestone on conditions where the caller says, at the first million", () => {
    renderDialog({ kind: "conditions" });
    const dialog = openDialog();

    expect(radio("When conditions hold")).toBeChecked();
    expect(select("Measure")).toHaveValue("worth");
    expect(field("At least", dialog)).toHaveValue("£1,000,000");
    expect(select("Unit")).toHaveValue("pounds");
    expect(
      within(dialog).queryByRole("textbox", { name: "Age" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Remove condition 1" }),
    ).toBeDisabled();
  });

  it("saves a named milestone at the age typed, says the year it falls in, and tells the caller", async () => {
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), {
      target: { value: " Sabbatical " },
    });
    commit(field("Age", dialog), "50");

    expect(field("Age", dialog)).toHaveAccessibleDescription("In 2040");

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Milestone>>();
    vi.mocked(saveMilestone).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(null, {
      conditions: atAge(50),
      name: "Sabbatical",
    });
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");

    answer(saved({ conditions: atAge(50), id: 5, name: "Sabbatical" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone added" }),
    ).toHaveAccessibleDescription("Sabbatical · 2040");
  });

  // The sum turns to a multiple as the unit turns, and the rows are
  // mounted afresh as a condition is added or removed, so the one left
  // shows the condition now in its place.
  it("saves a milestone reached when conditions hold, its conditions added and removed, and reports them", async () => {
    renderDialog();
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), {
      target: { value: "Independence" },
    });
    fireEvent.click(radio("When conditions hold"));

    expect(
      within(dialog).queryByRole("textbox", { name: "Age" }),
    ).not.toBeInTheDocument();

    fireEvent.change(select("Measure"), { target: { value: "liquid" } });
    fireEvent.change(select("Unit"), { target: { value: "expenses" } });

    expect(field("At least", dialog)).toHaveValue("1,000,000");

    commit(field("At least", dialog), "25");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add condition" }),
    );

    expect(
      within(dialog).getAllByRole("combobox", { name: "Measure" }),
    ).toHaveLength(2);
    expect(
      within(dialog).getAllByRole("combobox", { name: "Unit" })[1],
    ).toHaveValue("debt");

    // The second row's measure is turned, and the first is left as it is.
    for (const measure of within(dialog)
      .getAllByRole("combobox", { name: "Measure" })
      .slice(-1)) {
      fireEvent.change(measure, { target: { value: "worth" } });
    }

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove condition 1" }),
    );

    expect(
      within(dialog).getAllByRole("combobox", { name: "Measure" }),
    ).toHaveLength(1);
    expect(select("Unit")).toHaveValue("debt");
    expect(field("At least", dialog)).toHaveValue("10");
    expect(select("Measure")).toHaveValue("worth");

    vi.mocked(saveMilestone).mockResolvedValue(
      saved({
        conditions: [{ measure: "worth", of: "debt", times: 10 }],
        id: 5,
        name: "Independence",
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(null, {
      conditions: [{ measure: "worth", of: "debt", times: 10 }],
      name: "Independence",
    });
    expect(
      await screen.findByRole("dialog", { name: "Milestone added" }),
    ).toHaveAccessibleDescription(
      "Independence · Net worth ≥ 10 times the debt",
    );
  });

  it("keeps what was typed for either way as the choice turns", () => {
    renderDialog();
    const dialog = openDialog();

    commit(field("Age", dialog), "50");
    fireEvent.click(radio("When conditions hold"));
    commit(field("At least", dialog), "2,000,000");
    fireEvent.click(radio("At an age"));

    expect(field("Age", dialog)).toHaveValue("50");

    fireEvent.click(radio("When conditions hold"));

    expect(field("At least", dialog)).toHaveValue("£2,000,000");
  });

  // The children leave home at 46; nothing is tied to it here, so
  // either way is open to it.
  it("opens a milestone reached at an age on its age, free to be reached when conditions hold instead", () => {
    renderDialog({ milestone: kidsLeave });
    const dialog = screen.getByRole("dialog", { name: "Kids leave home" });

    expect(within(dialog).getByText("Edit milestone")).toHaveClass(
      "text-brand",
    );
    expect(field("Name", dialog)).toHaveValue("Kids leave home");
    expect(radio("At an age")).toBeChecked();
    expect(field("Age", dialog)).toHaveValue("46");
    expect(radio("When conditions hold")).not.toHaveAttribute("aria-disabled");
    expect(radio("When conditions hold")).toHaveAccessibleDescription(
      "Read by the chance of success",
    );
  });

  // A tied line moves with the milestone's year, so the milestone
  // cannot be reached when conditions hold instead; the choice is held
  // and says why, for one line and for more.
  it.each([
    [
      oneTied,
      "Not while the line tied to it moves with its year: untie it first",
    ],
    [
      threeTied,
      "Not while the 3 lines tied to it move with its year: untie them first",
    ],
  ])(
    "holds a milestone lines are tied to at its age, and says why",
    (schedule, why) => {
      renderDialog({ milestone: kidsLeave, schedule });

      expect(radio("At an age")).toBeChecked();
      expect(radio("When conditions hold")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(radio("When conditions hold")).toHaveAccessibleDescription(why);

      fireEvent.click(radio("When conditions hold"));

      expect(radio("At an age")).toBeChecked();
    },
  );

  // A saved milestone's dialog is where it is deleted from: the Delete
  // closes the dialog and asks first, saying what becomes of the lines
  // tied to it, holds the confirm while the store answers, and tells
  // the caller once the milestone has gone.
  it("asks before deleting the milestone, the dialog closing first, and tells the caller once it has gone", async () => {
    const onClose = vi.fn<() => void>();
    renderDialog({ milestone: kidsLeave, onClose, schedule: threeTied });
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<undefined>>();
    vi.mocked(removeMilestone).mockReturnValue(promise);

    fireEvent.click(
      within(openDialog()).getByRole("button", { name: "Delete" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const question = screen.getByRole("alertdialog", {
      name: "Delete Kids leave home?",
    });

    expect(question).toHaveAccessibleDescription(
      "The 3 lines tied to it stay where they are, in fixed years. It cannot be brought back.",
    );

    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(removeMilestone).toHaveBeenCalledExactlyOnceWith(kidsLeave.id);
    expect(
      within(question).getByRole("button", { name: "Delete" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(onClose).not.toHaveBeenCalled();

    answer(saved(undefined));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone deleted" }),
    ).toHaveAccessibleDescription("Kids leave home");
  });

  it("says the one line tied to the milestone stays where it is, and tells the caller on Cancel, deleting nothing", () => {
    const onClose = vi.fn<() => void>();
    renderDialog({ milestone: kidsLeave, onClose, schedule: oneTied });

    fireEvent.click(
      within(openDialog()).getByRole("button", { name: "Delete" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Kids leave home?" }),
    ).toHaveAccessibleDescription(
      "The line tied to it stays where it is, in a fixed year. It cannot be brought back.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(removeMilestone).not.toHaveBeenCalled();
  });

  it("asks about a milestone nothing is tied to with the warning alone", () => {
    renderDialog({ milestone: downsize });

    fireEvent.click(
      within(openDialog()).getByRole("button", { name: "Delete" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Downsize?" }),
    ).toHaveAccessibleDescription("It cannot be brought back.");
  });

  // Independence is twenty-five years of expenses and ten times the
  // debt, in liquid net worth.
  it("opens a milestone reached when conditions hold on its conditions, with a Delete", () => {
    renderDialog({ milestone: independence });
    const dialog = screen.getByRole("dialog", {
      name: "Financial independence",
    });

    expect(radio("When conditions hold")).toBeChecked();

    const measures = within(dialog).getAllByRole("combobox", {
      name: "Measure",
    });
    const [expenses, debt] = within(dialog).getAllByRole("combobox", {
      name: "Unit",
    });
    const [twentyFive, ten] = within(dialog).getAllByRole("textbox", {
      name: "At least",
    });

    expect(measures).toHaveLength(2);
    for (const measure of measures) {
      expect(measure).toHaveValue("liquid");
    }
    expect(expenses).toHaveValue("expenses");
    expect(debt).toHaveValue("debt");
    expect(twentyFive).toHaveValue("25");
    expect(ten).toHaveValue("10");
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("writes an edit back over the milestone", async () => {
    vi.mocked(saveMilestone).mockResolvedValue(
      saved({
        ...firstMillion,
        conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
      }),
    );
    renderDialog({ milestone: firstMillion });
    const dialog = openDialog();

    commit(field("At least", dialog), "2,000,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(firstMillion.id, {
      conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
      name: "First million",
    });
    expect(
      await screen.findByRole("dialog", { name: "Milestone updated" }),
    ).toHaveAccessibleDescription("First million · Net worth ≥ £2,000,000");
  });

  it("stays open and says why when the store refuses", async () => {
    vi.mocked(saveMilestone).mockResolvedValue(
      refused("No milestone has the id"),
    );
    renderDialog({ milestone: kidsLeave });

    fireEvent.click(within(openDialog()).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Milestone not saved" }),
      ).toHaveAccessibleDescription("No milestone has the id");
    });
    expect(
      screen.getByRole("dialog", { name: "Kids leave home" }),
    ).toBeVisible();
  });

  // Retiring at 59, in 2049: retirement opens on its age, named and
  // with nothing to type a name into or delete, its conditions standing
  // by at twenty-five years of expenses, and saved onto the owner as
  // those conditions once chosen.
  it("edits retirement, on its age or on conditions, with no name and no Delete, and saves it onto the owner", async () => {
    const onClose = vi.fn<() => void>();
    renderDialog({
      milestone: { retirement: atAge(59) },
      onClose,
      schedule: threeTied,
    });
    const dialog = screen.getByRole("dialog", { name: "Retirement" });

    expect(within(dialog).getByText("Edit retirement")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("textbox", { name: "Name" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(radio("At an age")).toBeChecked();
    expect(radio("At an age")).toHaveAccessibleDescription(
      "Dragged on the dashboard too",
    );
    expect(field("Age", dialog)).toHaveValue("59");

    fireEvent.click(radio("When conditions hold"));

    expect(radio("When conditions hold")).toHaveAccessibleDescription(
      "Each future retires once they first hold",
    );
    expect(field("At least", dialog)).toHaveValue("25");

    vi.mocked(saveRetirement).mockResolvedValue(
      saved({
        conditions: [{ measure: "liquid", of: "expenses", times: 25 }],
        name: "Retirement",
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveRetirement).toHaveBeenCalledExactlyOnceWith([
      { measure: "liquid", of: "expenses", times: 25 },
    ]);
    expect(saveMilestone).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(
      screen.getByRole("dialog", { name: "Retirement updated" }),
    ).toHaveAccessibleDescription(
      "Retirement · Liquid net worth ≥ 25 years of expenses",
    );
  });

  // Retiring on financial independence, the age stands by at the age
  // the plan lays retirement out at, held to its end.
  it("opens retirement on its conditions, its age standing by where the plan lays it out", () => {
    renderDialog({
      milestone: { retirement: independence.conditions },
      plan: { ...retiring, retires: 90 },
    });
    const dialog = screen.getByRole("dialog", { name: "Retirement" });

    expect(radio("When conditions hold")).toBeChecked();
    expect(within(dialog).getAllByRole("combobox")).toHaveLength(4);

    fireEvent.click(radio("At an age"));

    expect(field("Age", dialog)).toHaveValue("89");
  });

  it("tells the caller on Cancel, saving nothing", () => {
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(saveMilestone).not.toHaveBeenCalled();
  });
});
