import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { IncomeLineDraft } from "@/data/income";
import type { Owner } from "@/data/owners";

import { accounts, sipp } from "@/data/accounts.fixture";
import { incomeLines } from "@/data/income.fixture";
import { owners, sam } from "@/data/owners.fixture";
import { commit, field } from "@/test/dom";

import { EmploymentFields } from "./employment-fields";

// The reference's salary as a draft: £120,000 of base with £15,000 of
// bonus and £12,000 of RSUs on top, sacrificing a tenth of the base into
// the workplace pension, and opening none.
const [line] = incomeLines;
const salary: IncomeLineDraft = { ...line, opens: null };

// The workplace pension and a second, so the choice is a choice.
const [workplace] = accounts;
const pensions: readonly Account[] = [workplace, sipp];

// How a bonus is paid, as the fields report it.
type Timing = Pick<IncomeLineDraft, "bonusCadence" | "bonusMonth">;

// The fields as the dialog would mount them, opened on a line and shown
// the draft that mirrors them, with a spy where the schedule listens.
function renderFields(
  initial: IncomeLineDraft,
  draft: IncomeLineDraft = initial,
  held: readonly Owner[] = [...owners, sam],
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<IncomeLineDraft>) => void>
  >;
  readonly onTime: ReturnType<typeof vi.fn<(timing: Timing) => void>>;
} {
  const onAmend = vi.fn<(patch: Partial<IncomeLineDraft>) => void>();
  const onTime = vi.fn<(timing: Timing) => void>();
  render(
    <EmploymentFields
      draft={draft}
      initial={initial}
      onAmend={onAmend}
      onTime={onTime}
      owners={held}
      pensions={pensions}
    />,
  );
  return { onAmend, onTime };
}

