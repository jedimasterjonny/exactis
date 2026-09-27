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

import { removeMilestone, saveMilestone } from "@/actions/milestones";
import { Toaster } from "@/components/kit/toast";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, retiring } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { refused, saved } from "@/lib/answer";
import { bySlot, commit } from "@/test/dom";
import { heldBack } from "@/test/held-back";

import { MilestoneList } from "./milestone-list";

vi.mock("@/actions/milestones", () => ({
  removeMilestone: vi.fn(),
  saveMilestone: vi.fn(),
}));

const [kidsLeave, downsize] = milestones;
const [salary, stepUp] = incomeLines;
const [household, childcare, mortgage] = expenseLines;

// The reference schedule with the salary and its step-up tied to end at
// retirement, the household spending to end at it, the childcare at the
// children leaving home and the mortgage three years after, and the
// step-up to start at them.
const tied = {
  expenses: [
    { ...household, endsAt: "retirement" },
    { ...childcare, endsAt: 1 },
    { ...mortgage, endsAfter: 3, endsAt: 1 },
    ...expenseLines.slice(3),
  ],
  income: [
    { ...salary, endsAt: "retirement" },
    { ...stepUp, endsAt: "retirement", startsAt: 1 },
    ...incomeLines.slice(2),
  ],
} as const;

// Save and delete report through the toast manager, which needs its
// Toaster mounted.
function renderList(
  listed: readonly Milestone[] = milestones,
  schedule: Schedule = tied,
): void {
  render(
    <MilestoneList milestones={listed} plan={retiring} schedule={schedule} />,
    { wrapper: Toaster },
  );
}

