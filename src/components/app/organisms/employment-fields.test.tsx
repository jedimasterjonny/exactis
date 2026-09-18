import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { IncomeLineValues } from "@/data/income";

import { EmploymentFields } from "./employment-fields";

// The reference's salary as a draft: £120,000 of base with £15,000 of
// bonus and £12,000 of RSUs on top, sacrificing a tenth of the base into
// the workplace pension.
const salary: IncomeLineValues = {
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
  initial: IncomeLineValues,
  draft: IncomeLineValues = initial,
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<IncomeLineValues>) => void>
  >;
} {
  const onAmend = vi.fn<(patch: Partial<IncomeLineValues>) => void>();
  render(
    <EmploymentFields
      draft={draft}
      initial={initial}
      onAmend={onAmend}
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
    ).toStrictEqual(["None", "Workplace pension", "SIPP"]);
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
      sacrifice: 0.05,
    });
  });
});
