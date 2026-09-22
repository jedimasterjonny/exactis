import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LoanFigure } from "@/lib/figures";

import type { LoanDraft, LoanWords } from "./loan-fields";

import { LoanFields } from "./loan-fields";

// A loan of £14,000 at 7.9%, £290 a month, over three years.
const loan: LoanDraft = { balance: 14000, payment: 290, rate: 0.079, term: 3 };

// The month the plan is read in, September 2026, which the end of the
// term is counted from: three years run to August 2029.
const plan = { from: 2026, month: 8 };

// Words of neither asset, so a test reads the caller's back off the
// field they were given for.
const words: LoanWords = {
  balance: "Owed",
  end: "Ends",
  never: "Never, so to the end of the plan",
  noRate: "No rate fits",
  term: "Years",
  typed: "As typed",
};

const workedHint = "Worked out from the other two";

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function field(name: string): HTMLElement {
  return screen.getByRole("textbox", { name });
}

// The fields as an asset's would mount them, shown the draft and what
// the dialog worked out, with a spy where the dialog listens.
function renderFields(
  worked: LoanFigure,
  figure: null | number,
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<LoanDraft>) => void>
  >;
} {
  const onAmend = vi.fn<(patch: Partial<LoanDraft>) => void>();
  render(
    <LoanFields
      draft={loan}
      figure={figure}
      onAmend={onAmend}
      plan={plan}
      words={words}
      worked={worked}
    />,
  );
  return { onAmend };
}

describe("LoanFields", () => {
  it("names the fields in the caller's words, shows the worked-out figure by value and reports each change", () => {
    const { onAmend } = renderFields("payment", 290);

    expect(field("Owed")).toHaveValue("£14,000");
    expect(field("Rate")).toHaveValue("7.90%");
    expect(field("Rate")).toHaveAccessibleDescription(
      "A year, compounding monthly",
    );
    expect(field("Monthly payment")).toHaveValue("£290");
    expect(field("Monthly payment")).toHaveAccessibleDescription(workedHint);
    expect(field("Years")).toHaveValue("3");
    expect(field("Years")).toHaveAccessibleDescription("As typed");
    expect(screen.getByRole("combobox", { name: "Ends" })).toHaveDisplayValue(
      "August",
    );
    expect(field("Year")).toHaveValue("2029");

    commit(field("Owed"), "-10,000");
    commit(field("Rate"), "6.9");
    commit(field("Monthly payment"), "250");
    commit(field("Years"), "4");
    fireEvent.change(screen.getByRole("combobox", { name: "Ends" }), {
      target: { value: "1" },
    });
    commit(field("Year"), "2030");

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { balance: 0 },
      { rate: 0.069 },
      { payment: 250 },
      { term: 4 },
      { term: 2.5 },
      { term: 4 },
    ]);
  });

  it("says in the caller's words when no rate fits", () => {
    renderFields("rate", null);

    expect(field("Rate")).toHaveValue("");
    expect(field("Rate")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("No rate fits")).toHaveClass("text-destructive");
    expect(field("Monthly payment")).toHaveAccessibleDescription("A month");
  });

  // A loan that never clears has no month to end in, so a month or a
  // year picked takes the other from the plan: December is four
  // payments from September, and a year on is thirteen.
  it("says in the caller's words when the payment never clears, and ends a term picked from the plan", () => {
    const { onAmend } = renderFields("term", null);
    const ends = screen.getByRole("combobox", { name: "Ends" });

    expect(field("Years")).toHaveValue("");
    expect(field("Years")).toHaveAccessibleDescription(
      "Never, so to the end of the plan",
    );
    expect(ends).toHaveDisplayValue("—");
    expect(ends).toHaveAccessibleDescription("Never, at this payment");
    expect(field("Year")).toHaveValue("");

    fireEvent.change(ends, { target: { value: "11" } });
    commit(field("Year"), "2027");

    const [december, yearOn] = onAmend.mock.calls.map(([patch]) => patch);

    expect(onAmend).toHaveBeenCalledTimes(2);
    expect(december?.term).toBeCloseTo(4 / 12, 10);
    expect(yearOn?.term).toBeCloseTo(13 / 12, 10);
  });

  it("says a worked-out term was, and that the month follows it", () => {
    renderFields("term", 3);

    expect(field("Years")).toHaveAccessibleDescription(workedHint);
    expect(
      screen.getByRole("combobox", { name: "Ends" }),
    ).toHaveAccessibleDescription("Worked out with the years left");
  });
});
