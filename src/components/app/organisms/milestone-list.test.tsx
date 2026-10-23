import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Condition, Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Sale } from "@/engine/projection";

import { removeMilestone, saveMilestone } from "@/actions/milestones";
import { Toaster } from "@/components/kit/toast";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, retiring } from "@/data/income.fixture";
import { atAge, retiringAt } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { saved } from "@/lib/answer";
import { laneColumns } from "@/lib/span";
import { bySlot, commit, field, openEntry, openRow } from "@/test/dom";

import { MilestoneList } from "./milestone-list";

vi.mock("@/actions/milestones", () => ({
  removeMilestone: vi.fn(),
  saveMilestone: vi.fn(),
  saveRetirement: vi.fn(),
}));

const [kidsLeave, downsize, , independence] = milestones;
const [salary, stepUp] = incomeLines;
const [household, childcare, mortgage] = expenseLines;

// The reference schedule with the salary and its step-up tied to end at
// retirement, the household spending to end at it, the childcare at the
// children leaving home and the mortgage three years after, and the
// step-up to start at them.
const tied = {
  expenses: [
    { ...household, endsAt: "retirement" },
    { ...childcare, endsAt: 7 },
    { ...mortgage, endsAfter: 3, endsAt: 7 },
    ...expenseLines.slice(3),
  ],
  income: [
    { ...salary, endsAt: "retirement" },
    { ...stepUp, endsAt: "retirement", startsAt: 7 },
    ...incomeLines.slice(2),
  ],
} as const;

// Save and delete report through the toast manager, which needs its
// Toaster mounted.
function renderList(
  listed: readonly Milestone[] = milestones,
  schedule: Schedule = tied,
  {
    onConditions,
    plan = retiring,
    sales = [],
  }: {
    readonly onConditions?: readonly Condition[];
    readonly plan?: Plan;
    readonly sales?: readonly Sale[];
  } = {},
): void {
  render(
    <MilestoneList
      milestones={listed}
      onConditions={onConditions}
      plan={plan}
      sales={sales}
      schedule={schedule}
    />,
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

  // A milestone opens from its name, in its columns and on its folded
  // lines, with a chevron at the row's end, retirement among them.
  it("opens each milestone from its name, retirement among them", () => {
    renderList();

    expect(screen.getAllByRole("button", { name: "Downsize" })).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "First million" }),
    ).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Retirement" })).toHaveLength(
      2,
    );
    expect(
      screen.queryByRole("button", { name: /^(Edit|Delete) / }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // Retiring at 59, retirement opens on its age, and is saved onto the
  // owner rather than among the records.
  it("opens retirement in the milestone dialog, on its age", () => {
    renderList();

    openRow("Retirement");

    const dialog = screen.getByRole("dialog", { name: "Retirement" });

    expect(field("Age", dialog)).toHaveValue("59");
  });

  // Retiring on financial independence, laid out where the plan at its
  // own rates reaches it, retiring at 51 in 2041: the row says what it is
  // reached on beside the lines tied to it and pins that year, and opens
  // on the conditions. Where the plan never reaches them, laid past its
  // end, the row draws no pin and no year.
  it("lists retirement on conditions where the plan reaches them, saying what they are, and opens on them", () => {
    renderList(milestones, tied, {
      onConditions: independence.conditions,
      plan: retiringAt(retiring, 51),
    });

    expect(
      screen.getAllByText(
        "Liquid net worth ≥ 25 years of expenses · Liquid net worth ≥ 10 times the debt · Ends Salary, Salary step-up and Household",
      ),
    ).toHaveLength(2);
    expect(screen.getAllByText("2041")).toHaveLength(2);

    openRow("Retirement");

    expect(
      screen.getByRole("radio", { name: "When conditions hold" }),
    ).toBeChecked();
  });

  it("draws no pin or year for retirement on conditions the plan never reaches", () => {
    renderList(
      [],
      { expenses: [], income: [] },
      { onConditions: independence.conditions, plan: retiringAt(retiring, 90) },
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getAllByText("When reached")).toHaveLength(2);
    expect(
      screen.queryAllByText(bySlot("pin-bar-pin"), { suggest: false }),
    ).toHaveLength(0);
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

  // The home moving as the children leave leaves £304,000 of equity,
  // puts £289,000 down on the next and pays £15,000 of stamp duty; the
  // downsize, which nothing is tied to, leaves £420,000, pays its
  // £300,000 outright and £5,000 of duty.
  it("says what a move comes to beside the milestone it is made at", () => {
    renderList(milestones, tied, {
      sales: [
        {
          at: 7,
          borrowed: 211000,
          deposit: 289000,
          duty: 15000,
          equity: 304000,
          house: "Home",
        },
        {
          at: 8,
          borrowed: 0,
          deposit: 300000,
          duty: 5000,
          equity: 420000,
          house: "Home",
        },
      ],
    });

    expect(
      screen.getAllByText(
        "Ends Childcare · Ends Mortgage payment 3 years after · Starts Salary step-up · Moves Home: £304,000 equity, £289,000 deposit, £15,000 stamp duty",
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        "Moves Home: £420,000 equity, £300,000 paid outright, £5,000 stamp duty",
      ),
    ).toHaveLength(2);
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
    expect(screen.getAllByRole("button", { name: "Retirement" })).toHaveLength(
      2,
    );
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

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      null,
      { conditions: atAge(50), name: "Sabbatical" },
      null,
    );
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

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      downsize.id,
      { conditions: atAge(67), name: "Downsize" },
      downsize,
    );
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
      expenses: [{ ...childcare, endsAt: 7 }],
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
