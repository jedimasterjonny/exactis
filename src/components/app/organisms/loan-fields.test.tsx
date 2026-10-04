import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LoanFigure } from "@/lib/figures";

import { plan } from "@/data/income.fixture";
import { commit, field } from "@/test/dom";

import type { LoanDraft, LoanWords } from "./loan-fields";

import { LoanFields } from "./loan-fields";

// A loan of £14,000 at 7.9%, £290 a month, over three years, which run
// to August 2029 counted from the fixture plan's September 2026.
const loan: LoanDraft = { balance: 14000, payment: 290, rate: 0.079, term: 3 };

// Words of neither asset, so a test reads the caller's back off the
// field they were given for.
const words: LoanWords = {
  balance: "Owed",
  end: "Ends",
  never: "Never, so to the end of the plan",
  noRate: "No rate fits",
};

const workedHint = "Worked out from the other two";

// The fields as an asset's would mount them, shown the draft and what
// the dialog worked out, with a spy where the dialog listens.
function renderFields(
  worked: LoanFigure,
  figure: null | number,
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<LoanDraft>) => void>
  >;
  readonly onWork: ReturnType<typeof vi.fn<(worked: LoanFigure) => void>>;
} {
  const onAmend = vi.fn<(patch: Partial<LoanDraft>) => void>();
  const onWork = vi.fn<(worked: LoanFigure) => void>();
  render(
    <LoanFields
      draft={loan}
      figure={figure}
      onAmend={onAmend}
      onWork={onWork}
      plan={plan}
      words={words}
      worked={worked}
    />,
  );
  return { onAmend, onWork };
}

describe("LoanFields", () => {
  // The payment is worked out, so it is read-only and says so, and the
  // rate and the end are typed; the end's year says the years it comes
  // to. A month or a year picked reports the term whose last payment
  // falls in it.
  it("names the fields in the caller's words, shows the worked-out figure read-only and reports each change", () => {
    const { onAmend } = renderFields("payment", 290);

    expect(field("Owed")).toHaveValue("£14,000");
    expect(screen.getByRole("combobox", { name: "Work out" })).toHaveValue(
      "payment",
    );
    expect(field("Rate")).toHaveValue("7.90%");
    expect(field("Rate")).toHaveAccessibleDescription(
      "A year, compounding monthly",
    );
    expect(field("Rate")).not.toHaveAttribute("readonly");
    expect(field("Monthly payment")).toHaveValue("£290");
    expect(field("Monthly payment")).toHaveAccessibleDescription(workedHint);
    expect(field("Monthly payment")).toHaveAttribute("readonly");
    expect(screen.getByRole("combobox", { name: "Ends" })).toHaveDisplayValue(
      "August",
    );
    expect(screen.getByRole("combobox", { name: "Ends" })).toBeEnabled();
    expect(
      screen.getByRole("combobox", { name: "Ends" }),
    ).toHaveAccessibleDescription("When the last payment falls");
    expect(field("Year")).toHaveValue("2029");
    expect(field("Year")).toHaveAccessibleDescription("3 years left");

    commit(field("Owed"), "-10,000");
    commit(field("Rate"), "6.9");
    fireEvent.change(screen.getByRole("combobox", { name: "Ends" }), {
      target: { value: "1" },
    });
    commit(field("Year"), "2030");

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { balance: 0 },
      { rate: 0.069 },
      { term: 2.5 },
      { term: 4 },
    ]);
  });

  it("reports which figure is chosen to be worked out", () => {
    const { onWork } = renderFields("payment", 290);

    fireEvent.change(screen.getByRole("combobox", { name: "Work out" }), {
      target: { value: "rate" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Work out" }), {
      target: { value: "term" },
    });

    expect(onWork.mock.calls).toStrictEqual([["rate"], ["term"]]);
  });

  it("says in the caller's words when no rate fits", () => {
    const { onAmend } = renderFields("rate", null);

    expect(field("Rate")).toHaveValue("");
    expect(field("Rate")).toHaveAttribute("aria-invalid", "true");
    expect(field("Rate")).toHaveAttribute("readonly");
    expect(screen.getByText("No rate fits")).toHaveClass("text-destructive");
    expect(field("Monthly payment")).toHaveAccessibleDescription("A month");

    commit(field("Monthly payment"), "250");

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({ payment: 250 });
  });

  // A loan that never clears has no month to end in, so the end says
  // so and its year says no years.
  it("says in the caller's words when the payment never clears", () => {
    renderFields("term", null);
    const ends = screen.getByRole("combobox", { name: "Ends" });

    expect(ends).toHaveDisplayValue("—");
    expect(ends).toBeDisabled();
    expect(ends).toHaveAccessibleDescription("Never, at this payment");
    expect(field("Year")).toHaveValue("");
    expect(field("Year")).toHaveAttribute("readonly");
    expect(field("Year")).toHaveAccessibleDescription(
      "Never, so to the end of the plan",
    );
  });

  it("says a worked-out end was, and holds it", () => {
    renderFields("term", 3);

    expect(
      screen.getByRole("combobox", { name: "Ends" }),
    ).toHaveAccessibleDescription(workedHint);
    expect(screen.getByRole("combobox", { name: "Ends" })).toBeDisabled();
    expect(field("Year")).toHaveAccessibleDescription("3 years left");
  });
});
