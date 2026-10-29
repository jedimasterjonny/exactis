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
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Answer } from "@/lib/answer";

import {
  removeMilestone,
  saveMilestone,
  saveRetirement,
} from "@/actions/milestones";
import { Toaster } from "@/components/kit/toast";
import { children } from "@/data/children.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, retiring } from "@/data/income.fixture";
import { atAge, retiringAt } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { sam } from "@/data/owners.fixture";
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
const [ada, finn] = children;

// The plan carrying Sam, born in 1995, beside its owner, born in 1992,
// and the three children, born in 2015, 2016 and 2028.
const raising: Plan = {
  ...retiring,
  children,
  owners: [...retiring.owners, sam],
};

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
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });
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

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      null,
      { conditions: atAge(52), name: "Sabbatical" },
      null,
    );
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");

    answer(saved({ conditions: atAge(52), id: 5, name: "Sabbatical" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
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

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      null,
      {
        conditions: [{ measure: "worth", of: "debt", times: 10 }],
        name: "Independence",
      },
      null,
    );
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

  // The children leave home at 48; nothing is tied to it here, so
  // either way is open to it.
  it("opens a milestone reached at an age on its age, free to be reached when conditions hold instead", () => {
    renderDialog({ milestone: kidsLeave });
    const dialog = screen.getByRole("dialog", { name: "Kids leave home" });

    expect(within(dialog).getByText("Edit milestone")).toHaveClass(
      "text-brand",
    );
    expect(field("Name", dialog)).toHaveValue("Kids leave home");
    expect(radio("At an age")).toBeChecked();
    expect(field("Age", dialog)).toHaveValue("48");
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

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      firstMillion.id,
      {
        conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
        name: "First million",
      },
      firstMillion,
    );
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

  // Retiring at 61, in 2053: retirement opens on its age, named and
  // with nothing to type a name into or delete, its conditions standing
  // by at twenty-five years of expenses, and saved onto the owner as
  // those conditions once chosen.
  it("edits retirement, on its age or on conditions, with no name and no Delete, and saves it onto the owner", async () => {
    const onClose = vi.fn<() => void>();
    renderDialog({
      milestone: { retirement: atAge(61) },
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
    expect(field("Age", dialog)).toHaveValue("61");

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
      plan: { ...retiring, retires: 92 },
    });
    const dialog = screen.getByRole("dialog", { name: "Retirement" });

    expect(radio("When conditions hold")).toBeChecked();
    expect(within(dialog).getAllByRole("combobox")).toHaveLength(4);

    fireEvent.click(radio("At an age"));

    expect(field("Age", dialog)).toHaveValue("91");
  });

  // Retiring on twenty-five years of expenses, or by 60, in 2052: both
  // open, the age is held a year short of the plan's end at 91, and the
  // age typed is saved after the conditions, and said as the age
  // retirement comes by.
  it("edits retirement on conditions or by an age, and saves it with the age after the conditions", async () => {
    const onClose = vi.fn<() => void>();
    renderDialog({
      milestone: {
        retirement: [
          { measure: "liquid", of: "expenses", times: 25 },
          ...atAge(60),
        ],
      },
      onClose,
    });
    const dialog = screen.getByRole("dialog", { name: "Retirement" });
    const either = radio("When conditions hold, or by an age");

    expect(either).toBeChecked();
    expect(either).toHaveAccessibleDescription(
      "Each future retires once they first hold, or at the age if sooner",
    );
    expect(field("At least", dialog)).toHaveValue("25");
    expect(field("Or by age", dialog)).toHaveValue("60");
    expect(field("Or by age", dialog)).toHaveAccessibleDescription("In 2052");

    commit(field("Or by age", dialog), "91");

    expect(field("Or by age", dialog)).toHaveValue("90");

    commit(field("Or by age", dialog), "58");

    expect(field("Or by age", dialog)).toHaveAccessibleDescription("In 2050");

    const retirement = [
      { measure: "liquid", of: "expenses", times: 25 },
      { measure: "age", of: "years", times: 58 },
    ] as const;
    vi.mocked(saveRetirement).mockResolvedValue(
      saved({ conditions: retirement, name: "Retirement" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveRetirement).toHaveBeenCalledExactlyOnceWith(retirement);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(
      screen.getByRole("dialog", { name: "Retirement updated" }),
    ).toHaveAccessibleDescription(
      "Retirement · Liquid net worth ≥ 25 years of expenses · Or by age 58",
    );
  });

  // Born in 1992, the owner reaches their State Pension age of 68 in
  // 2060, within a plan to 91, so the age retirement comes by opens
  // there, rather than at the 61 they retire at or anywhere the
  // conditions say; a plan to 68 holds it a year short, at 67 in 2059,
  // and an owner born in 1950, 76 as the plan opens and past their 66,
  // opens on the age they are.
  it.each([
    {
      age: "68",
      plan: retiring,
      retirement: atAge(61),
      said: "retiring at 61",
      year: "In 2060",
    },
    {
      age: "68",
      plan: retiring,
      retirement: independence.conditions,
      said: "on conditions",
      year: "In 2060",
    },
    {
      age: "67",
      plan: { ...retiring, years: 34 },
      retirement: independence.conditions,
      said: "on conditions in a plan to 68",
      year: "In 2059",
    },
    {
      age: "76",
      plan: { ...retiring, born: 1950, years: 20 },
      retirement: independence.conditions,
      said: "on conditions past the State Pension age",
      year: "In 2026",
    },
  ])(
    "opens the age retirement comes by at its owner's State Pension age, held to the ages its field offers: $said",
    ({ age, plan, retirement, year }) => {
      renderDialog({ milestone: { retirement }, plan });
      const dialog = screen.getByRole("dialog", { name: "Retirement" });

      fireEvent.click(radio("When conditions hold, or by an age"));

      expect(field("Or by age", dialog)).toHaveValue(age);
      expect(field("Or by age", dialog)).toHaveAccessibleDescription(year);
    },
  );

  // Retiring on twenty-five years of expenses, or by 60, laid out at 57,
  // where the plan at its own rates reaches them: turned to the
  // conditions alone the age goes, and turned to an age it is the one
  // the plan lays out.
  it.each([
    [
      "When conditions hold",
      [{ measure: "liquid", of: "expenses", times: 25 }] as const,
    ],
    ["At an age", atAge(57)],
  ])(
    "saves retirement turned from conditions or by an age to %s on that alone",
    async (choice, conditions) => {
      renderDialog({
        milestone: {
          retirement: [
            { measure: "liquid", of: "expenses", times: 25 },
            ...atAge(60),
          ],
        },
        plan: retiringAt(retiring, 57),
      });
      const dialog = screen.getByRole("dialog", { name: "Retirement" });

      fireEvent.click(radio(choice));
      vi.mocked(saveRetirement).mockResolvedValue(
        saved({ conditions, name: "Retirement" }),
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

      expect(saveRetirement).toHaveBeenCalledExactlyOnceWith(conditions);
      expect(
        await screen.findByRole("dialog", { name: "Retirement updated" }),
      ).toBeInTheDocument();
    },
  );

  // Only retirement comes by an age; a milestone is one way or the
  // other.
  it("offers a milestone no choice of conditions or an age", () => {
    renderDialog({ milestone: firstMillion });

    expect(radio("When conditions hold")).toBeChecked();
    expect(
      screen.queryByRole("radio", {
        name: "When conditions hold, or by an age",
      }),
    ).not.toBeInTheDocument();
  });

  // Ten years in is the plan's owner's 44, in 2036, which is Ada's 21;
  // she is 11 as the plan opens in 2026 and 68 as it ends in 2083, and
  // reaches 18 in 2033.
  it("measures a milestone on anyone the plan carries, keeping the year it falls in as the choice turns, and saves whose age it is", async () => {
    renderDialog({ plan: raising });
    const dialog = openDialog();
    const whose = select("Whose age");

    expect(whose).toHaveValue("");
    expect(
      within(whose)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Me (the plan's owner)", "Sam", "Ada", "Finn", "Cleo"]);

    fireEvent.change(whose, { target: { value: String(ada.id) } });

    expect(field("Age", dialog)).toHaveValue("21");
    expect(field("Age", dialog)).toHaveAccessibleDescription("In 2036");

    commit(field("Age", dialog), "5");

    expect(field("Age", dialog)).toHaveValue("11");

    commit(field("Age", dialog), "70");

    expect(field("Age", dialog)).toHaveValue("68");

    commit(field("Age", dialog), "18");

    expect(field("Age", dialog)).toHaveAccessibleDescription("In 2033");

    fireEvent.change(field("Name", dialog), { target: { value: "Ada at 18" } });
    vi.mocked(saveMilestone).mockResolvedValue(
      saved({ conditions: atAge(18, ada.id), id: 11, name: "Ada at 18" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      null,
      { conditions: atAge(18, ada.id), name: "Ada at 18" },
      null,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Milestone added" }),
      ).toHaveAccessibleDescription("Ada at 18 · 2033");
    });
  });

  it("offers another owner's age where the plan carries no child", () => {
    renderDialog({ plan: { ...retiring, owners: [...retiring.owners, sam] } });

    expect(
      within(select("Whose age"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Me (the plan's owner)", "Sam"]);
  });

  // Cleo is expected in 2028, so a milestone as the plan opens in 2026,
  // the plan's owner's 34, could not keep its year at her age, and she
  // is offered from 2028.
  it("offers no one born after the year the milestone falls in", () => {
    renderDialog({ plan: raising });
    const dialog = openDialog();
    const offered = (): (null | string)[] =>
      within(select("Whose age"))
        .getAllByRole("option")
        .map((option) => option.textContent);

    commit(field("Age", dialog), "34");

    expect(offered()).toStrictEqual([
      "Me (the plan's owner)",
      "Sam",
      "Ada",
      "Finn",
    ]);

    commit(field("Age", dialog), "36");

    expect(offered()).toContain("Cleo");
  });

  // Finn, born in 2016, is 19 in 2035, which is the plan's owner's 43.
  it("opens a milestone on whoever's age it is measured on, and turned back to the plan's owner's saves it naming nobody", async () => {
    const atFinns = { conditions: atAge(19, finn.id), id: 11, name: "Finn" };
    renderDialog({ milestone: atFinns, plan: raising });
    const dialog = screen.getByRole("dialog", { name: "Finn" });

    expect(select("Whose age")).toHaveValue(String(finn.id));
    expect(field("Age", dialog)).toHaveValue("19");
    expect(field("Age", dialog)).toHaveAccessibleDescription("In 2035");

    fireEvent.change(select("Whose age"), { target: { value: "" } });

    expect(field("Age", dialog)).toHaveValue("43");

    vi.mocked(saveMilestone).mockResolvedValue(
      saved({ ...atFinns, conditions: atAge(43) }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      11,
      { conditions: atAge(43), name: "Finn" },
      atFinns,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Milestone updated" }),
      ).toBeInTheDocument();
    });
  });

  // Finn, born in October 2016, leaves school at 19, in 2035, and Ada,
  // born in March 2015, at 18, in 2033; the plan's owner and Sam are
  // offered no such thing.
  it("offers a child's milestone the age they leave school at, filled in with a press, and saves it as an age on them", async () => {
    renderDialog({ plan: raising });
    const dialog = openDialog();

    expect(
      within(dialog).queryByRole("button", { name: /^Leaves school/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(select("Whose age"), {
      target: { value: String(sam.id) },
    });

    expect(
      within(dialog).queryByRole("button", { name: /^Leaves school/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(select("Whose age"), {
      target: { value: String(ada.id) },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Leaves school at 18" }),
    );

    expect(field("Age", dialog)).toHaveValue("18");
    expect(field("Age", dialog)).toHaveAccessibleDescription("In 2033");

    fireEvent.change(select("Whose age"), {
      target: { value: String(finn.id) },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Leaves school at 19" }),
    );

    expect(field("Age", dialog)).toHaveValue("19");
    expect(field("Age", dialog)).toHaveAccessibleDescription("In 2035");

    fireEvent.change(field("Name", dialog), {
      target: { value: "Finn leaves school" },
    });
    vi.mocked(saveMilestone).mockResolvedValue(
      saved({
        conditions: atAge(19, finn.id),
        id: 11,
        name: "Finn leaves school",
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      null,
      { conditions: atAge(19, finn.id), name: "Finn leaves school" },
      null,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Milestone added" }),
      ).toHaveAccessibleDescription("Finn leaves school · 2035");
    });
  });

  // The plan runs from 2026 to 2083. Dot, born in March 2008, leaves in
  // 2026 and Fay, born in October 2064, in 2083, each within it; Eli,
  // born in March 2007, left in 2025, and Gus, born in October 2065,
  // leaves in 2084, past it. The milestone is moved to 2065 first, so
  // all four are offered.
  it("offers leaving school only where the child leaves within the plan's years", () => {
    renderDialog({
      plan: {
        ...retiring,
        children: [
          { born: { month: 2, year: 2008 }, id: 30, name: "Dot" },
          { born: { month: 2, year: 2007 }, id: 31, name: "Eli" },
          { born: { month: 9, year: 2064 }, id: 32, name: "Fay" },
          { born: { month: 9, year: 2065 }, id: 33, name: "Gus" },
        ],
      },
    });
    const dialog = openDialog();
    const offers = (id: number): null | string => {
      fireEvent.change(select("Whose age"), { target: { value: String(id) } });
      return (
        within(dialog).queryByRole("button", { name: /^Leaves school/ })
          ?.textContent ?? null
      );
    };

    commit(field("Age", dialog), "73");

    expect(offers(30)).toBe("Leaves school at 18");
    expect(offers(31)).toBeNull();
    expect(offers(32)).toBe("Leaves school at 19");
    expect(offers(33)).toBeNull();
  });

  // Retirement is the plan's owner's own, whoever else the plan carries.
  it("offers retirement no choice of whose age it is", () => {
    renderDialog({ milestone: { retirement: atAge(61) }, plan: raising });

    expect(
      screen.queryByRole("combobox", { name: "Whose age" }),
    ).not.toBeInTheDocument();
  });

  // Only a page drawn before someone went could hand the dialog a
  // milestone measured on them, which the store refuses on its save.
  it("opens a milestone measured on someone the plan does not carry on the plan's owner's years", () => {
    renderDialog({
      milestone: { conditions: atAge(18, 99), id: 11, name: "Gone" },
    });

    expect(field("Age", openDialog())).toHaveAccessibleDescription("In 2010");
  });

  it("tells the caller on Cancel, saving nothing", () => {
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(saveMilestone).not.toHaveBeenCalled();
  });
});
