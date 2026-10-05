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
import { laneColumns } from "@/lib/span";
import { bySlot, commit, pressRow } from "@/test/dom";

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

    expect(within(section).getByText("Sect. IV.i")).toHaveClass("label");
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
        /retirement moves with the age set on the Dashboard\.$/,
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
    // Laid out in the schedules' columns, retirement's lock row as wide
    // in its span as a row with a pencil and a bin.
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

  // A milestone the household lists opens from its name, in its columns
  // and on its folded lines, with a chevron at the row's end. Retirement
  // is set on the dashboard, so its row draws a lock in the chevron's
  // place, in both, and links there.
  it("opens each listed milestone from its name, and gives retirement a lock in its chevron's place", () => {
    renderList();

    expect(screen.getAllByRole("button", { name: "Downsize" })).toHaveLength(2);
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
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Milestone>>();
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

    pressRow("Downsize");

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

  it("opens a row from its name on its folded lines or in its columns, one row at a time", () => {
    renderList();

    pressRow("Kids leave home");

    expect(
      within(screen.getByRole("form")).getByRole("textbox", { name: "Name" }),
    ).toHaveValue("Kids leave home");

    // The downsize from its name in its columns, the second of its two.
    for (const opener of screen
      .getAllByRole("button", { name: "Downsize" })
      .slice(-1)) {
      fireEvent.click(opener);
    }

    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(
      within(screen.getByRole("form")).getByRole("textbox", { name: "Name" }),
    ).toHaveValue("Downsize");
    expect(
      screen.getAllByRole("button", { name: "Kids leave home" }),
    ).toHaveLength(2);
  });

  it("drops the row's draft on Cancel or Escape and saves nothing", () => {
    renderList();

    pressRow("Downsize");
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Move" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Downsize" })).toHaveLength(2);

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

    pressRow("Downsize");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Milestone not saved" }),
      ).toHaveAccessibleDescription("No milestone has the id");
    });
    expect(screen.getByRole("form")).toBeVisible();
  });

  it("asks before deleting a milestone from its open row, and deletes it on confirm", async () => {
    renderList();
    vi.mocked(removeMilestone).mockResolvedValue(saved(undefined));

    pressRow("Kids leave home");
    fireEvent.click(
      within(screen.getByRole("form")).getByRole("button", { name: "Delete" }),
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

  // The row a milestone opens into offers the Delete, which closes the
  // row before it asks.
  it("asks from the open row's Delete, with the row closed", () => {
    renderList();

    pressRow("Downsize");
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

    pressRow("Kids leave home");
    fireEvent.click(
      within(screen.getByRole("form")).getByRole("button", { name: "Delete" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Kids leave home?" }),
    ).toHaveAccessibleDescription(
      "The line tied to it stays where it is, in a fixed year. It cannot be brought back.",
    );
  });
});
