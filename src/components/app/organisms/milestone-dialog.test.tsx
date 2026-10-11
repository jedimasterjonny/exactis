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
import type { Answer } from "@/lib/answer";

import { saveMilestone } from "@/actions/milestones";
import { Toaster } from "@/components/kit/toast";
import { retiring } from "@/data/income.fixture";
import { atAge } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field, openDialog, select } from "@/test/dom";

import { MilestoneDialog } from "./milestone-dialog";

vi.mock("@/actions/milestones", () => ({ saveMilestone: vi.fn() }));

const [kidsLeave, , firstMillion, independence] = milestones;

function radio(name: string): HTMLElement {
  return screen.getByRole("radio", { name });
}

// The dialog as a list mounts it, on a new milestone or one to edit,
// with spies where the list listens. Save reports through the toast
// manager, which needs its Toaster mounted.
function renderDialog(
  props: Partial<ComponentProps<typeof MilestoneDialog>> = {},
): void {
  render(
    <MilestoneDialog
      milestone={null}
      onDismiss={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
      plan={retiring}
      {...props}
    />,
    { wrapper: Toaster },
  );
}

describe("MilestoneDialog", () => {
  // The plan runs from 2026, when its owner is 34, so ten years in is
  // 44, in 2036.
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
    expect(field("Age", dialog)).toHaveValue("44");
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
    const onSaved = vi.fn<() => void>();
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), {
      target: { value: " Sabbatical " },
    });
    commit(field("Age", dialog), "52");

    expect(field("Age", dialog)).toHaveAccessibleDescription("In 2044");

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Milestone>>();
    vi.mocked(saveMilestone).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(null, {
      conditions: atAge(52),
      name: "Sabbatical",
    });
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");

    answer(saved({ conditions: atAge(52), id: 5, name: "Sabbatical" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone added" }),
    ).toHaveAccessibleDescription("Sabbatical · 2044");
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

    commit(field("Age", dialog), "52");
    fireEvent.click(radio("When conditions hold"));
    commit(field("At least", dialog), "2,000,000");
    fireEvent.click(radio("At an age"));

    expect(field("Age", dialog)).toHaveValue("52");

    fireEvent.click(radio("When conditions hold"));

    expect(field("At least", dialog)).toHaveValue("£2,000,000");
  });

  // The children leave home at 48; independence is twenty-five years of
  // expenses and ten times the debt, in liquid net worth.
  it("opens a milestone reached at an age on its age, with a Delete that reports it", () => {
    const onDelete = vi.fn<(milestone: Milestone) => void>();
    renderDialog({ milestone: kidsLeave, onDelete });
    const dialog = screen.getByRole("dialog", { name: "Kids leave home" });

    expect(within(dialog).getByText("Edit milestone")).toHaveClass(
      "text-brand",
    );
    expect(field("Name", dialog)).toHaveValue("Kids leave home");
    expect(radio("At an age")).toBeChecked();
    expect(field("Age", dialog)).toHaveValue("48");

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(kidsLeave);
  });

  it("opens a milestone reached when conditions hold on its conditions, and offers no Delete to a caller that asks for none", () => {
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
      within(dialog).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
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

  it("dismisses on Cancel", () => {
    const onDismiss = vi.fn<() => void>();
    renderDialog({ onDismiss });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(saveMilestone).not.toHaveBeenCalled();
  });
});
