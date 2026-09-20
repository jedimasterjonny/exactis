import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Share } from "@/data/accounts";

import { incomeLines } from "@/data/income.fixture";

import { SacrificeFields } from "./sacrifice-fields";

// The fixture's salary and its step-up, both feeding the workplace
// pension: the salary 12% of its £120,000 a year, the step-up a
// twentieth of £14,500 a month.
const [salary, stepUp] = incomeLines;

const feeders = [
  salary,
  { ...stepUp, amount: 14500, cadence: "month", feeds: 1, sacrifice: 0.05 },
] as const;

const shares: readonly Share[] = [
  { line: salary.id, sacrifice: 0.12 },
  { line: stepUp.id, sacrifice: 0.05 },
];

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function field(name: string): HTMLElement {
  return screen.getByRole("textbox", { name });
}

// The fields as the dialog would mount them, opened on the shares and
// shown the draft that mirrors them, with a spy where the dialog
// listens.
function renderFields(
  initial: readonly Share[] = shares,
  draft: readonly Share[] = initial,
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(shares: readonly Share[]) => void>
  >;
} {
  const onAmend = vi.fn<(shares: readonly Share[]) => void>();
  render(
    <SacrificeFields
      draft={draft}
      feeders={feeders}
      initial={initial}
      onAmend={onAmend}
    />,
  );
  return { onAmend };
}

describe("SacrificeFields", () => {
  // £14,400 a year with the NI saved is £16,560; £725 a month with it
  // is £833.75, twelve times over.
  it("mounts a share per salary feeding the pension, saying what each lands a year", () => {
    renderFields();

    expect(field("Sacrificed from Salary")).toHaveValue("12.00%");
    expect(field("Sacrificed from Salary")).toHaveAccessibleDescription(
      "Of its £120,000 base; £16,560 a year lands with the NI saved",
    );
    expect(field("Sacrificed from Salary step-up")).toHaveValue("5.00%");
    expect(field("Sacrificed from Salary step-up")).toHaveAccessibleDescription(
      "Of its £14,500 base; £10,005 a year lands with the NI saved",
    );
  });

  // The shares report whole, with the one typed written over, since a
  // share is one of a list rather than a field of the draft; a share
  // past the whole of the base commits as the whole.
  it("reports the shares whole with the typed one written over, held to the base", () => {
    const { onAmend } = renderFields();

    commit(field("Sacrificed from Salary"), "8");
    commit(field("Sacrificed from Salary step-up"), "150");

    expect(onAmend.mock.calls.map(([held]) => held)).toStrictEqual([
      [
        { line: salary.id, sacrifice: 0.08 },
        { line: stepUp.id, sacrifice: 0.05 },
      ],
      [
        { line: salary.id, sacrifice: 0.12 },
        { line: stepUp.id, sacrifice: 1 },
      ],
    ]);
  });

  // What lands is read off the draft, so it moves as the share is
  // typed, while the field itself keeps what it mounted on.
  it("says what the draft's share lands beneath the field it mounted on", () => {
    renderFields(shares, [
      { line: salary.id, sacrifice: 0.05 },
      { line: stepUp.id, sacrifice: 0.05 },
    ]);

    expect(field("Sacrificed from Salary")).toHaveValue("12.00%");
    expect(field("Sacrificed from Salary")).toHaveAccessibleDescription(
      "Of its £120,000 base; £6,900 a year lands with the NI saved",
    );
  });

  // The dialog hands the fields a share per feeder, but the list is a
  // list: a feeder it leaves out mounts on nothing and lands nothing.
  it("takes a feeder the shares leave out as sacrificing nothing", () => {
    renderFields([{ line: salary.id, sacrifice: 0.12 }]);

    expect(field("Sacrificed from Salary step-up")).toHaveValue("0.00%");
    expect(field("Sacrificed from Salary step-up")).toHaveAccessibleDescription(
      "Of its £14,500 base; £0 a year lands with the NI saved",
    );
  });
});
