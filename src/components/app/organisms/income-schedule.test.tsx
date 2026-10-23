import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IncomeLine } from "@/data/income";
import type { Answer } from "@/lib/answer";

import { removeIncomeLine, saveIncomeLine } from "@/actions/schedule";
import { Toaster } from "@/components/kit/toast";
import { accounts, sipp } from "@/data/accounts.fixture";
import {
  incomeLines,
  plan,
  retiring,
  statePension,
} from "@/data/income.fixture";
import { retiringAt } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { owners, sam } from "@/data/owners.fixture";
import { lineGrowths } from "@/data/schedule";
import { saved as accepted, refused } from "@/lib/answer";
import { bySlot, commit, openEntry, openRow } from "@/test/dom";

import { IncomeSchedule } from "./income-schedule";

vi.mock("@/actions/schedule", () => ({
  removeIncomeLine: vi.fn(),
  saveIncomeLine: vi.fn(),
}));

const [salary] = incomeLines;

// The salary as its dialog holds it, less the id a save is sent beside.
const { id, ...salaryValues } = salary;

// A private pension typed as a line: £23,400 a year from 2058, when its
// owner is 68, rising with inflation and running to the end of the plan.
const annuity: IncomeLine = {
  ...statePension,
  amount: 23400,
  kind: "pension",
  name: "Annuity",
};
const [pension] = accounts;

// Save reports through the toast manager, which needs its Toaster
// mounted. The fixture's accounts hold the one pension the salary feeds.
function renderSchedule(lines: readonly IncomeLine[] = incomeLines): void {
  render(
    <IncomeSchedule
      accounts={[...accounts, sipp]}
      lines={lines}
      milestones={milestones}
      owners={owners}
      plan={plan}
    />,
    { wrapper: Toaster },
  );
}

// The store's answer to a save: the line as it now has it. The schedule
// shows it only once the page re-reads, which is the router's work and
// not the schedule's, so the rows here stay as rendered.
function saved(line: IncomeLine): void {
  vi.mocked(saveIncomeLine).mockResolvedValue(accepted(line));
}