describe("EmploymentFields", () => {
  it("mounts the parts and the pension the line opened with, and reports each change", () => {
    const { onAmend } = renderFields(salary);
    const choice = screen.getByRole("combobox", { name: "Pension" });

    expect(field("Bonus")).toHaveValue("£15,000");
    expect(field("Bonus")).toHaveAccessibleDescription(
      "At the salary's cadence",
    );
    expect(field("RSUs")).toHaveValue("£12,000");
    expect(field("RSUs")).toHaveAccessibleDescription(
      "Vesting at the salary's cadence",
    );
    expect(choice).toHaveValue("6");
    expect(choice).not.toHaveAccessibleDescription();
    expect(
      within(choice)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["None", "Workplace pension", "SIPP", "A new pension"]);
    expect(field("Salary sacrifice")).toHaveValue("10.00%");
    expect(field("Salary sacrifice")).toHaveAccessibleDescription(
      "Of the base alone",
    );
    expect(field("Employer match")).toHaveValue("0.00%");
    expect(field("Employer match")).toHaveAccessibleDescription(
      "Pound for pound, up to this share of the base",
    );
    expect(field("Employer minimum")).toHaveValue("0.00%");
    expect(field("Employer minimum")).toHaveAccessibleDescription(
      "Of the base, whatever is sacrificed",
    );

    commit(field("Bonus"), "20,000");
    commit(field("RSUs"), "14,000");
    commit(field("Salary sacrifice"), "8");
    commit(field("Employer minimum"), "3");
    commit(field("Employer match"), "7");

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { bonus: 20000 },
      { rsu: 14000 },
      { sacrifice: 0.08 },
      { floor: 0.03 },
      { match: 0.07 },
    ]);
  });

  // A new pension's own fields sit directly beneath the choice that
  // opens it, and the shares beneath them; the scheme reads as a minimum
  // and a maximum, so the employer's minimum sits between what is given
  // up and the match it caps at.
  it("lays the pension out as chosen, then a new pension's fields, then the shares given up, the employer's minimum and its match", () => {
    renderFields({
      ...salary,
      feeds: null,
      opens: { balance: 0, name: "Aviva", owner: 1 },
    });

    const order = [
      screen.getByRole("combobox", { name: "Pension" }),
      field("Pension name"),
      screen.getByRole("combobox", { name: "Pension owner" }),
      field("Salary sacrifice"),
      field("Employer minimum"),
      field("Employer match"),
    ];

    for (const [place, later] of order.slice(1).entries()) {
      expect(
        order[place]?.compareDocumentPosition(later) ??
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  // A share is at most the whole of the base, so 150 commits as 100.
  // £120,000, £15,000 and £12,000 a year come to £147,000.
  it("says what the base and its parts come to a year", () => {
    renderFields(salary);

    expect(screen.getByText("£147,000 a year")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  // The same parts left on a monthly salary are paid twelve times over,
  // which the total says before the line is saved.
  it("counts the parts of a monthly salary twelve times over", () => {
    renderFields(salary, { ...salary, cadence: "month" });

    expect(screen.getByText("£1,764,000 a year")).toBeInTheDocument();
  });

  // A line naming no cadence for its bonus is paid it every month, as
  // every line kept before the choice was is, and names no month.
  it("opens a bonus naming no cadence on every month, with no month to choose, and reports each choice", () => {
    const { onAmend, onTime } = renderFields(salary);
    const paid = screen.getByRole("combobox", { name: "Bonus paid" });

    expect(paid).toHaveValue("month");
    expect(paid).not.toHaveAccessibleDescription();
    expect(
      within(paid)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Every month", "Every quarter", "Once a year"]);
    expect(
      screen.queryByRole("combobox", { name: "Bonus month" }),
    ).not.toBeInTheDocument();

    fireEvent.change(paid, { target: { value: "quarter" } });
    fireEvent.change(paid, { target: { value: "year" } });
    fireEvent.change(paid, { target: { value: "month" } });

    expect(onTime.mock.calls.map(([timing]) => timing)).toStrictEqual([
      { bonusCadence: "quarter" },
      { bonusCadence: "year", bonusMonth: 0 },
      {},
    ]);
    expect(onAmend).not.toHaveBeenCalled();
  });

  // March, June, September and December are each quarter's last month.
  it("says which months a bonus paid every quarter lands in", () => {
    renderFields(salary, { ...salary, bonusCadence: "quarter" });

    expect(
      screen.getByRole("combobox", { name: "Bonus paid" }),
    ).toHaveAccessibleDescription("In March, June, September and December");
  });

  // February is month one, January being nought.
  it("opens a bonus paid once a year on its month, reports another, and comes back to it from another cadence", () => {
    const yearly = { ...salary, bonusCadence: "year", bonusMonth: 1 } as const;
    const { onAmend, onTime } = renderFields(yearly);
    const month = screen.getByRole("combobox", { name: "Bonus month" });

    expect(screen.getByRole("combobox", { name: "Bonus paid" })).toHaveValue(
      "year",
    );
    expect(month).toHaveValue("1");
    expect(within(month).getAllByRole("option")).toHaveLength(12);

    fireEvent.change(month, { target: { value: "2" } });
    const paid = screen.getByRole("combobox", { name: "Bonus paid" });
    fireEvent.change(paid, { target: { value: "quarter" } });
    fireEvent.change(paid, { target: { value: "year" } });

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { bonusMonth: 2 },
    ]);
    expect(onTime.mock.calls.map(([timing]) => timing)).toStrictEqual([
      { bonusCadence: "quarter" },
      { bonusCadence: "year", bonusMonth: 1 },
    ]);
  });

  it("holds the shares to the base they come out of", () => {
    const { onAmend } = renderFields(salary);

    commit(field("Salary sacrifice"), "150");
    commit(field("Employer minimum"), "150");
    commit(field("Employer match"), "150");

    expect(field("Salary sacrifice")).toHaveValue("100.00%");
    expect(field("Employer minimum")).toHaveValue("100.00%");
    expect(field("Employer match")).toHaveValue("100.00%");
    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { sacrifice: 1 },
      { floor: 1 },
      { match: 1 },
    ]);
  });

  it("opens a line feeding no pension on none, with no share to give up or match", () => {
    renderFields({ ...salary, feeds: null, sacrifice: 0 });

    expect(screen.getByRole("combobox", { name: "Pension" })).toHaveValue(
      "none",
    );
    expect(
      screen.queryByRole("textbox", { name: "Salary sacrifice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Employer match" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Employer minimum" }),
    ).not.toBeInTheDocument();
  });

  it("gives up nothing and is matched nothing when the pension goes", () => {
    const { onAmend } = renderFields({ ...salary, floor: 0.03, match: 0.07 });

    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "none" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      feeds: null,
      floor: 0,
      match: 0,
      opens: null,
      sacrifice: 0,
    });
  });

  // The share fields come back mounted on the shares the line opened
  // with, so the draft is given them back rather than the nothing the
  // choice of none left behind.
  it("takes back the shares the line opened with when a pension comes back", () => {
    const matched = { ...salary, floor: 0.03, match: 0.07 };
    const { onAmend } = renderFields(matched, {
      ...matched,
      feeds: null,
      floor: 0,
      match: 0,
      sacrifice: 0,
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "6" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      feeds: 6,
      floor: 0.03,
      match: 0.07,
      opens: null,
      sacrifice: 0.1,
    });
  });

  // The fields stay across a change of pension, so what was typed into
  // them stays with them.
  it("keeps typed shares across a change of pension", () => {
    const { onAmend } = renderFields(salary, {
      ...salary,
      floor: 0.04,
      match: 0.05,
      sacrifice: 0.05,
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "20" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      feeds: 20,
      floor: 0.04,
      match: 0.05,
      opens: null,
      sacrifice: 0.05,
    });
  });

  // A new pension is the choice after the pensions listed. Choosing it
  // opens the pension unnamed and holding nothing, which is what its
  // fields mount showing, and the share comes back as the line opened
  // with it, as it does with a listed pension.
  it("opens a new pension unnamed and holding nothing when one is chosen", () => {
    const { onAmend } = renderFields(salary, {
      ...salary,
      feeds: null,
      sacrifice: 0,
    });

    expect(
      screen.queryByRole("textbox", { name: "Pension name" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "new" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      feeds: null,
      match: 0,
      opens: { balance: 0, name: "", owner: 1 },
      sacrifice: 0.1,
    });
  });

  // The pension's name and balance report together, since the draft
  // holds the pension as one, each with the other as the draft has it.
  it("mounts on the pension the line opens, reports its name and balance, and drops it for a listed pension", () => {
    const opening = {
      ...salary,
      feeds: null,
      opens: { balance: 500, name: "Aviva", owner: 1 },
      sacrifice: 0.05,
    };
    const { onAmend } = renderFields(opening);

    expect(screen.getByRole("combobox", { name: "Pension" })).toHaveValue(
      "new",
    );
    expect(field("Salary sacrifice")).toHaveValue("5.00%");
    expect(field("Pension name")).not.toHaveAccessibleDescription();
    expect(field("Pension balance")).not.toHaveAccessibleDescription();

    fireEvent.change(field("Pension name"), { target: { value: "Nest" } });
    commit(field("Pension balance"), "1,000");
    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "6" },
    });

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { opens: { balance: 500, name: "Nest", owner: 1 } },
      { opens: { balance: 1000, name: "Aviva", owner: 1 } },
      { feeds: 6, match: 0, opens: null, sacrifice: 0.05 },
    ]);
  });

  // A pension the line opens belongs to an owner, the first until
  // another is chosen, and the choice reports with the rest of the
  // pension as the draft has it.
  it("asks whose the pension the line opens is, and reports the choice", () => {
    const opening = {
      ...salary,
      feeds: null,
      opens: { balance: 0, name: "Aviva", owner: 1 },
    };
    const { onAmend } = renderFields(opening);

    expect(screen.getByRole("combobox", { name: "Pension owner" })).toHaveValue(
      "1",
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Pension owner" }), {
      target: { value: "2" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      opens: { balance: 0, name: "Aviva", owner: 2 },
    });
  });

  // With no owner to give it, the pension opens belonging to none, and
  // the field says where one is added.
  it("opens a pension belonging to none while the plan has no owner", () => {
    const { onAmend } = renderFields(salary, salary, []);

    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "new" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      feeds: null,
      match: 0,
      opens: { balance: 0, name: "", owner: null },
      sacrifice: 0.1,
    });
  });

  it("holds the owner choice while the plan has no owner, and says where one is added", () => {
    renderFields(
      { ...salary, feeds: null, opens: { balance: 0, name: "", owner: null } },
      undefined,
      [],
    );

    expect(
      screen.getByRole("combobox", { name: "Pension owner" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Pension owner" }),
    ).toHaveAccessibleDescription("Add one on the accounts screen first");
  });
});
