import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { IncomeLineDraft } from "@/data/income";

import { owners } from "@/data/owners.fixture";

import { EmploymentFields } from "./employment-fields";

// The reference's salary as a draft: £120,000 of base with £15,000 of
// bonus and £12,000 of RSUs on top, sacrificing a tenth of the base into
// the workplace pension.
const salary: IncomeLineDraft = {
  amount: 120000,
  bonus: 15000,
  cadence: "year",
  feeds: 1,
  firstYear: 2026,
  growth: "inflation-plus-1",
  kind: "employment",
  lastMonth: null,
  lastYear: 2048,
  name: "Salary",
  opens: null,
  rsu: 12000,
  sacrifice: 0.1,
};

// Two pensions, so the choice is a choice.
const pensions: readonly Account[] = [
  {
    balance: 412880,
    growth: { kind: "plan" },
    id: 1,
    kind: "tax-deferred",
    name: "Workplace pension",
  },
  {
    balance: 0,
    growth: { kind: "plan" },
    id: 6,
    kind: "tax-deferred",
    name: "SIPP",
  },
];

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function field(name: string): HTMLElement {
  return screen.getByRole("textbox", { name });
}

// The fields as the dialog would mount them, opened on a line and shown
// the draft that mirrors them, with a spy where the schedule listens.
function renderFields(
  initial: IncomeLineDraft,
  draft: IncomeLineDraft = initial,
  held: readonly { readonly id: number; readonly name: string }[] = [
    ...owners,
    { id: 2, name: "Sam" },
  ],
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<IncomeLineDraft>) => void>
  >;
} {
  const onAmend = vi.fn<(patch: Partial<IncomeLineDraft>) => void>();
  render(
    <EmploymentFields
      draft={draft}
      initial={initial}
      onAmend={onAmend}
      owners={held}
      pensions={pensions}
    />,
  );
  return { onAmend };
}

describe("EmploymentFields", () => {
  it("mounts the parts and the pension the line opened with, and reports each change", () => {
    const { onAmend } = renderFields(salary);
    const choice = screen.getByRole("combobox", { name: "Pension" });

    expect(field("Bonus")).toHaveValue("£15,000");
    expect(field("Bonus")).toHaveAccessibleDescription(
      "At the salary's cadence; nothing for none",
    );
    expect(field("RSUs")).toHaveValue("£12,000");
    expect(field("RSUs")).toHaveAccessibleDescription(
      "Vesting at the salary's cadence",
    );
    expect(choice).toHaveValue("1");
    expect(choice).toHaveAccessibleDescription(
      "Fed by salary sacrifice, with the employer's NI saved",
    );
    expect(
      within(choice)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["None", "Workplace pension", "SIPP", "A new pension"]);
    expect(field("Salary sacrifice")).toHaveValue("10.00%");
    expect(field("Salary sacrifice")).toHaveAccessibleDescription(
      "Of the base alone",
    );

    commit(field("Bonus"), "20,000");
    commit(field("RSUs"), "14,000");
    commit(field("Salary sacrifice"), "8");

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { bonus: 20000 },
      { rsu: 14000 },
      { sacrifice: 0.08 },
    ]);
  });

  // A share is at most the whole of the base, so 150 commits as 100.
  it("holds the share to the base it comes out of", () => {
    const { onAmend } = renderFields(salary);

    commit(field("Salary sacrifice"), "150");

    expect(field("Salary sacrifice")).toHaveValue("100.00%");
    expect(onAmend).toHaveBeenCalledExactlyOnceWith({ sacrifice: 1 });
  });

  it("opens a line feeding no pension on none, with no share to give up", () => {
    renderFields({ ...salary, feeds: null, sacrifice: 0 });

    expect(screen.getByRole("combobox", { name: "Pension" })).toHaveValue(
      "none",
    );
    expect(
      screen.queryByRole("textbox", { name: "Salary sacrifice" }),
    ).not.toBeInTheDocument();
  });

  it("gives up nothing when the pension goes", () => {
    const { onAmend } = renderFields(salary);

    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "none" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      feeds: null,
      opens: null,
      sacrifice: 0,
    });
  });

  // The share field comes back mounted on the share the line opened
  // with, so the draft is given it back rather than the nothing the
  // choice of none left behind.
  it("takes back the share the line opened with when a pension comes back", () => {
    const { onAmend } = renderFields(salary, {
      ...salary,
      feeds: null,
      sacrifice: 0,
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "1" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      feeds: 1,
      opens: null,
      sacrifice: 0.1,
    });
  });

  // The field stays across a change of pension, so what was typed into
  // it stays with it.
  it("keeps a typed share across a change of pension", () => {
    const { onAmend } = renderFields(salary, { ...salary, sacrifice: 0.05 });

    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "6" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({
      feeds: 6,
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
    expect(field("Pension name")).toHaveAccessibleDescription(
      "Opened with the salary, growing at the plan rate",
    );
    expect(field("Pension balance")).toHaveAccessibleDescription(
      "What it holds today; nothing for one just opened",
    );

    fireEvent.change(field("Pension name"), { target: { value: "Nest" } });
    commit(field("Pension balance"), "1,000");
    fireEvent.change(screen.getByRole("combobox", { name: "Pension" }), {
      target: { value: "1" },
    });

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { opens: { balance: 500, name: "Nest", owner: 1 } },
      { opens: { balance: 1000, name: "Aviva", owner: 1 } },
      { feeds: 1, opens: null, sacrifice: 0.05 },
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