describe("IncomeSchedule", () => {
  it("opens with the card, its caption and its rows", () => {
    renderSchedule();

    expect(screen.getByText("Sect. IV.ii")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "What comes in",
    );
    expect(
      screen.getByRole("region", { name: "What comes in" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(incomeLines.length);
    // A row opens from its name, in its columns and on its folded lines,
    // and is deleted from the dialog it opens.
    expect(screen.getAllByRole("button", { name: "Salary" })).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /^(Edit|Delete) / }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("£147,000")).toHaveTextContent("£147,000 / yr");
    // A row is drawn in its columns and again in its folded lines, only
    // one of which is on screen at any width, the columns' copy last.
    expect(
      screen
        .getAllByText(
          "£120,000 base · £15,000 bonus · £12,000 RSUs · 10.00% of the base into Workplace pension",
        )
        .at(-1),
    ).toHaveClass("text-muted-foreground");
    expect(screen.queryByText(/£168,000 base/)).not.toBeInTheDocument();
    // The card's rule is its caption, with no note beside the card.
    expect(
      screen.getByText("Pay stops at retirement. A rise is a new line."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The household pays the State Pension on the years typed on the
  // assumptions screen and keeps no line of it, so it says what it is
  // and is locked here, its name linking there, open on its tab, and the
  // reason where its chevron would be.
  it("locks a State Pension, linking to the tab its years are typed on", () => {
    renderSchedule([salary, statePension]);

    expect(
      screen.queryByRole("button", { name: "State pension · Me" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "State pension · Me" }).at(-1),
    ).toHaveAttribute("href", "/assumptions?tab=state-pension");
    expect(screen.getByText("State pension")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(
      screen.getAllByRole("img", {
        name: "Set by qualifying years, on the State pension tab of Assumptions",
      }),
    ).toHaveLength(2);
  });

  // The Delete in a line's dialog asks first, holds the confirm while
  // the store answers, and closes on the answer; the row goes when the
  // page re-reads.
  it("asks before deleting a line, and deletes it on confirm", async () => {
    renderSchedule();
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<undefined>>();
    vi.mocked(removeIncomeLine).mockReturnValue(promise);

    fireEvent.click(
      within(openRow("Salary")).getByRole("button", { name: "Delete" }),
    );

    const dialog = screen.getByRole("alertdialog", { name: "Delete Salary?" });

    expect(dialog).toHaveAccessibleDescription("It cannot be brought back.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(removeIncomeLine).toHaveBeenCalledExactlyOnceWith(salary.id);
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toHaveAttribute("aria-busy", "true");

    answer(accepted(undefined));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Income line deleted" }),
    ).toHaveAccessibleDescription("Salary");
  });

  it("keeps the question open when the store refuses, and says why", async () => {
    renderSchedule();
    vi.mocked(removeIncomeLine).mockResolvedValue(
      refused("No income line was written"),
    );

    fireEvent.click(
      within(openRow("Salary")).getByRole("button", { name: "Delete" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Income line not deleted" }),
      ).toHaveAccessibleDescription("No income line was written");
    });
    expect(
      screen.getByRole("alertdialog", { name: "Delete Salary?" }),
    ).toBeVisible();
  });

  it("drops the question on cancel and deletes nothing", () => {
    renderSchedule();

    fireEvent.click(
      within(openRow("Part-time consulting")).getByRole("button", {
        name: "Delete",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeIncomeLine).not.toHaveBeenCalled();
  });

  // The dialog a row opens is where it is deleted from: the Delete there
  // closes the dialog before it asks. A new line has nothing yet to
  // delete.
  it("asks from a saved line's dialog before deleting it, the dialog closing first", async () => {
    renderSchedule();
    vi.mocked(removeIncomeLine).mockResolvedValue(accepted(undefined));

    expect(
      within(openEntry("Add income line")).queryByRole("button", {
        name: "Delete",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      within(openRow("Salary")).getByRole("button", { name: "Delete" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const question = screen.getByRole("alertdialog", {
      name: "Delete Salary?",
    });
    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(removeIncomeLine).toHaveBeenCalledExactlyOnceWith(salary.id);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  // A deletion asked for over a save in flight would race it, so the
  // Delete holds while the line's save is on its way.
  it("holds a saved line's delete while its save is on its way", async () => {
    renderSchedule();
    // The store's answer is held back, so the save can be seen in flight,
    // and given at the end, so no save is left on its way.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<IncomeLine>>();
    vi.mocked(saveIncomeLine).mockReturnValue(promise);
    const dialog = openRow("Salary");

    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();

    answer(accepted(salary));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Salary" }),
      ).not.toBeInTheDocument();
    });
  });

  it("draws the empty state for none", () => {
    render(
      <IncomeSchedule
        accounts={accounts}
        lines={[]}
        milestones={milestones}
        owners={owners}
        plan={plan}
      />,
    );

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No income yet")).toBeInTheDocument();
  });

  // A salary matched by its employer says so on the row, beside the
  // share it gives up, in its columns and on its folded lines.
  it("names the share the employer matches beside the share given up", () => {
    renderSchedule([{ ...salary, match: 0.07 }]);

    expect(
      screen.getAllByText(
        "£120,000 base · £15,000 bonus · £12,000 RSUs · 10.00% of the base into Workplace pension, matched to 7.00%",
      ),
    ).toHaveLength(2);
  });

  // A salary floored as well as matched says the floor after the match,
  // and one floored and matched nothing says the floor is the
  // employer's. One giving up nothing, with no bonus or RSUs, still
  // says what its employer's floor puts into the pension, and one giving
  // up nothing and floored at nothing names no pension.
  it("names the floor an employer pays under its match, and a floor alone as the employer's", () => {
    renderSchedule([
      { ...salary, floor: 0.03, match: 0.07 },
      { ...salary, floor: 0.03, id: 20 },
      { ...salary, bonus: 0, floor: 0.03, id: 21, rsu: 0, sacrifice: 0 },
      { ...salary, id: 22, sacrifice: 0 },
    ]);

    expect(
      screen.getAllByText(
        "£120,000 base · £15,000 bonus · £12,000 RSUs · 10.00% of the base into Workplace pension, matched to 7.00%, at least 3.00%",
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        "£120,000 base · £15,000 bonus · £12,000 RSUs · 10.00% of the base into Workplace pension, at least 3.00% from the employer",
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        "£120,000 base · at least 3.00% of the base from the employer into Workplace pension",
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByText("£120,000 base · £15,000 bonus · £12,000 RSUs"),
    ).toHaveLength(2);
  });

  // A salary naming a pension not among the accounts, or giving up
  // nothing, has no sacrifice to name.
  it("names only the parts a line has beyond its base", () => {
    render(
      <IncomeSchedule
        accounts={[]}
        lines={[
          { ...salary, bonus: 0, id: 5 },
          { ...salary, id: 6, rsu: 0 },
          { ...salary, bonus: 0, id: 7, rsu: 0, sacrifice: 0 },
        ]}
        milestones={milestones}
        owners={owners}
        plan={plan}
      />,
    );

    // Each is written in the row's columns and on its folded lines.
    expect(screen.getAllByText("£120,000 base · £12,000 RSUs")).toHaveLength(2);
    expect(screen.getAllByText("£120,000 base · £15,000 bonus")).toHaveLength(
      2,
    );
    expect(screen.queryByText(/£120,000 base$/)).not.toBeInTheDocument();
    expect(screen.getByText("£132,000")).toHaveTextContent("£132,000 / yr");
    expect(screen.getByText("£135,000")).toHaveTextContent("£135,000 / yr");
    expect(screen.getByText("£120,000")).toHaveTextContent("£120,000 / yr");
  });

  // The pension row of a new employment line: the pensions among the
  // accounts and none, opening on none with no share to give up until a
  // pension is chosen, when the share opens on nothing.
  it("adds a salary feeding a pension a share of its base", async () => {
    renderSchedule();

    const dialog = openEntry("Add income line");
    const choice = within(dialog).getByRole("combobox", { name: "Pension" });

    expect(choice).toHaveValue("none");
    expect(choice).not.toHaveAccessibleDescription();
    expect(
      within(choice)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["None", "Workplace pension", "SIPP", "A new pension"]);
    expect(
      within(dialog).queryByRole("textbox", { name: "Salary sacrifice" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("textbox", { name: "Employer match" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("textbox", { name: "Employer minimum" }),
    ).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "New job" },
    });
    commit(
      within(dialog).getByRole("textbox", { name: "Base salary" }),
      "80,000",
    );
    fireEvent.change(choice, { target: { value: "6" } });

    const share = within(dialog).getByRole("textbox", {
      name: "Salary sacrifice",
    });

    expect(share).toHaveValue("0.00%");
    expect(share).toHaveAccessibleDescription("Of the base alone");

    commit(share, "150");

    // A share is at most the whole of the base, so 150 commits as 100.
    expect(share).toHaveValue("100.00%");

    commit(share, "8");
    commit(
      within(dialog).getByRole("textbox", { name: "Employer minimum" }),
      "3",
    );
    commit(
      within(dialog).getByRole("textbox", { name: "Employer match" }),
      "7",
    );
    saved({ ...salary, id: 5 });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "New job" }),
      ).not.toBeInTheDocument();
    });
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      null,
      {
        amount: 80000,
        bonus: 0,
        cadence: "year",
        endsAfter: 0,
        endsAt: "retirement",
        feeds: 6,
        firstYear: 2026,
        floor: 0.03,
        growth: "inflation",
        kind: "employment",
        lastMonth: null,
        lastYear: 2079,
        match: 0.07,
        name: "New job",
        opens: null,
        owner: 1,
        rsu: 0,
        sacrifice: 0.08,
        startsAt: null,
      },
      null,
    );
  });

  // A salary may open its pension with the save: the choice asks the
  // pension's name and what it holds, the save holds until the pension
  // is named as it holds until the line is, and the store is handed the
  // pension to open with the line feeding none by id, since the id is
  // the store's to give. The pension's name goes as typed, since the
  // store trims it as it trims the line's.
  it("adds a salary opening a pension of its own, the first owner's, with the save held until the pension is named", async () => {
    renderSchedule();

    const dialog = openEntry("Add income line");
    const save = (): HTMLElement =>
      within(dialog).getByRole("button", { name: "Save" });

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "New job" },
    });
    commit(
      within(dialog).getByRole("textbox", { name: "Base salary" }),
      "80,000",
    );

    expect(save()).toBeEnabled();

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Pension" }),
      { target: { value: "new" } },
    );

    const pensionName = within(dialog).getByRole("textbox", {
      name: "Pension name",
    });
    const balance = within(dialog).getByRole("textbox", {
      name: "Pension balance",
    });

    expect(save()).toBeDisabled();
    expect(pensionName).toHaveValue("");
    expect(pensionName).not.toHaveAccessibleDescription();
    expect(balance).toHaveValue("£0");
    expect(balance).not.toHaveAccessibleDescription();
    expect(
      within(dialog).getByRole("textbox", { name: "Salary sacrifice" }),
    ).toHaveValue("0.00%");
    expect(
      within(dialog).getByRole("combobox", { name: "Pension owner" }),
    ).toHaveValue("1");

    fireEvent.change(pensionName, { target: { value: " Aviva " } });

    expect(save()).toBeEnabled();

    commit(balance, "2,500");
    commit(
      within(dialog).getByRole("textbox", { name: "Salary sacrifice" }),
      "5",
    );
    saved({ ...salary, feeds: 7, id: 5 });
    fireEvent.click(save());

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "New job" }),
      ).not.toBeInTheDocument();
    });
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      null,
      {
        amount: 80000,
        bonus: 0,
        cadence: "year",
        endsAfter: 0,
        endsAt: "retirement",
        feeds: null,
        firstYear: 2026,
        growth: "inflation",
        kind: "employment",
        lastMonth: null,
        lastYear: 2079,
        match: 0,
        name: "New job",
        opens: { balance: 2500, name: " Aviva ", owner: 1 },
        owner: 1,
        rsu: 0,
        sacrifice: 0.05,
        startsAt: null,
      },
      null,
    );
  });

  // The salary opens on its pension and its share. Choosing none takes
  // the share field and the share with it; choosing a pension again
  // brings the share back as the line opened with it; a share typed
  // stays across a change of pension, since the field stays; and the
  // category takes the pension row with the parts and brings both back
  // as the line opened with them.
  it("opens a salary's pension and share as they are, keeps them across the choices and writes an edit back", async () => {
    renderSchedule();
    saved({ ...salary, feeds: sipp.id, sacrifice: 0.05 });

    const dialog = openRow("Salary");
    const choice = within(dialog).getByRole("combobox", { name: "Pension" });
    const share = (): HTMLElement =>
      within(dialog).getByRole("textbox", { name: "Salary sacrifice" });

    expect(choice).toHaveValue(String(pension.id));
    expect(share()).toHaveValue("10.00%");

    fireEvent.change(choice, { target: { value: "none" } });

    expect(
      within(dialog).queryByRole("textbox", { name: "Salary sacrifice" }),
    ).not.toBeInTheDocument();

    fireEvent.change(choice, { target: { value: String(pension.id) } });

    expect(share()).toHaveValue("10.00%");

    commit(share(), "5");
    fireEvent.change(choice, { target: { value: String(sipp.id) } });

    expect(share()).toHaveValue("5.00%");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Category" }),
      { target: { value: "other" } },
    );

    expect(
      within(dialog).queryByRole("combobox", { name: "Pension" }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Category" }),
      { target: { value: "employment" } },
    );

    expect(
      within(dialog).getByRole("combobox", { name: "Pension" }),
    ).toHaveValue(String(pension.id));
    expect(share()).toHaveValue("10.00%");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Pension" }),
      { target: { value: String(sipp.id) } },
    );
    commit(share(), "5");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Salary" }),
      ).not.toBeInTheDocument();
    });
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      16,
      {
        amount: 120000,
        bonus: 15000,
        cadence: "year",
        endsAfter: 0,
        endsAt: null,
        feeds: sipp.id,
        firstYear: 2026,
        floor: 0,
        growth: "inflation-plus-1",
        kind: "employment",
        lastMonth: null,
        lastYear: 2048,
        match: 0,
        name: "Salary",
        opens: null,
        owner: 1,
        rsu: 12000,
        sacrifice: 0.05,
        startsAt: null,
      },
      salary,
    );
  });

  // Born in 1990 and retiring at 30, the owner retired in 2020, before
  // the plan starts, and a salary ending then would end before it
  // started; it runs with the plan instead, and the dialog says that it
  // is never paid.
  it("opens a new line running with the plan once its owner has retired, and says it is never paid", () => {
    render(
      <IncomeSchedule
        accounts={accounts}
        lines={incomeLines}
        milestones={milestones}
        owners={owners}
        plan={retiringAt(plan, 30)}
      />,
    );

    const dialog = openEntry("Add income line");

    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "open",
    );
    expect(
      within(dialog).getByText("Never paid; its owner retires in 2020."),
    ).toBeInTheDocument();
  });

  // Retiring at 59, the owner retires in 2049, so a salary running with
  // the plan is paid to 2048: its row draws it to there, tied to
  // retirement, and its dialog says where its pay stops and draws its
  // bar that far.
  it("draws a salary to retirement, where its pay stops, whatever its end says", () => {
    render(
      <IncomeSchedule
        accounts={accounts}
        lines={[{ ...salary, lastYear: null }]}
        milestones={milestones}
        owners={owners}
        plan={retiring}
      />,
    );

    expect(screen.getByText("2026–2048")).toHaveClass("figure");
    expect(screen.getAllByText("Until Retirement")).toHaveLength(2);
    expect(
      screen.getAllByText(bySlot("span-bar-fill"), { suggest: false })[0],
    ).toHaveStyle({ width: `${String((23 / 53) * 100)}%` });

    const dialog = openRow("Salary");

    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "open",
    );
    expect(
      within(dialog).getByText("Paid to 2048, when its owner retires."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(bySlot("span-bar-fill"), { suggest: false }),
    ).toHaveStyle({ width: `${String((23 / 53) * 100)}%` });
  });

  it("adds a named line ending in a year and reports it", async () => {
    renderSchedule();

    const dialog = openEntry("Add income line");

    expect(within(dialog).getByText("New income line")).toHaveClass(
      "text-brand",
    );
    expect(
      within(dialog).getByRole("heading", { name: "Untitled line" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    // A new salary ends at retirement, which the fixture's plan has in
    // 2080, the year after it ends.
    expect(within(dialog).getByRole("combobox", { name: "Ends" })).toHaveValue(
      "retirement",
    );
    expect(
      within(dialog).queryByRole("textbox", { name: "Last year" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: "Years after" }),
    ).toHaveAccessibleDescription("Runs to 2079.");
    expect(within(dialog).getByText("Plan · 2026–2079")).toHaveClass("label");
    expect(
      within(dialog).getByRole("textbox", { name: "Base salary" }),
    ).toHaveValue("£0");
    expect(
      within(dialog).getByRole("textbox", { name: "Bonus" }),
    ).toHaveAccessibleDescription("At the salary's cadence");
    expect(
      within(dialog).getByRole("textbox", { name: "RSUs" }),
    ).toHaveAccessibleDescription("Vesting at the salary's cadence");
    expect(within(dialog).getByRole("textbox", { name: "Bonus" })).toHaveValue(
      "£0",
    );
    expect(within(dialog).getByRole("textbox", { name: "RSUs" })).toHaveValue(
      "£0",
    );
    // Every kind is offered but the State Pension, which is no line
    // typed.
    expect(
      within(within(dialog).getByRole("combobox", { name: "Category" }))
        .getAllByRole("option")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Employment", "Self-employment", "Pension", "Other"]);
    expect(
      within(
        within(dialog).getByRole("combobox", { name: "Growth" }),
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

    // A line of another kind has no parts and no pension: the fields
    // go, and the bonus typed before the change goes with them.
    expect(
      within(dialog).queryByRole("textbox", { name: "Base salary" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("combobox", { name: "Pension" }),
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
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Growth" }), {
      target: { value: "inflation-plus-2" },
    });
    commit(within(dialog).getByRole("textbox", { name: "First year" }), "2030");

    expect(
      within(dialog).getByRole("textbox", { name: "First year" }),
    ).toHaveAccessibleDescription("Age 40");

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Ends" }), {
      target: { value: "fixed" },
    });

    // An end moved off a milestone stays where the milestone had it until
    // told otherwise.
    expect(
      within(dialog).getByRole("textbox", { name: "Last year" }),
    ).toHaveValue("2079");

    commit(within(dialog).getByRole("textbox", { name: "Last year" }), "2035");

    expect(
      within(dialog).getByRole("textbox", { name: "Last year" }),
    ).toHaveAccessibleDescription("Age 45");
    expect(
      within(dialog).getByRole("heading", { name: "Bonus scheme" }),
    ).toBeInTheDocument();

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<IncomeLine>>();
    vi.mocked(saveIncomeLine).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      null,
      {
        amount: 12000,
        bonus: 0,
        cadence: "month",
        endsAfter: 0,
        endsAt: null,
        feeds: null,
        firstYear: 2030,
        floor: 0,
        growth: "inflation-plus-2",
        kind: "self-employment",
        lastMonth: null,
        lastYear: 2035,
        match: 0,
        name: "Bonus scheme",
        opens: null,
        owner: 1,
        rsu: 0,
        sacrifice: 0,
        startsAt: null,
      },
      null,
    );
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("dialog", { name: "Bonus scheme" })).toBeVisible();

    answer(
      accepted({
        amount: 12000,
        bonus: 0,
        cadence: "month",
        endsAfter: 0,
        endsAt: null,
        feeds: null,
        firstYear: 2030,
        growth: "inflation-plus-2",
        id: 5,
        kind: "self-employment",
        lastMonth: null,
        lastYear: 2035,
        match: 0,
        name: "Bonus scheme",
        owner: 1,
        rsu: 0,
        sacrifice: 0,
        startsAt: null,
      }),
    );

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

    let dialog = openEntry("Add income line");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Consulting" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Base salary" }), "");
    commit(within(dialog).getByRole("textbox", { name: "Bonus" }), "");
    commit(within(dialog).getByRole("textbox", { name: "First year" }), "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openEntry("Add income line");

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
    renderSchedule([...incomeLines, annuity]);
    saved({ ...annuity, lastYear: 2070 });

    const dialog = openRow("Annuity");

    expect(within(dialog).getByText("Edit income line")).toHaveClass(
      "text-brand",
    );
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Annuity",
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
      within(dialog).getByRole("combobox", { name: "Growth" }),
    ).toHaveValue("inflation");
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
        screen.queryByRole("dialog", { name: "Annuity" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Income line updated" }),
    ).toHaveAccessibleDescription("Annuity · 2058–2070");
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      annuity.id,
      {
        amount: 23400,
        bonus: 0,
        cadence: "year",
        endsAfter: 0,
        endsAt: null,
        feeds: null,
        firstYear: 2058,
        growth: "inflation",
        kind: "pension",
        lastMonth: null,
        lastYear: 2070,
        match: 0,
        name: "Annuity",
        opens: null,
        owner: 1,
        rsu: 0,
        sacrifice: 0,
        startsAt: null,
      },
      annuity,
    );
  });

  // The salary matched to seven per cent of its base and floored at
  // three, so the match and the floor are seen to go with the category
  // and come back with it.
  it("opens an employment line's parts as they are, keeps them across the category and writes an edit back", async () => {
    renderSchedule([{ ...salary, floor: 0.03, match: 0.07 }]);
    saved({ ...salary, floor: 0.03, match: 0.07, rsu: 20000 });

    const dialog = openRow("Salary");

    expect(
      within(dialog).getByRole("textbox", { name: "Base salary" }),
    ).toHaveValue("£120,000");
    expect(within(dialog).getByRole("textbox", { name: "Bonus" })).toHaveValue(
      "£15,000",
    );
    expect(within(dialog).getByRole("textbox", { name: "RSUs" })).toHaveValue(
      "£12,000",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Employer match" }),
    ).toHaveValue("7.00%");

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
    expect(
      within(dialog).getByRole("textbox", { name: "Employer match" }),
    ).toHaveValue("7.00%");
    expect(
      within(dialog).getByRole("textbox", { name: "Employer minimum" }),
    ).toHaveValue("3.00%");

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
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      16,
      {
        amount: 120000,
        bonus: 15000,
        cadence: "year",
        endsAfter: 0,
        endsAt: null,
        feeds: 6,
        firstYear: 2026,
        floor: 0.03,
        growth: "inflation-plus-1",
        kind: "employment",
        lastMonth: null,
        lastYear: 2048,
        match: 0.07,
        name: "Salary",
        opens: null,
        owner: 1,
        rsu: 20000,
        sacrifice: 0.1,
        startsAt: null,
      },
      { ...salary, floor: 0.03, match: 0.07 },
    );
  });

  // February is month one, January being nought. A line naming no
  // cadence for its bonus is paid it every month, and one moved there
  // names neither the cadence nor a month.
  it("pays a salary's bonus once a year in a month chosen, keeps it across the category, and writes it back", async () => {
    renderSchedule();
    saved({ ...salary, bonusCadence: "year", bonusMonth: 1 });

    const dialog = openRow("Salary");
    const paid = (): HTMLElement =>
      within(dialog).getByRole("combobox", { name: "Bonus paid" });

    fireEvent.change(paid(), { target: { value: "year" } });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Bonus month" }),
      { target: { value: "1" } },
    );
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Category" }),
      { target: { value: "pension" } },
    );
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Category" }),
      { target: { value: "employment" } },
    );

    expect(paid()).toHaveValue("month");
    expect(
      within(dialog).queryByRole("combobox", { name: "Bonus month" }),
    ).not.toBeInTheDocument();

    fireEvent.change(paid(), { target: { value: "quarter" } });
    fireEvent.change(paid(), { target: { value: "year" } });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Bonus month" }),
      { target: { value: "1" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Salary" }),
      ).not.toBeInTheDocument();
    });
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      id,
      {
        ...salaryValues,
        bonusCadence: "year",
        bonusMonth: 1,
        floor: 0,
        opens: null,
      },
      salary,
    );
  });

  it("drops the month of a bonus moved off once a year, and the cadence of one moved to every month", async () => {
    renderSchedule([{ ...salary, bonusCadence: "year", bonusMonth: 1 }]);
    saved(salary);

    const dialog = openRow("Salary");
    const paid = within(dialog).getByRole("combobox", { name: "Bonus paid" });

    expect(
      within(dialog).getByRole("combobox", { name: "Bonus month" }),
    ).toHaveValue("1");

    fireEvent.change(paid, { target: { value: "quarter" } });

    expect(
      within(dialog).queryByRole("combobox", { name: "Bonus month" }),
    ).not.toBeInTheDocument();

    fireEvent.change(paid, { target: { value: "month" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
        id,
        { ...salaryValues, opens: null },
        { ...salary, bonusCadence: "year", bonusMonth: 1 },
      );
    });
  });

  it("holds the save while the line ends before it starts, and frees it when it runs to the end", async () => {
    renderSchedule();
    saved({ ...salary, lastYear: null });

    const dialog = openRow("Salary");

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
    ).toHaveAccessibleDescription("Salary · 2026 on");
    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      16,
      {
        amount: 120000,
        bonus: 15000,
        cadence: "year",
        endsAfter: 0,
        endsAt: null,
        feeds: 6,
        firstYear: 2050,
        growth: "inflation-plus-1",
        kind: "employment",
        lastMonth: null,
        lastYear: null,
        match: 0,
        name: "Salary",
        opens: null,
        owner: 1,
        rsu: 12000,
        sacrifice: 0.1,
        startsAt: null,
      },
      salary,
    );
  });

  // Every line is somebody's: the salary opens on its owner, and is
  // given to Sam, whom the plan carries as the page's owners do.
  it("opens a line on the owner who earns it, and writes another back", async () => {
    render(
      <IncomeSchedule
        accounts={accounts}
        lines={incomeLines}
        milestones={milestones}
        owners={[...owners, sam]}
        plan={{ ...plan, owners: [...plan.owners, sam] }}
      />,
      { wrapper: Toaster },
    );
    saved({ ...salary, owner: sam.id });

    const dialog = openRow("Salary");
    const owner = within(dialog).getByRole("combobox", { name: "Owner" });

    expect(owner).toHaveValue("1");
    expect(owner).not.toHaveAccessibleDescription();
    expect(
      within(owner)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Me", "Sam"]);

    fireEvent.change(owner, { target: { value: String(sam.id) } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const { id, ...values } = salary;

    expect(saveIncomeLine).toHaveBeenCalledExactlyOnceWith(
      id,
      { ...values, opens: null, owner: sam.id },
      salary,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Salary" }),
      ).not.toBeInTheDocument();
    });
  });
});
