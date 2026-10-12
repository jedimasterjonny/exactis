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

import { removeMilestone, saveMilestone } from "@/actions/milestones";
import { Toaster } from "@/components/kit/toast";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, retiring } from "@/data/income.fixture";
import { atAge } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { saved } from "@/lib/answer";
import { laneColumns } from "@/lib/span";
import { bySlot, commit, field, openEntry, openRow } from "@/test/dom";

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
  // downsize is 29 years in; the first million and independence are
  // reached when conditions hold, and come after them.
  it("lists the milestones in the order they come, retirement among them, each reached at an age pinned on the plan's span", () => {
    renderList();

    const section = screen.getByRole("region", { name: "Milestones" });

    expect(within(section).getByText("Sect. IV.i")).toHaveClass("label");
    // A row is drawn in its folded lines and again in its columns, only
    // one of which is on screen at any width, so each name is found
    // twice, one row after another.
    expect(
      within(section)
        .getAllByText(
          /^(Kids leave home|Retirement|Downsize|First million|Financial independence)$/,
        )
        .map((name) => name.textContent),
    ).toStrictEqual([
      "Kids leave home",
      "Kids leave home",
      "Retirement",
      "Retirement",
      "Downsize",
      "Downsize",
      "First million",
      "First million",
      "Financial independence",
      "Financial independence",
    ]);
    expect(within(section).getAllByText("2049")).toHaveLength(2);
    expect(within(section).getAllByText("2049").at(-1)).toHaveClass("figure");
    expect(within(section).getAllByText("Age 59")).toHaveLength(2);
    expect(within(section).getAllByText("Age 59").at(-1)).toHaveClass("label");
    expect(within(section).getAllByText("Age 46")).toHaveLength(2);
    expect(within(section).getAllByText("Age 65")).toHaveLength(2);
    // Hidden from the tree, so no query is better than the slot.
    expect(
      within(section)
        .getAllByText(bySlot("pin-bar-pin"), { suggest: false })
        .map((pin) => pin.style.left),
    ).toStrictEqual(
      [10, 10, 23, 23, 29, 29].map((years) => `${String((years / 53) * 100)}%`),
    );
    // Laid out in the schedules' columns, retirement's lock row as wide
    // in its span as a row with a pencil and a bin.
    expect(within(section).getAllByRole("listitem")).toHaveLength(5);
    for (const row of within(section).getAllByRole("listitem")) {
      expect(row).toHaveClass(laneColumns);
    }
    // The span is ruled in decades above the rows, in the pins' column,
    // and every pin's track carries a rule at each milestone: three
    // milestones on each of the six tracks.
    const ruler = within(section).getByText(bySlot("span-ruler"), {
      suggest: false,
    });

    // eslint-disable-next-line testing-library/no-node-access -- the box the ruler sits in is a layout box with no role of its own
    expect(ruler.parentElement).toHaveClass(laneColumns);
    expect(
      within(section).getAllByText(bySlot("pin-bar-mark"), { suggest: false }),
    ).toHaveLength(18);
  });

  // Each is drawn folded and in its columns: its conditions in words,
  // a dash for the year, muted on the folded line, and no pin.
  it("lists a milestone reached when conditions hold with its conditions, no pin and no year", () => {
    renderList();

    expect(screen.getAllByText("Net worth ≥ £1,000,000")).toHaveLength(2);
    expect(
      screen.getAllByText(
        "Liquid net worth ≥ 25 years of expenses · Liquid net worth ≥ 10 times the debt",
      ),
    ).toHaveLength(2);
    expect(screen.getAllByText("When reached")).toHaveLength(4);
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.getAllByText("—")[0]).toHaveClass("text-muted-foreground");
    expect(screen.getAllByText("—")[1]).toHaveClass("figure");
    expect(
      screen.getAllByText(bySlot("pin-bar"), { suggest: false }),
    ).toHaveLength(6);
  });

  // A milestone the household lists opens from its name, in its columns
  // and on its folded lines, with a chevron at the row's end. Retirement
  // is set on the dashboard, so its row draws a lock in the chevron's
  // place, in both, and links there.
  it("opens each listed milestone from its name, and gives retirement a lock in its chevron's place", () => {
    renderList();

    expect(screen.getAllByRole("button", { name: "Downsize" })).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "First million" }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /^(Edit|Delete) / }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("img", {
        name: "Set by the retirement age on the Dashboard",
      }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Retirement" }),
    ).not.toBeInTheDocument();
    // Its name links to the dashboard, where it is set.
    for (const link of screen.getAllByRole("link", { name: "Retirement" })) {
      expect(link).toHaveAttribute("href", "/");
    }
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

  // A salary running with the plan is paid to the year before
  // retirement whatever its end says, so retirement names it as ending
  // there, though it is tied to nothing.
  it("names a salary its pay stops at retirement as ending there", () => {
    renderList(milestones, {
      expenses: [],
      income: [{ ...salary, lastYear: null }],
    });

    expect(screen.getAllByText("Ends Salary")).toHaveLength(2);
  });

  it("lists retirement alone for a household listing no milestone", () => {
    renderList([], { expenses: [], income: [] });

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Retirement" })).toHaveLength(2);
  });

  // The dialog opens on a milestone reached at an age, and closes once
  // the store has it.
  it("adds a milestone from the dialog, and closes it once saved", async () => {
    renderList();
    vi.mocked(saveMilestone).mockResolvedValue(
      saved({ conditions: atAge(50), id: 5, name: "Sabbatical" }),
    );

    const dialog = openEntry("Add milestone");

    expect(within(dialog).getByText("New milestone")).toHaveClass("text-brand");
    expect(screen.getByRole("radio", { name: "At an age" })).toBeChecked();

    fireEvent.change(field("Name", dialog), {
      target: { value: "Sabbatical" },
    });
    commit(field("Age", dialog), "50");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(null, {
      conditions: atAge(50),
      name: "Sabbatical",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Sabbatical" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone added" }),
    ).toHaveAccessibleDescription("Sabbatical · 2040");
  });

  it("opens a milestone in its dialog from its row, on the age it is reached at", async () => {
    renderList();
    vi.mocked(saveMilestone).mockResolvedValue(
      saved({ ...downsize, conditions: atAge(67) }),
    );

    const dialog = openRow("Downsize");

    expect(within(dialog).getByText("Edit milestone")).toHaveClass(
      "text-brand",
    );
    expect(field("Age", dialog)).toHaveValue("65");

    commit(field("Age", dialog), "67");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(downsize.id, {
      conditions: atAge(67),
      name: "Downsize",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Downsize" }),
      ).not.toBeInTheDocument();
    });
  });

  it("opens a milestone reached when conditions hold on its conditions", () => {
    renderList();

    const dialog = openRow("First million");

    expect(
      screen.getByRole("radio", { name: "When conditions hold" }),
    ).toBeChecked();
    expect(field("At least", dialog)).toHaveValue("£1,000,000");
  });

  it("drops a cancelled draft", () => {
    renderList();

    let dialog = openRow("Downsize");

    fireEvent.change(field("Name", dialog), { target: { value: "Move" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveMilestone).not.toHaveBeenCalled();

    dialog = openRow("Downsize");

    expect(field("Name", dialog)).toHaveValue("Downsize");
  });

  it("asks before deleting a milestone from its dialog, the dialog closing first, and deletes it on confirm", async () => {
    renderList();
    vi.mocked(removeMilestone).mockResolvedValue(saved(undefined));

    fireEvent.click(
      within(openRow("Kids leave home")).getByRole("button", {
        name: "Delete",
      }),
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
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone deleted" }),
    ).toHaveAccessibleDescription("Kids leave home");
  });

  it("asks about a milestone nothing is tied to, and deletes nothing on Cancel", () => {
    renderList();

    fireEvent.click(
      within(openRow("Downsize")).getByRole("button", { name: "Delete" }),
    );

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
      within(openRow("Kids leave home")).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Kids leave home?" }),
    ).toHaveAccessibleDescription(
      "The line tied to it stays where it is, in a fixed year. It cannot be brought back.",
    );
  });
});
