import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CarDraft } from "@/data/cars";
import type { LoanFigure } from "@/lib/figures";

import { golfValues } from "@/data/cars.fixture";
import { plan } from "@/data/income.fixture";
import { commit, field, select } from "@/test/dom";

import { CarFields } from "./car-fields";

// The Golf as a draft: £14,000 owed at 7.9%, £290 a month, over the
// three years the agreement has left, towards a £6,000 balloon. The end
// of the term is counted from the fixture plan's September 2026, so the
// three years run to August 2029.
const golf: CarDraft = { ...golfValues, term: 3 };

const refinanced = "Refinanced on the same terms when the agreement ends";

const workedHint = "Worked out from the other two";

// What the dialog shows the fields: which figure it worked out, what it
// came to, and the years the payments run in all, which is 4.9 for the
// Golf unless a test says otherwise.
interface Shown {
  readonly clears?: null | number;
  readonly figure: null | number;
  readonly worked: LoanFigure;
}

// The fields as the dialog would mount them, shown the draft and what
// the dialog worked out, with a spy where the dialog listens.
function renderFields(
  draft: CarDraft,
  shown: Shown,
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<CarDraft>) => void>
  >;
  readonly rerender: (figure: null | number, clears?: null | number) => void;
} {
  const onAmend = vi.fn<(patch: Partial<CarDraft>) => void>();
  const onWork = vi.fn<(worked: LoanFigure) => void>();
  const clears = shown.clears ?? 4.86;
  const view = render(
    <CarFields
      clears={clears}
      draft={draft}
      figure={shown.figure}
      initial={draft}
      onAmend={onAmend}
      onWork={onWork}
      plan={plan}
      worked={shown.worked}
    />,
  );
  return {
    onAmend,
    rerender: (next, nextClears = clears): void => {
      view.rerender(
        <CarFields
          clears={nextClears}
          draft={draft}
          figure={next}
          initial={draft}
          onAmend={onAmend}
          onWork={onWork}
          plan={plan}
          worked={shown.worked}
        />,
      );
    },
  };
}