describe("MilestoneList", () => {
  // The plan runs from 2026 to 2079, so the children leave home 10 of
  // its 53 years in, the owner retires in 2049, 23 years in, and the
  // downsize is 29 years in.
  it("lists the milestones in the order they come, retirement among them, each pinned on the plan's span", () => {
    renderList();

    const section = screen.getByRole("region", { name: "Milestones" });

    expect(within(section).getByText("Sect. III.i")).toHaveClass("label");
    // A row is drawn in its folded lines and again in its columns, only
    // one of which is on screen at any width, so each name is found
    // twice, one row after another.
    expect(
      within(section)
        .getAllByText(/^(Kids leave home|Retirement|Downsize)$/)
        .map((name) => name.textContent),
    ).toStrictEqual([
      "Kids leave home",
      "Kids leave home",
      "Retirement",
      "Retirement",
      "Downsize",
      "Downsize",
    ]);
    expect(within(section).getAllByText("2049")).toHaveLength(2);
    expect(within(section).getAllByText("2049").at(-1)).toHaveClass("figure");
    expect(within(section).getAllByText("Age 59")).toHaveLength(2);
    expect(within(section).getAllByText("Age 59").at(-1)).toHaveClass("label");
    expect(within(section).getAllByText("Age 46")).toHaveLength(2);
    expect(within(section).getAllByText("Age 65")).toHaveLength(2);
    expect(
      within(section).getByText(
        /retirement moves with the age set on the dashboard\.$/,
      ),
    ).toBeInTheDocument();
    // Hidden from the tree, so no query is better than the slot.
    expect(
      within(section)
        .getAllByText(bySlot("pin-bar-pin"), { suggest: false })
        .map((pin) => pin.style.left),
    ).toStrictEqual(
      [10, 10, 23, 23, 29, 29].map((years) => `${String((years / 53) * 100)}%`),
    );
  });

  // Retirement is set on the dashboard, so its row draws a lock in its
  // actions column and on its folded lines, where a milestone the
  // household lists has a pencil and a bin, and opens from its folded
  // name.
  it("gives each listed milestone a pencil and a bin, and retirement a lock in their place", () => {
    renderList();

    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Delete Downsize" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Retirement" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("img", {
        name: "Set by the retirement age on the dashboard",
      }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Retirement" }),
    ).not.toBeInTheDocument();
  });

  // Each says it twice, in its columns and on its folded lines, and the
  // downsize, which no line is tied to, says nothing.
  it("says which lines end and start at each milestone, from either schedule", () => {
    renderList();

    expect(
      screen.getAllByText(
        "Ends Childcare · Ends Mortgage payment 3 years after · Starts Salary step-up",
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByText("Ends Salary, Salary step-up and Household"),
    ).toHaveLength(2);
    expect(screen.getAllByText(/^(Ends|Starts) /)).toHaveLength(4);
  });

  it("lists retirement alone for a household listing no milestone", () => {
    renderList([], { expenses: [], income: [] });

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getAllByText("Retirement")).toHaveLength(2);
  });

  it("adds a named milestone from a row opened at the foot of the list, and reports it", async () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Add milestone" }));

    const form = screen.getByRole("form", { name: "New milestone" });
    const name = within(form).getByRole("textbox", { name: "Name" });
    const year = within(form).getByRole("textbox", { name: "Year" });

    expect(screen.getAllByRole("listitem").at(-1)).toContainElement(form);
    expect(name).toHaveFocus();
    // Ten years into the plan, as a new expense line runs for.
    expect(year).toHaveValue("2036");
    expect(year).toHaveAccessibleDescription("Age 46");
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(form).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add milestone" }),
    ).toBeDisabled();

    fireEvent.change(name, { target: { value: " Sabbatical " } });
    commit(year, "2040");

    expect(year).toHaveAccessibleDescription("Age 50");

    // The store's answer is held back, so the save can be seen in flight.
    const { answer, promise } = heldBack<Answer<Milestone>>();
    vi.mocked(saveMilestone).mockReturnValue(promise);
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(null, {
      name: "Sabbatical",
      year: 2040,
    });
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled();

    answer(saved({ id: 3, name: "Sabbatical", year: 2040 }));

    await waitFor(() => {
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone added" }),
    ).toHaveAccessibleDescription("Sabbatical · 2040");
  });

  // Enter submits the form without the focus leaving the year, which is
  // when the year commits, so the save takes the focus off it first and
  // sends the year typed rather than the one the row opened with.
  it("opens a milestone in its row and saves a year typed and entered", async () => {
    renderList();
    vi.mocked(saveMilestone).mockResolvedValue(
      saved({ ...downsize, year: 2057 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Downsize" }));

    const form = screen.getByRole("form", { name: "Edit milestone" });
    const year = within(form).getByRole("textbox", { name: "Year" });

    expect(within(form).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Downsize",
    );
    expect(year).toHaveValue("2055");
    // The row is edited where it is listed, last of the three.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByRole("listitem")[2]).toContainElement(form);

    year.focus();
    fireEvent.change(year, { target: { value: "2057" } });
    fireEvent.submit(form);

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(downsize.id, {
      name: "Downsize",
      year: 2057,
    });
    await waitFor(() => {
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone updated" }),
    ).toHaveAccessibleDescription("Downsize · 2057");
  });

  it("opens a folded row from its name, one row at a time", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Kids leave home" }));

    expect(
      within(screen.getByRole("form")).getByRole("textbox", { name: "Name" }),
    ).toHaveValue("Kids leave home");

    fireEvent.click(screen.getByRole("button", { name: "Edit Downsize" }));

    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(
      within(screen.getByRole("form")).getByRole("textbox", { name: "Name" }),
    ).toHaveValue("Downsize");
    expect(
      screen.getByRole("button", { name: "Edit Kids leave home" }),
    ).toBeInTheDocument();
  });

  it("drops the row's draft on Cancel or Escape and saves nothing", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Edit Downsize" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Move" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getAllByText("Downsize")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Add milestone" }));
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(screen.getByRole("form")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(saveMilestone).not.toHaveBeenCalled();
  });

  it("keeps the row open when the store refuses, and says why", async () => {
    renderList();
    vi.mocked(saveMilestone).mockResolvedValue(
      refused("No milestone has the id"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Downsize" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Milestone not saved" }),
      ).toHaveAccessibleDescription("No milestone has the id");
    });
    expect(screen.getByRole("form")).toBeVisible();
  });

  it("asks before deleting a milestone from its bin, and deletes it on confirm", async () => {
    renderList();
    vi.mocked(removeMilestone).mockResolvedValue(saved(undefined));

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Kids leave home" }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Kids leave home?",
    });

    expect(dialog).toHaveAccessibleDescription(
      "The 3 lines tied to it stay where they are, in fixed years. It cannot be brought back.",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(removeMilestone).toHaveBeenCalledExactlyOnceWith(kidsLeave.id);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone deleted" }),
    ).toHaveAccessibleDescription("Kids leave home");
  });

  // A folded row has no bin, so the row it opens into offers the Delete,
  // which closes the row and asks as the bin does.
  it("asks from the open row's Delete, with the row closed", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Downsize" }));
    fireEvent.click(
      within(screen.getByRole("form")).getByRole("button", { name: "Delete" }),
    );

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(
      screen.getByRole("alertdialog", { name: "Delete Downsize?" }),
    ).toHaveAccessibleDescription("It cannot be brought back.");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeMilestone).not.toHaveBeenCalled();
  });

  it("says the one line tied to a milestone stays where it is", () => {
    renderList(milestones, {
      expenses: [{ ...childcare, endsAt: 1 }],
      income: [],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Kids leave home" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Kids leave home?" }),
    ).toHaveAccessibleDescription(
      "The line tied to it stays where it is, in a fixed year. It cannot be brought back.",
    );
  });
});