describe("CarFields", () => {
  it("mounts every field on the draft, shows the worked-out payment by value and reports each change", () => {
    const { onAmend } = renderFields(golf, { figure: 290, worked: "payment" });

    expect(field("Name")).toHaveValue("Golf");
    expect(screen.getByRole("combobox", { name: "Agreement" })).toHaveValue(
      "pcp",
    );
    expect(field("Value")).toHaveValue("£18,000");
    expect(field("Value")).toHaveAccessibleDescription(
      "What it would sell for in September 2026",
    );
    expect(field("Depreciation")).toHaveValue("15.00%");
    expect(field("Balance owed")).toHaveValue("£14,000");
    expect(field("Rate")).toHaveValue("7.90%");
    expect(field("Rate")).toHaveAccessibleDescription(
      "A year, compounding monthly",
    );
    expect(field("Monthly payment")).toHaveValue("£290");
    expect(field("Monthly payment")).toHaveAccessibleDescription(workedHint);
    expect(select("Agreement ends")).toHaveDisplayValue("August");
    expect(select("Agreement ends")).toHaveAccessibleDescription(
      "When the last payment falls",
    );
    expect(field("Year")).toHaveValue("2029");
    expect(field("Year")).toHaveAccessibleDescription("3 years left");
    expect(field("Balloon")).toHaveValue("£6,000");
    expect(field("Balloon")).toHaveAccessibleDescription(
      `${refinanced}, so the payments run 4.9 years in all`,
    );

    fireEvent.change(field("Name"), { target: { value: "Polo" } });
    commit(field("Value"), "12,000");
    commit(field("Depreciation"), "20");
    commit(field("Balance owed"), "10,000");
    commit(field("Rate"), "6.9");
    fireEvent.change(select("Agreement ends"), { target: { value: "1" } });
    commit(field("Year"), "2030");
    commit(field("Balloon"), "4,000");
    fireEvent.change(screen.getByRole("combobox", { name: "Agreement" }), {
      target: { value: "loan" },
    });

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { name: "Polo" },
      { value: 12000 },
      { depreciation: 0.2 },
      { balance: 10000 },
      { rate: 0.069 },
      { term: 2.5 },
      { term: 4 },
      { balloon: 4000 },
      { agreement: "loan" },
    ]);
  });

  it("holds what is owed, paid and left as a balloon at nothing or above", () => {
    const { onAmend } = renderFields(golf, { figure: 3, worked: "term" });

    commit(field("Balance owed"), "-10,000");
    commit(field("Monthly payment"), "-250");
    commit(field("Balloon"), "-4,000");

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { balance: 0 },
      { payment: 0 },
      { balloon: 0 },
    ]);
  });

  it("shows a worked-out rate, and an error when none fits", () => {
    const { rerender } = renderFields(golf, { figure: 0.0792, worked: "rate" });

    expect(field("Rate")).toHaveValue("7.92%");
    expect(field("Rate")).toHaveAccessibleDescription(workedHint);
    expect(field("Rate")).not.toHaveAttribute("aria-invalid");
    expect(field("Monthly payment")).toHaveValue("£290");
    expect(field("Monthly payment")).toHaveAccessibleDescription("A month");

    rerender(null);

    expect(field("Rate")).toHaveValue("");
    expect(field("Rate")).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("No rate reaches the balloon over the term"),
    ).toHaveClass("text-destructive");
  });

  // A PCP's payment that never reaches the balloon never clears the whole
  // either, so the balloon says only that it is refinanced, and the end
  // shows no month and no year. The end is worked out, so it is held.
  it("shows a worked-out end, and says when the payment never reaches the balloon", () => {
    const { rerender } = renderFields(golf, { figure: 3, worked: "term" });

    expect(select("Agreement ends")).toHaveDisplayValue("August");
    expect(select("Agreement ends")).toBeDisabled();
    expect(select("Agreement ends")).toHaveAccessibleDescription(workedHint);
    expect(field("Year")).toHaveValue("2029");

    rerender(null, null);

    expect(select("Agreement ends")).toHaveDisplayValue("—");
    expect(select("Agreement ends")).toHaveAccessibleDescription(
      "Never, at this payment",
    );
    expect(field("Year")).toHaveValue("");
    expect(field("Year")).toHaveAccessibleDescription(
      "Never reaches the balloon at this payment, so the payments run to the end of the plan",
    );
    expect(field("Balloon")).toHaveAccessibleDescription(refinanced);
  });

  it("shows a loan with no balloon, and says when the payment never clears it", () => {
    const { rerender } = renderFields(
      { ...golf, agreement: "loan", balloon: 0, payment: 438 },
      { figure: 3, worked: "term" },
    );

    expect(
      screen.queryByRole("textbox", { name: "Balloon" }),
    ).not.toBeInTheDocument();
    expect(select("Last payment")).toHaveDisplayValue("August");
    expect(select("Last payment")).toHaveAccessibleDescription(workedHint);
    expect(
      screen.queryByRole("combobox", { name: "Agreement ends" }),
    ).not.toBeInTheDocument();

    rerender(null);

    expect(field("Year")).toHaveAccessibleDescription(
      "Never clears at this payment, so the payments run to the end of the plan",
    );
  });

  it("shows no finance fields for a car owned outright", () => {
    renderFields(
      { ...golf, agreement: "outright" },
      { figure: 0, worked: "payment" },
    );

    expect(field("Value")).toHaveValue("£18,000");
    for (const name of [
      "Balance owed",
      "Rate",
      "Monthly payment",
      "Year",
      "Balloon",
    ]) {
      expect(screen.queryByRole("textbox", { name })).not.toBeInTheDocument();
    }
    for (const name of ["Agreement ends", "Work out"]) {
      expect(screen.queryByRole("combobox", { name })).not.toBeInTheDocument();
    }
  });
});
